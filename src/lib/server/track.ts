import type { RequestEvent } from '@sveltejs/kit';
import { SLUG_PATTERN } from '$lib/reserved';

/**
 * Analytics write path (§6). One upsert into a pre-aggregated table, off the
 * response path. No event stream and no rollup job — the aggregate *is* the
 * storage, so counts are exact and history is permanent.
 *
 * The trade: dimensions are fixed at write time. Six columns is the ceiling.
 */

export type Kind = 'redirect' | 'home' | '404';

const BOT =
	/bot|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|pinterest|vkshare|whatsapp|telegram|discord|slackbot|preview|headless|monitor|curl|wget|python-requests|axios|node-fetch/i;

const MOBILE = /android|iphone|ipod|ipad|iemobile|opera mini|mobile safari|windows phone/i;

export function deviceClass(ua: string): 'mobile' | 'desktop' | 'bot' {
	if (!ua || BOT.test(ua)) return 'bot';
	return MOBILE.test(ua) ? 'mobile' : 'desktop';
}

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

export const today = () => new Date().toISOString().slice(0, 10);

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
export const OTHER = '*';

export function bucket404(path: string, device: 'mobile' | 'desktop' | 'bot'): string {
	if (device === 'bot') return OTHER;
	return SLUG_PATTERN.test(path) ? path : OTHER;
}

/** Shared with the test that proves it increments rather than duplicating. */
export const HITS_UPSERT = `INSERT INTO hits (day, slug, kind, country, referrer, device, n)
	 VALUES (?, ?, ?, ?, ?, ?, 1)
	 ON CONFLICT(day, slug, kind, country, referrer, device)
	 DO UPDATE SET n = n + 1`;

export const VISITORS_INSERT = `INSERT OR IGNORE INTO visitors (day, slug, vh) VALUES (?, ?, ?)`;

const hex = (b: ArrayBuffer, bytes: number) =>
	Array.from(new Uint8Array(b, 0, bytes))
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');

/**
 * Daily-rotating visitor hash. Nothing identifying is stored and the value is
 * useless across days, which is why there is no consent banner.
 */
export async function visitorHash(salt: string, day: string, ip: string, ua: string) {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`)
	);
	return hex(digest, 8);
}

/**
 * Fire-and-forget. Callers pass only `{ slug, kind }`; everything else —
 * referrer, device, country, visitor hash, and the 404 bucketing above — is
 * derived here. Never awaited by a handler, never able to fail a response:
 * analytics are not worth a failed request (§13).
 */
export function track(event: RequestEvent, e: { slug: string; kind: Kind }) {
	const platform = event.platform;
	if (!platform?.env?.DB) return;

	const { env, context } = platform;
	const req = event.request;

	const day = today();
	const ua = req.headers.get('user-agent') ?? '';
	const device = deviceClass(ua);
	const referrer = referrerHost(req.headers.get('referer'), event.url.hostname);
	const country = (req as { cf?: { country?: string } }).cf?.country ?? 'XX';
	const ip = req.headers.get('cf-connecting-ip') ?? '0.0.0.0';
	const slug = e.kind === '404' ? bucket404(e.slug, device) : e.slug;

	const work = (async () => {
		const stmts = [
			env.DB.prepare(HITS_UPSERT).bind(day, slug, e.kind, country, referrer, device)
		];

		// A crawler is not a visitor. `visitors` has no `device` column, so a bot
		// row there can never be filtered out again — it would inflate the unique
		// count on the one page that reports it, against hit counts that exclude
		// bots. Skipping the write costs nothing and makes the two columns
		// comparable, which is the only reason they sit side by side.
		if (device !== 'bot') {
			const vh = await visitorHash(env.SALT ?? '', day, ip, ua);

			// §11 — the `visitors` insert is a no-op whenever this visitor already
			// hit this slug today. A per-colo marker turns the common repeat visit
			// into one write instead of two.
			const marker = new Request(`https://seen.internal/${vh}/${day}/${encodeURIComponent(slug)}`);
			const cache = platform.caches?.default;
			const seen = cache ? await cache.match(marker) : undefined;

			if (!seen) {
				stmts.push(env.DB.prepare(VISITORS_INSERT).bind(day, slug, vh));
				await cache?.put(
					marker,
					new Response(null, { headers: { 'Cache-Control': 'max-age=86400' } })
				);
			}
		}

		await env.DB.batch(stmts);
	})().catch(() => {
		// Silent by design. A failed analytics write must never surface.
	});

	context?.waitUntil?.(work);
}
