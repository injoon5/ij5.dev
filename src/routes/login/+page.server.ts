import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_COOKIE, cookieOptions, eq, issue, sha256 } from '$lib/server/auth';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.authed) redirect(303, '/admin');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const env = platform?.env;
		if (!env?.AUTH_HASH || !env.SESSION_SECRET) {
			return fail(500, { error: 'Auth is not configured on this deployment.' });
		}

		const token = String((await request.formData()).get('token') ?? '');
		if (!token) return fail(400, { error: 'Enter your token.' });

		// Constant-time, and the token itself is never stored or logged.
		if (!eq(await sha256(token), env.AUTH_HASH)) {
			return fail(401, { error: 'That token is not right.' });
		}

		cookies.set(SESSION_COOKIE, await issue(env.SESSION_SECRET), cookieOptions);
		redirect(303, '/admin');
	}
};
