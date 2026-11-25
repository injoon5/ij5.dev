import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { clientIp, eq, sha256 } from '$lib/server/auth';
import { safeNext } from '$lib/server/next';
import { newChallenge } from '$lib/server/puzzle';
import {
	passwordAndPuzzle,
	passwordAndRecoveryCode,
	passwordConfigured,
	startSession,
	type Outcome
} from '$lib/server/signIn';
import { turnstileEnabled, turnstileOk } from '$lib/server/turnstile';

/**
 * Four doors (§4), strongest first:
 *
 * - passkey — the everyday one (its two steps are `/api/passkey/login/*`);
 * - the admin token, from a password manager;
 * - password + recovery code, when you have nothing with you but paper;
 * - password + puzzle, from a borrowed computer, for a limited hour.
 *
 * `next` brings the OIDC flow back to `/oauth/authorize` after sign-in, and
 * `reauth` lets that flow ask for a fresh sign-in even with a live session.
 */

export const load: PageServerLoad = async ({ locals, url, platform }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (locals.authed && !url.searchParams.has('reauth')) redirect(303, next);

	const env = platform?.env;
	const password = passwordConfigured(env);
	return {
		next,
		password,
		puzzle: password ? await newChallenge(env!.SESSION_SECRET) : null,
		turnstileSiteKey: turnstileEnabled(env) ? env!.TURNSTILE_SITE_KEY! : null
	};
};

function refuse(o: Extract<Outcome, { ok: false }>, door: string) {
	return fail(o.status, { door, error: o.error, retryAt: (o.retryAt ?? null) as number | null });
}

export const actions: Actions = {
	token: async (event) => {
		const { request, platform, url } = event;
		const env = platform?.env;
		if (!env?.AUTH_HASH) return fail(500, { door: 'token', error: 'Auth is not configured on this deployment.', retryAt: null });

		const token = String((await request.formData()).get('token') ?? '');
		if (!token) return fail(400, { door: 'token', error: 'Enter your token.', retryAt: null });

		// Constant-time, and the token itself is never stored or logged.
		if (!eq(await sha256(token), env.AUTH_HASH)) {
			return fail(401, { door: 'token', error: 'That token is not right.', retryAt: null });
		}

		await startSession(event, 'full', 'token');
		redirect(303, safeNext(url.searchParams.get('next')));
	},

	password: async (event) => {
		const { request, platform, url } = event;
		const env = platform?.env;
		if (!env) return fail(500, { door: 'password', error: 'No platform bindings.', retryAt: null });

		const form = await request.formData();
		if (!(await turnstileOk(env, String(form.get('cf-turnstile-response') ?? ''), clientIp(request)))) {
			return fail(400, { door: 'password', error: 'The browser check did not pass. Try again.', retryAt: null });
		}

		const outcome = await passwordAndPuzzle(env, request, {
			password: String(form.get('password') ?? ''),
			answer: String(form.get('answer') ?? ''),
			challenge: String(form.get('challenge') ?? '')
		});
		if (!outcome.ok) return refuse(outcome, 'password');

		await startSession(event, outcome.strength, outcome.method);
		redirect(303, safeNext(url.searchParams.get('next')));
	},

	recovery: async (event) => {
		const { request, platform, url } = event;
		const env = platform?.env;
		if (!env) return fail(500, { door: 'recovery', error: 'No platform bindings.', retryAt: null });

		const form = await request.formData();
		if (!(await turnstileOk(env, String(form.get('cf-turnstile-response') ?? ''), clientIp(request)))) {
			return fail(400, { door: 'recovery', error: 'The browser check did not pass. Try again.', retryAt: null });
		}

		const outcome = await passwordAndRecoveryCode(env, request, {
			password: String(form.get('password') ?? ''),
			code: String(form.get('code') ?? '')
		});
		if (!outcome.ok) return refuse(outcome, 'recovery');

		await startSession(event, outcome.strength, outcome.method);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
