import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { oidcConfigured, userinfo } from '$lib/auth/oidc.server';
import { bindings } from '$lib/server/bindings';

/** OIDC UserInfo (§4): the same claims as the ID token, for a live access token. */
const handler: RequestHandler = async ({ request, platform }) => {
	const env = bindings(platform);
	if (!oidcConfigured(env)) error(404, 'Not found');

	const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ');
	const claims = token && scheme?.toLowerCase() === 'bearer' ? await userinfo(env, token) : null;
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
