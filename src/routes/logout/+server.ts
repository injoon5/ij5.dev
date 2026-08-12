import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE, cookieOptions } from '$lib/server/auth';

/**
 * POST only, so a prefetch or an image tag cannot sign you out. SvelteKit
 * blocks cross-origin form POSTs by default and the cookie is `SameSite=Lax`,
 * which between them is the CSRF defence for this route.
 */
export const POST: RequestHandler = ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, cookieOptions);
	redirect(303, '/login');
};
