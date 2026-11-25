import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { oidcConfigured, userinfo } from '$lib/auth/oidc.server';
import { bindings } from '$lib/server/bindings';
import { bearerToken } from '$lib/server/api';

/** OIDC UserInfo: the same claims as the ID token, for a live access token. */
const handler: RequestHandler = async ({ request, platform }) => {
	const env = bindings(platform);
	if (!oidcConfigured(env)) error(404, 'Not found');

	const token = bearerToken(request);
	const claims = token ? await userinfo(env, token) : null;
	if (!claims) {
		return json(
			{ error: 'invalid_token' },
			{ status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"', 'Cache-Control': 'no-store' } }
		);
	}
	return json(claims, { headers: { 'Cache-Control': 'no-store' } });
};

export const GET = handler;
export const POST = handler;
