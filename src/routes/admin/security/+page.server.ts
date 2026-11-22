import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deletePasskey, listPasskeys } from '$lib/server/webauthn';
import { listLiveKeys, revokeKey } from '$lib/server/installKeys';

/**
 * Passkey management. The page itself needs no server data beyond the list:
 * registration and sign-in are two-step JSON exchanges with the `/api` routes
 * (the browser's authenticator can only be driven from client JavaScript), so
 * the server actions here are deleting a passkey and revoking an install key.
 *
 * Live install keys (Shelf plan §9.5) are listed by id, scope and expiry —
 * never the secret, which is not stored — so a key minted into a prompt that
 * should not have been shared can be killed before it is used.
 */

export const load: PageServerLoad = async ({ platform }) => {
	const env = platform?.env;
	if (!env) return { passkeys: [], installKeys: [] };
	const [passkeys, installKeys] = await Promise.all([listPasskeys(env), listLiveKeys(env)]);
	return { passkeys, installKeys };
};

export const actions: Actions = {
	delete: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'No passkey given.' });

		await deletePasskey(env, id);
		return { deleted: id };
	},

	revokeKey: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'No install key given.' });

		// Already gone (used, expired and purged, or revoked elsewhere) is the
		// outcome asked for, so it is not an error.
		await revokeKey(env, id);
		return { revoked: id };
	}
};
