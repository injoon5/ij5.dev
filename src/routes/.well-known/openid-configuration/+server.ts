import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { discovery, oidcConfigured } from '$lib/auth/oidc.server';
import { bindings } from '$lib/server/bindings';

/** OIDC discovery. 404 until the provider is configured. */
export const GET: RequestHandler = ({ platform }) => {
	const env = bindings(platform);
	if (!oidcConfigured(env)) error(404, 'Not found');
	return json(discovery(env), {
		headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' }
	});
};
