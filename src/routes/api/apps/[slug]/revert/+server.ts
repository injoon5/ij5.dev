import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { revertApp } from '$lib/apps/apps.server';

/**
 * Undo for a bad push (plan §9.5): the current version and the newest one in
 * history trade places, so a second revert is a redo. Admin token only — an
 * install key that could revert could undo the very write it was given for.
 */

export const POST: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const result = await revertApp(env, params.slug);
	if (!result.ok) {
		return apiError(404, result.reason === 'no-app' ? 'No app with that slug.' : 'Nothing to revert to.');
	}

	return apiJson(result.app);
};
