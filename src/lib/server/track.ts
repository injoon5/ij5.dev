import type { RequestEvent } from '@sveltejs/kit';

/**
 * Analytics write path (§6). One upsert into a pre-aggregated table, off the
 * response path. No event stream and no rollup job — the aggregate *is* the
 * storage, so counts are exact and history is permanent.
 *
 * The trade: dimensions are fixed at write time. Six columns is the ceiling.
 */

export type Kind = 'redirect' | 'bento' | '404';

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
 * Fire-and-forget. Callers pass only `{ slug, kind }`; everything else is
 * derived from the request. Never awaited by a handler, never able to fail a
 * response — analytics are not worth a failed request (§13).
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

	const work = (async () => {
		const vh = await visitorHash(env.SALT ?? '', day, ip, ua);

		const stmts = [
			env.DB.prepare(
				`INSERT INTO hits (day, slug, kind, country, referrer, device, n)
				 VALUES (?, ?, ?, ?, ?, ?, 1)
				 ON CONFLICT(day, slug, kind, country, referrer, device)
				 DO UPDATE SET n = n + 1`
			).bind(day, e.slug, e.kind, country, referrer, device)
		];

		// §11 — the `visitors` insert is a no-op whenever this visitor already
		// hit this slug today. A per-colo marker turns the common repeat visit
		// into one write instead of two.
		const marker = new Request(`https://seen.internal/${vh}/${day}/${encodeURIComponent(e.slug)}`);
		const cache = platform.caches?.default;
		const seen = cache ? await cache.match(marker) : undefined;

		if (!seen) {
			stmts.push(
				env.DB.prepare(`INSERT OR IGNORE INTO visitors (day, slug, vh) VALUES (?, ?, ?)`).bind(
					day,
					e.slug,
					vh
				)
			);
			await cache?.put(
				marker,
				new Response(null, { headers: { 'Cache-Control': 'max-age=86400' } })
			);
		}

		await env.DB.batch(stmts);
	})().catch(() => {
		// Silent by design. A failed analytics write must never surface.
	});

	context?.waitUntil?.(work);
}
