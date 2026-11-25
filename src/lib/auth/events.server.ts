/**
 * The sign-in log and alerts (§4).
 *
 * Every sign-in, failure and lockout is a row in `auth_events`, shown on the
 * security page. Sign-ins that did not use a passkey or the token — the doors
 * meant for borrowed computers — also push an alert to `ALERT_URL` when it is
 * set. The body is plain text with ntfy's headers, so an ntfy topic URL works
 * as is (`https://ntfy.sh/<long random topic>`); any endpoint that takes a
 * POST will do.
 */

type Env = App.Platform['env'];

export type EventKind = 'sign-in' | 'failed' | 'locked' | 'sign-out-all';

export type EventRow = {
	id: number;
	at: number;
	kind: EventKind;
	method: string | null;
	ip: string | null;
	country: string | null;
	user_agent: string | null;
};

type Meta = { ip: string | null; country: string | null; userAgent: string | null };

const KEEP = 200;

export async function logEvent(env: Env, kind: EventKind, method: string | null, meta: Meta, now = Date.now()) {
	await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO auth_events (at, kind, method, ip, country, user_agent) VALUES (?, ?, ?, ?, ?, ?)`
		).bind(now, kind, method, meta.ip, meta.country, meta.userAgent),
		env.DB.prepare(
			`DELETE FROM auth_events WHERE id <= (SELECT id FROM auth_events ORDER BY id DESC LIMIT 1 OFFSET ?)`
		).bind(KEEP)
	]);
}

export async function listEvents(env: Env, limit = 30): Promise<EventRow[]> {
	const { results } = await env.DB.prepare(
		`SELECT id, at, kind, method, ip, country, user_agent FROM auth_events ORDER BY id DESC LIMIT ?`
	)
		.bind(limit)
		.all<EventRow>();
	return results;
}

/** Fire-and-forget: an alert that cannot be delivered never blocks a sign-in. */
export function alert(
	platform: App.Platform | undefined,
	title: string,
	lines: Array<string | null | undefined>,
	origin: string
) {
	const url = platform?.env.ALERT_URL;
	if (!url) return;
	const send = fetch(url, {
		method: 'POST',
		headers: {
			Title: title,
			Tags: 'key',
			Priority: 'high',
			Click: `${origin}/admin/security`
		},
		body: lines.filter(Boolean).join('\n')
	}).catch(() => {});
	platform?.context?.waitUntil?.(send);
}

/** "Chrome on Windows" — enough to recognise a device, not a fingerprint. */
export function describeAgent(ua: string | null): string {
	if (!ua) return 'Unknown browser';
	const browser =
		/Edg\//.test(ua) ? 'Edge'
		: /Firefox\//.test(ua) ? 'Firefox'
		: /Chrome\//.test(ua) ? 'Chrome'
		: /Safari\//.test(ua) ? 'Safari'
		: 'Browser';
	const os =
		/iPhone|iPad/.test(ua) ? 'iOS'
		: /Android/.test(ua) ? 'Android'
		: /Mac OS X/.test(ua) ? 'macOS'
		: /Windows/.test(ua) ? 'Windows'
		: /Linux/.test(ua) ? 'Linux'
		: 'unknown OS';
	return `${browser} on ${os}`;
}
