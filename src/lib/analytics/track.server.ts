import { OTHER_PATH, UNKNOWN_COUNTRY, type Kind } from './visit';
import { classify, deviceClass } from './userAgent';
import { utcDay } from './ranges';
import { afterResponse } from '$lib/server/bindings';
import type { RequestEvent } from '@sveltejs/kit';
import { SLUG_PATTERN } from '$lib/slugs/slugs';

/**
 * Analytics write path. A single D1 batch of upserts into pre-aggregated
 * tables, off the response path. No event stream and no rollup job — the
 * aggregate *is* the storage, so counts are exact and history is permanent.
 *
 * Three tables: `hits` stays at six dimensions, `hits_device` carries the
 * OS/browser breakdown that would multiply its rows, and `visitors` holds one
 * row per visitor per path per day for the unique count.
 *
 * Identity is a daily-rotating hash. When the fingerprint cookie (set by the
 * `/analytics/beacon` endpoint from the home page's `/a.js`) is present it
 * replaces the IP+UA guess, so a room full of people behind one NAT counts as
 * a room full of people. Nothing identifying is stored either way: the
 * fingerprint is kept only in an HttpOnly cookie, never in D1, and the stored
 * value hashes it with the day and the salt, so it is useless across days.
 */


/** Hostname only, never the full URL — a full URL would explode cardinality. */
export function referrerHost(referer: string | null, selfHost: string): string {
	if (!referer) return 'direct';
	try {
		const host = new URL(referer).hostname.replace(/^www\./, '');
		return host && host !== selfHost.replace(/^www\./, '') ? host : 'direct';
	} catch {
		return 'direct';
	}
}


/**
 * The one bucket that is not a real path. A 404's slug is whatever a stranger
 * typed, which is the only attacker-controlled dimension in the table — and
 * `hits` is never pruned, so a single scan of a hundred thousand random paths
 * would pollute it permanently.
 *
 * Two rules keep that bounded, both applied here rather than at the call site
 * so every caller gets them:
 *
 *   - a path that could never have been a slug collapses to `*`, which throws
 *     away encoded traversal attempts, unicode and overlong junk;
 *   - a bot's 404 collapses too. Every dashboard query filters `device != 'bot'`,
 *     so those rows are written and then never read — pure cardinality. The row
 *     still exists under `*`, so the device breakdown keeps its count.
 */

export function bucket404(path: string, device: 'mobile' | 'desktop' | 'bot'): string {
	if (device === 'bot') return OTHER_PATH;
	return SLUG_PATTERN.test(path) ? path : OTHER_PATH;
}

/** Shared with the test that proves it increments rather than duplicating. */
export const HITS_UPSERT = `INSERT INTO hits (day, slug, kind, country, referrer, device, n)
	 VALUES (?, ?, ?, ?, ?, ?, 1)
	 ON CONFLICT(day, slug, kind, country, referrer, device)
	 DO UPDATE SET n = n + 1`;

export const DEVICE_UPSERT = `INSERT INTO hits_device (day, slug, kind, os, browser, n)
	 VALUES (?, ?, ?, ?, ?, 1)
	 ON CONFLICT(day, slug, kind, os, browser)
	 DO UPDATE SET n = n + 1`;

export const VISITORS_INSERT = `INSERT OR IGNORE INTO visitors (day, slug, vh) VALUES (?, ?, ?)`;

/**
 * Fold a cookie-less identity into the fingerprint identity for the whole day.
 * `OR IGNORE` because a row for the fingerprint identity may already exist on
 * the same (day, slug) — the page's own deferred `track()` can land after the
 * beacon — and a plain UPDATE onto that existing primary key would abort the
 * whole batch. Rows that cannot move are cleared by `PURGE_VISITOR` below, so
 * the old identity never lingers as a duplicate.
 */
export const MIGRATE_VISITOR = `UPDATE OR IGNORE visitors SET vh = ?2 WHERE day = ?1 AND vh = ?3`;

/** Remove any cookie-less rows the migration could not move (their fingerprint
 *  row already existed), so the two identities never double count. */
export const PURGE_VISITOR = `DELETE FROM visitors WHERE day = ?1 AND vh = ?2`;

/** First-party fingerprint cookie. HttpOnly: the page never needs to read it. */
export const FP_COOKIE = 'f';
export const fpCookie = (fp: string) =>
	`${FP_COOKIE}=${fp}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;

const hex = (b: ArrayBuffer, bytes: number) =>
	Array.from(new Uint8Array(b, 0, bytes))
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');

/**
 * Daily-rotating visitor hash. Nothing identifying is stored and the value is
 * useless across days, which is why there is no consent banner. The identity
 * is the caller's choice: two parts (IP + UA) when no fingerprint exists, one
 * part (the fingerprint) when it does.
 */
export async function visitorHash(salt: string, day: string, ...parts: string[]) {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`${salt}|${day}|${parts.join('|')}`)
	);
	return hex(digest, 8);
}

/** The identity of a visitor with no fingerprint cookie: IP + UA. */
export const anonymousVisitor = (salt: string, day: string, request: Request) =>
	visitorHash(salt, day, request.headers.get('cf-connecting-ip') ?? '0.0.0.0', request.headers.get('user-agent') ?? '');

/** The signal set `/a.js` collects. Optional fields, but wrong types reject. */
export type BeaconSignals = {
	b?: string[] | null;
	p?: string;
	m?: boolean;
	t?: number;
	l?: string;
	z?: string;
	s?: string;
	d?: number;
};

const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';

export function parseBeacon(text: string): BeaconSignals | null {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	if (
		(o.b !== undefined && !(Array.isArray(o.b) && o.b.every(isStr))) ||
		(o.p !== undefined && !isStr(o.p)) ||
		(o.m !== undefined && !isBool(o.m)) ||
		(o.t !== undefined && !isNum(o.t)) ||
		(o.l !== undefined && !isStr(o.l)) ||
		(o.z !== undefined && !isStr(o.z)) ||
		(o.s !== undefined && !isStr(o.s)) ||
		(o.d !== undefined && !isNum(o.d))
	) {
		return null;
	}
	return o as BeaconSignals;
}

/**
 * The stable-per-device fingerprint. The signals are hashed with the salt and
 * the UA, never stored raw, and the result is stable across days so a returning
 * visitor keeps their identity — the *stored* hash still rotates daily, which
 * is what keeps the value useless across days.
 */
export async function fingerprint(salt: string, sigs: BeaconSignals, ua: string) {
	const canonical = JSON.stringify([
		sigs.b ?? null,
		sigs.p ?? '',
		sigs.m ?? null,
		sigs.t ?? 0,
		sigs.l ?? '',
		sigs.z ?? '',
		sigs.s ?? '',
		sigs.d ?? 0
	]);
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`${salt}|fp|${canonical}|${ua}`)
	);
	return hex(digest, 16);
}

export function readCookie(header: string | null, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
	}
	return null;
}

/**
 * Fire-and-forget. Callers pass only `{ slug, kind }`; everything else —
 * referrer, device, country, visitor hash, and the 404 bucketing above — is
 * derived here. Never awaited by a handler, never able to fail a response:
 * analytics are not worth a failed request.
 */
export function track(event: RequestEvent, e: { slug: string; kind: Kind }) {
	const platform = event.platform;
	if (!platform) return;

	const { env } = platform;
	const req = event.request;

	const day = utcDay();
	const ua = req.headers.get('user-agent') ?? '';
	const device = deviceClass(ua);
	const referrer = referrerHost(req.headers.get('referer'), event.url.hostname);
	const country = (req as { cf?: { country?: string } }).cf?.country ?? UNKNOWN_COUNTRY;
	const slug = e.kind === '404' ? bucket404(e.slug, device) : e.slug;
	const salt = env.SALT ?? '';
	const { os, browser } = classify(ua);

	const work = (async () => {
		let markSeen: (() => Promise<void>) | null = null;
		const stmts = [
			env.DB.prepare(HITS_UPSERT).bind(day, slug, e.kind, country, referrer, device)
		];

		// A crawler is not a visitor. `visitors` has no `device` column, so a bot
		// row there can never be filtered out again — it would inflate the unique
		// count on the one page that reports it, against hit counts that exclude
		// bots. Skipping the write costs nothing and makes the two columns
		// comparable, which is the only reason they sit side by side. The device
		// breakdown skips bots at write time for the same reason.
		if (device !== 'bot') {
			stmts.push(env.DB.prepare(DEVICE_UPSERT).bind(day, slug, e.kind, os, browser));

			// The fingerprint cookie replaces the IP+UA guess whenever it exists;
			// the beacon that set it also folded any cookie-less rows into the
			// fingerprint identity, so the two paths never double count.
			const fp = readCookie(req.headers.get('cookie'), FP_COOKIE);
			const vh = fp ? await visitorHash(salt, day, fp) : await anonymousVisitor(salt, day, req);

			// The `visitors` insert is a no-op whenever this visitor already
			// hit this slug today. A per-colo marker turns the common repeat visit
			// into one write instead of two.
			const marker = new Request(`https://seen.internal/${vh}/${day}/${encodeURIComponent(slug)}`);
			const cache = platform.caches?.default;
			const seen = cache ? await cache.match(marker) : undefined;

			if (!seen) {
				stmts.push(env.DB.prepare(VISITORS_INSERT).bind(day, slug, vh));
				markSeen = async () =>
					cache?.put(marker, new Response(null, { headers: { 'Cache-Control': 'max-age=86400' } }));
			}
		}

		await env.DB.batch(stmts);
		await markSeen?.();
	})();

	afterResponse(platform, work);
}
