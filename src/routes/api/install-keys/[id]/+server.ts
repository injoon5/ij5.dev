import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { getKey, keyStatus, revokeKey } from '$lib/server/installKeys';

/**
 * A key's status, polled by Shelf while its sheet is open so it can close the
 * sheet the moment an agent installs; and Revoke. The id is public — it is in
 * the key itself — but these routes still take the admin token: whether a key
 * has been used is nobody else's business.
 */

export const GET: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const row = await getKey(env, params.id);
	if (!row) return apiError(404, 'No install key with that id.');

	const status = keyStatus(row);
	return apiJson(status === 'used' ? { status, slug: row.used_slug } : { status });
};

export const DELETE: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	if (!(await revokeKey(env, params.id))) return apiError(404, 'No install key with that id.');

	return apiJson({ id: params.id, revoked: true });
};
