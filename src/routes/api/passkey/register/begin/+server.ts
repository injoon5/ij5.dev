import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { beginRegistration } from '$lib/server/webauthn';

/**
 * Step one of registering a passkey: the server returns the options the
 * browser turns into `navigator.credentials.create()`. Guarded by the session
 * cookie like every `/api` route, so you must be signed in to add a key.
 */

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) error(503, 'No platform bindings.');

	const url = new URL(request.url);
	const options = await beginRegistration(env, url.hostname, 'ij5.dev');
	return json({ options });
};
