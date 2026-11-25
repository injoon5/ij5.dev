import type { Handle } from '@sveltejs/kit';
import { afterResponse } from '$lib/server/bindings';
import { readSession, SESSION_COOKIE } from './sessions.server';

/**
 * API routes that authenticate their own caller and must never accept the
 * session cookie: a cookie rides along on whatever request a browser is
 * talked into making (CSRF); a bearer token or a passkey ceremony does not.
 */
const SELF_AUTHENTICATED_APIS = ['/api/links', '/api/apps', '/api/install-keys', '/api/passkey/login'];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Reads the session (only a request carrying the cookie pays the D1 read)
 * and guards `/api`, which has no layout to do it. Everything under `/admin`
 * is guarded by its layout.
 */
export const authenticate: Handle = async ({ event, resolve }) => {
	const { platform } = event;
	const cookie = event.cookies.get(SESSION_COOKIE);
	event.locals.session =
		platform && cookie
			? await readSession(platform.env, cookie, (p) => afterResponse(platform, p)).catch(() => null)
			: null;
	event.locals.authed = event.locals.session !== null;

	const path = event.url.pathname;
	if (under(path, '/api') && !SELF_AUTHENTICATED_APIS.some((p) => under(path, p)) && !event.locals.authed) {
		return new Response('Unauthorized', { status: 401 });
	}
	return resolve(event);
};
