import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FULL_ONLY, isFull } from '$lib/auth/guard.server';
import type { RegistrationResponseJSON } from '@simplewebauthn/browser';
import { finishRegistration } from '$lib/auth/webauthn.server';
import { bindings } from '$lib/server/bindings';

/**
 * Step two of registering a passkey: verify the attestation the authenticator
 * produced and store the credential. Only reachable with a session cookie.
 */

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const env = bindings(platform);
	// A limited session must not be able to plant its own passkey.
	if (!isFull(locals)) error(403, FULL_ONLY);

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
