import { eq, sha256 } from './auth';

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

	// Constant-time, and the token is never logged or echoed back.
	if (!eq(await sha256(token), hash)) {
		return { ok: false, status: 401, error: 'That token is not right.' };
	}

	return { ok: true };
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
			headers: {
				// This API is called from scripts, never from a browser page, so
				// there is no origin to allow. Saying so explicitly stops a
				// future edit from reaching for `*`.
				'cache-control': 'no-store'
			}
		}
	);
}

export function apiJson(body: unknown, status = 200) {
	return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
