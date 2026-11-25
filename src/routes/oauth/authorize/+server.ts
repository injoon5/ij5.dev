import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { errorRedirect, issueCode, issuer, oidcConfigured, parseAuthorize, tooOld } from '$lib/auth/oidc.server';
import { bindings } from '$lib/server/bindings';

/**
 * The OIDC authorization endpoint (§4). With a live session it answers at
 * once with a code for Cloudflare Access; without one it sends you to sign in
 * and back here after.
 *
 * There is no consent screen: there is one client, registered by hand, and it
 * can only ever receive the code at its one registered redirect URI.
 */
export const GET: RequestHandler = async ({ url, platform, locals, setHeaders }) => {
	const env = bindings(platform);
	if (!oidcConfigured(env)) error(404, 'Not found');
	setHeaders({ 'Cache-Control': 'no-store' });

	const parsed = parseAuthorize(env, url.searchParams);
	if (!parsed.ok) {
		if ('show' in parsed) error(400, parsed.show);
		redirect(302, parsed.redirect);
	}
	const req = parsed.req;
	const prompts = (req.prompt ?? '').split(' ');
	const session = locals.session;

	if (!session || prompts.includes('login') || tooOld(req, session)) {
		if (prompts.includes('none')) {
			redirect(302, errorRedirect(req.redirect_uri, req.state, 'login_required', undefined, issuer(env)));
		}
		// Come back without the parameters that asked for a fresh sign-in, or
		// the fresh sign-in would ask for another one, forever.
		const back = new URL(url);
		back.searchParams.delete('prompt');
		back.searchParams.delete('max_age');
		const login = new URL('/login', url);
		login.searchParams.set('next', back.pathname + back.search);
		if (session) login.searchParams.set('reauth', '1');
		redirect(302, login.pathname + login.search);
	}

	redirect(302, await issueCode(env, req, session));
};
