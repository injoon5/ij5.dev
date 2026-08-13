import type { RequestHandler } from './$types';
import {
	deviceClass,
	fingerprint,
	fpCookie,
	MIGRATE_VISITOR,
	parseBeacon,
	today,
	visitorHash,
	VISITORS_INSERT
} from '$lib/server/track';

/**
 * The fingerprint half of §6's identity (§6). `/a.js` posts the stable signal
 * set from the home page; this hashes it into a per-device fingerprint, sets a
 * 24-hour first-party cookie, and folds any cookie-less identity already
 * recorded for this visitor today into the fingerprint identity so the two
 * paths never double count.
 *
 * It lives at `/analytics/beacon` — multi-segment, so the hook's redirect
 * branch never sees it, and outside `/api`, so the auth guard never does.
 * Same-origin only: a cross-site form post can't set someone's fingerprint
 * cookie, which would otherwise be a one-line CSRF poisoning of their identity.
 */

export const POST: RequestHandler = async ({ request, url, platform }) => {
	const env = platform?.env;
	if (!env?.DB) return new Response(null, { status: 204 });

	// Beacons only ever come from real browsers running /a.js, so a bot UA
	// means a script, not a visitor.
	const ua = request.headers.get('user-agent') ?? '';
	if (deviceClass(ua) === 'bot') return new Response(null, { status: 204 });

	const origin = request.headers.get('origin');
	if (origin) {
		try {
			if (new URL(origin).hostname !== url.hostname) return new Response(null, { status: 204 });
		} catch {
			return new Response(null, { status: 204 });
		}
	}

	const text = await request.text().catch(() => '');
	if (!text || text.length > 2048) return new Response(null, { status: 204 });
	const sigs = parseBeacon(text);
	if (!sigs) return new Response(null, { status: 204 });

	const day = today();
	const salt = env.SALT ?? '';
	const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';

	const fp = await fingerprint(salt, sigs, ua);
	const old = await visitorHash(salt, day, ip, ua);
	const vh = await visitorHash(salt, day, fp);

	// The UPDATE folds in every cookie-less row from earlier today (all slugs —
	// a redirect clicked before the beacon is still the same person). The INSERT
	// OR IGNORE guarantees the home row exists even if it landed late.
	const stmts = [
		env.DB.prepare(MIGRATE_VISITOR).bind(day, vh, old),
		env.DB.prepare(VISITORS_INSERT).bind(day, '', vh)
	];
	await env.DB.batch(stmts);

	// The page's own track() write is scheduled behind the response it rode in
	// on; the beacon can land before that batch finishes. One delayed re-run of
	// the migration folds any straggler in. Cheap insurance, not the happy path.
	const retry = (async () => {
		await new Promise((r) => setTimeout(r, 1500));
		await env.DB.prepare(MIGRATE_VISITOR).bind(day, vh, old).run();
	})().catch(() => {});
	platform?.context?.waitUntil?.(retry);

	return new Response(null, {
		status: 204,
		headers: { 'Set-Cookie': fpCookie(fp) }
	});
};
