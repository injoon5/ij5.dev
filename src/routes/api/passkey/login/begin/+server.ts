import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { beginAuthentication } from '$lib/server/webauthn';

/**
 * Step one of passkey sign-in: the server returns the options the browser
 * turns into `navigator.credentials.get()`. Public, like the login page —
 * a session is exactly what the caller does not have yet. The hook exempts
 * this path for that reason.
 */

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) error(503, 'No platform bindings.');

	const url = new URL(request.url);
	const options = await beginAuthentication(env, url.hostname);
	return json({ options });
};
