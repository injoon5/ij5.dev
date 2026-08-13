import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RegistrationResponseJSON } from '@simplewebauthn/browser';
import { finishRegistration } from '$lib/server/webauthn';

/**
 * Step two of registering a passkey: verify the attestation the authenticator
 * produced and store the credential. Only reachable with a session cookie.
 */

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) error(503, 'No platform bindings.');

	let body: { response?: RegistrationResponseJSON; name?: string };
	try {
		body = await request.json();
	} catch {
		error(400, 'Body must be JSON.');
	}

	const name = String(body.name ?? '').trim().slice(0, 60);
	if (!name) error(400, 'Name the passkey so you can tell them apart.');

	const url = new URL(request.url);
	try {
		await finishRegistration(env, body.response!, url.hostname, url.origin, name);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'That passkey could not be saved.');
	}

	return json({ ok: true });
};
