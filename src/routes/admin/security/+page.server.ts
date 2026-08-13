import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deletePasskey, listPasskeys } from '$lib/server/webauthn';

/**
 * Passkey management. The page itself needs no server data beyond the list:
 * registration and sign-in are two-step JSON exchanges with the `/api` routes
 * (the browser's authenticator can only be driven from client JavaScript), so
 * the only server action here is deleting a key.
 */

export const load: PageServerLoad = async ({ platform }) => {
	const env = platform?.env;
	if (!env) return { passkeys: [] };
	return { passkeys: await listPasskeys(env) };
};

export const actions: Actions = {
	delete: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'No passkey given.' });

		await deletePasskey(env, id);
		return { deleted: id };
	}
};
