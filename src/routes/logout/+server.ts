import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bindings } from '$lib/server/bindings';
import { SESSION_COOKIE, cookieOptions, deleteSession } from '$lib/auth/sessions.server';

/**
 * POST only, so a prefetch or an image tag cannot sign you out. The hook's
 * cross-site form check and the `SameSite=Lax` cookie are the CSRF defence.
 * The session row goes too, so the cookie is dead even if a copy survives.
 */
export const POST: RequestHandler = async ({ cookies, locals, platform }) => {
	if (locals.session) await deleteSession(bindings(platform), locals.session.id);
	cookies.delete(SESSION_COOKIE, cookieOptions('full'));
	redirect(303, '/login');
};
