import { eq, sha256 } from './auth';
import { checkKey, KEY_ERROR, KEY_PREFIX, type InstallKeyRow } from './installKeys';

/**
 * Bearer auth for the shortener API (§4's credential, a second door).
 *
 * The session cookie is deliberately not accepted here. A cookie is attached by
 * the browser to any request the browser is talked into making, which is what
 * makes CSRF a category at all; a bearer token has to be typed in by whoever is
 * calling. Keeping the two apart means a script cannot ride the admin session,
 * and the admin UI cannot be driven from a page on another origin.
 *
 * The token is the same 256-bit value the login form takes, checked against the
 * same `AUTH_HASH` — one credential to rotate, not two.
 */

export type ApiAuth = { ok: true } | { ok: false; status: number; error: string };

export async function authorize(request: Request, hash: string | undefined): Promise<ApiAuth> {
	if (!hash) return { ok: false, status: 503, error: 'Auth is not configured on this deployment.' };

	const header = request.headers.get('authorization') ?? '';
	const [scheme, token] = header.split(' ');

	if (!token || scheme?.toLowerCase() !== 'bearer') {
		return { ok: false, status: 401, error: 'Send an Authorization: Bearer <token> header.' };
	}

	// An install key is never an admin token. It gets the key sentence on every
	// route that is not one of the two it may use, so a key holder cannot tell
	// "wrong route" from "wrong key" — and it never costs a hash against
	// `AUTH_HASH`.
	if (token.startsWith(KEY_PREFIX)) return { ok: false, status: 401, error: KEY_ERROR };

	// Constant-time, and the token is never logged or echoed back.
	if (!eq(await sha256(token), hash)) {
		return { ok: false, status: 401, error: 'That token is not right.' };
	}

	return { ok: true };
}

export type AppAuth =
	| { ok: true; origin: 'admin' }
	| { ok: true; origin: 'key'; key: InstallKeyRow }
	| { ok: false; status: number; error: string };

/**
 * The single door for the two routes an install key may use (Shelf plan §9.5):
 * `PUT /api/apps/{slug}` (`write`) and `GET /api/apps/{slug}/source`
 * (`read-source`). Every other route calls plain `authorize`, which turns a key
 * away — so widening what a key can do means changing this function, and
 * nothing else can do it by accident.
 *
 * The admin token passes for both. A key passes only while it is live and only
 * within its scope: a create key (no slug) may write any slug — whether it is
 * free is the write's question, answered with a 409 — and may read nothing; an
 * update key may write and read its own slug only. Every key failure is the
 * same 401 sentence.
 */
export async function authorizeApp(
	request: Request,
	env: App.Platform['env'],
	{ slug, action }: { slug: string; action: 'read-source' | 'write' }
): Promise<AppAuth> {
	const header = request.headers.get('authorization') ?? '';
	const [scheme, token] = header.split(' ');

	if (!token?.startsWith(KEY_PREFIX) || scheme?.toLowerCase() !== 'bearer') {
		const auth = await authorize(request, env.AUTH_HASH);
		return auth.ok ? { ok: true, origin: 'admin' } : auth;
	}

	const key = await checkKey(env, token);
	const denied = { ok: false, status: 401, error: KEY_ERROR } as const;
	if (!key) return denied;
	if (action === 'read-source' && key.slug !== slug) return denied;
	if (action === 'write' && key.slug !== null && key.slug !== slug) return denied;
	return { ok: true, origin: 'key', key };
}

/**
 * A JSON error shaped the same way every time. Clients get a machine-readable
 * `error` and a sentence a human can act on, and never a stack trace or a hint
 * about whether a credential merely existed.
 */
export function apiError(status: number, error: string, extra?: Record<string, unknown>) {
	return Response.json(
		{ error, ...extra },
		{
			status,
			// An error answer is about this request only; nothing should keep it.
			headers: { 'cache-control': 'no-store' }
		}
	);
}

export function apiJson(body: unknown, status = 200) {
	return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
