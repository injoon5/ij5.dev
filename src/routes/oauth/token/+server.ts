import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticateClient, mintTokens, oidcConfigured, redeemCode, type TokenError } from '$lib/auth/oidc.server';
import { bindings } from '$lib/server/bindings';

/**
 * The OIDC token endpoint (§4). Called by Cloudflare Access from its servers,
 * so it is the one form POST the hook's cross-site check lets through without
 * an Origin header — the client secret is its authentication instead.
 */

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

function oauthError(e: TokenError) {
	return json(
		{ error: e.error, error_description: e.error_description },
		{
			status: e.status,
			headers: { ...NO_STORE, ...(e.status === 401 && e.basic ? { 'WWW-Authenticate': 'Basic realm="ij5.dev"' } : {}) }
		}
	);
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = bindings(platform);
	if (!oidcConfigured(env)) error(404, 'Not found');

	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (type !== 'application/x-www-form-urlencoded') {
		return oauthError({ status: 400, error: 'invalid_request', error_description: 'Send the body form-encoded.' });
	}
	const form = new URLSearchParams(await request.text());

	// Authenticate before touching the code, so a stranger cannot burn codes.
	const denied = await authenticateClient(env, request, form);
	if (denied) return oauthError(denied);

	if (form.get('grant_type') !== 'authorization_code') {
		return oauthError({ status: 400, error: 'unsupported_grant_type', error_description: 'Only authorization_code.' });
	}

	const redeemed = await redeemCode(env, form);
	if (!redeemed.ok) return oauthError(redeemed);

	return json(await mintTokens(env, redeemed.row), { headers: NO_STORE });
};
