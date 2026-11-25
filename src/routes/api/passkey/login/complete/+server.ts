import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AuthenticationResponseJSON } from '@simplewebauthn/browser';
import { startSession } from '$lib/auth/signIn.server';
import { finishAuthentication } from '$lib/auth/webauthn.server';
import { bindings } from '$lib/server/bindings';

/**
 * Step two of passkey sign-in: verify the assertion the authenticator produced
 * and open a `full` session — the strongest door, so the strongest session.
 */

export const POST: RequestHandler = async (event) => {
	const { request, platform } = event;
	const env = bindings(platform);

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

	await startSession(event, 'full', 'passkey');
	return json({ ok: true });
};
