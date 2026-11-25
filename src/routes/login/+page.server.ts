import { fail, redirect } from '@sveltejs/kit';
import type { Action, Actions, PageServerLoad } from './$types';
import type { Env } from '$lib/server/bindings';
import { clientIp } from '$lib/server/request';
import { eq, sha256 } from '$lib/server/crypto';
import { safeNext } from '$lib/auth/next';
import { newChallenge } from '$lib/auth/puzzle.server';
import {
	passwordAndPuzzle,
	passwordAndRecoveryCode,
	passwordConfigured,
	startSession,
	type Outcome
} from '$lib/auth/signIn.server';
import { turnstileEnabled, turnstileOk } from '$lib/auth/turnstile.server';
import { bindings } from '$lib/server/bindings';

/**
 * Four doors, strongest first:
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

	const env = bindings(platform);
	const password = passwordConfigured(env);
	return {
		next,
		password,
		puzzle: password ? await newChallenge(env!.SESSION_SECRET) : null,
		turnstileSiteKey: turnstileEnabled(env) ? env!.TURNSTILE_SITE_KEY! : null
	};
};

type Door = 'token' | 'password' | 'recovery';
type Field = (name: string) => string;

/**
 * Runs one typed door: the browser check (for the password doors), the
 * door's own check, then the session and the way back to `next`.
 */
function door(name: Door, check: (env: Env, request: Request, field: Field) => Promise<Outcome>): Action {
	return async (event) => {
		const { request, platform, url } = event;
		const env = bindings(platform);
		const form = await request.formData();
		const field: Field = (k) => String(form.get(k) ?? '');

		const human = name === 'token' || (await turnstileOk(env, field('cf-turnstile-response'), clientIp(request)));
		const outcome = human ? await check(env, request, field) : refusal('The browser check did not pass. Try again.', 400);
		if (!outcome.ok) return fail(outcome.status, { door: name, error: outcome.error, retryAt: outcome.retryAt });

		await startSession(event, outcome.strength, outcome.method);
		redirect(303, safeNext(url.searchParams.get('next')));
	};
}

const refusal = (error: string, status: number): Outcome => ({ ok: false, status, error, retryAt: null });

export const actions: Actions = {
	token: door('token', async (env, _request, field) => {
		if (!env.AUTH_HASH) return refusal('Auth is not configured on this deployment.', 500);
		const token = field('token');
		if (!token) return refusal('Enter your token.', 400);
		// Constant-time, and the token itself is never stored or logged.
		if (!eq(await sha256(token), env.AUTH_HASH)) return refusal('That token is not right.', 401);
		return { ok: true, strength: 'full', method: 'token' };
	}),

	password: door('password', (env, request, field) =>
		passwordAndPuzzle(env, request, { password: field('password'), answer: field('answer'), challenge: field('challenge') })
	),

	recovery: door('recovery', (env, request, field) =>
		passwordAndRecoveryCode(env, request, { password: field('password'), code: field('code') })
	)
};
