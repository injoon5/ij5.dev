import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FULL_ONLY, isFull } from '$lib/server/guard';
import { sameOrigin } from '$lib/server/origin';
import { beginRegistration } from '$lib/server/webauthn';

/**
 * Step one of registering a passkey: the server returns the options the
 * browser turns into `navigator.credentials.create()`. Guarded by the session
 * cookie like every `/api` route, so you must be signed in to add a key.
 */

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const env = platform?.env;
	if (!env) error(503, 'No platform bindings.');
	// A limited session must not be able to plant its own passkey (§4).
	if (!isFull(locals)) error(403, FULL_ONLY);
	if (!sameOrigin(request)) error(403, 'Cross-origin request refused.');

	const url = new URL(request.url);
	const options = await beginRegistration(env, url.hostname, 'ij5.dev');
	return json({ options });
};
