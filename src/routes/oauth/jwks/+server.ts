import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { jwks, oidcConfigured } from '$lib/auth/oidc.server';

/** The public half of the ID-token signing key (§4). */
export const GET: RequestHandler = async ({ platform }) => {
	const env = platform?.env;
	if (!oidcConfigured(env)) error(404, 'Not found');
	return json(await jwks(env), {
		headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' }
	});
};
