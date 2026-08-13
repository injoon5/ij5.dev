import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AuthenticationResponseJSON } from '@simplewebauthn/browser';
import { SESSION_COOKIE, cookieOptions, issue } from '$lib/server/auth';
import { finishAuthentication } from '$lib/server/webauthn';

/**
 * Step two of passkey sign-in: verify the assertion the authenticator produced
 * and hand back a normal session cookie — the same one the token form issues,
 * so a passkey login and a token login are indistinguishable from there.
 */

export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	const env = platform?.env;
	if (!env) error(503, 'No platform bindings.');

	let body: { response?: AuthenticationResponseJSON };
	try {
		body = await request.json();
	} catch {
		error(400, 'Body must be JSON.');
	}

	const url = new URL(request.url);
	try {
		await finishAuthentication(env, body.response!, url.hostname, url.origin);
	} catch (e) {
		error(401, e instanceof Error ? e.message : 'That passkey did not work.');
	}

	if (!env.SESSION_SECRET) error(500, 'Auth is not configured on this deployment.');
	cookies.set(SESSION_COOKIE, await issue(env.SESSION_SECRET), cookieOptions);
	return json({ ok: true });
};
