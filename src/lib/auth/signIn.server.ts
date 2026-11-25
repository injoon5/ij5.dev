import type { Cookies } from '@sveltejs/kit';
import { describe as describeAgent } from '$lib/analytics/userAgent';
import { clientIp, requestMeta } from '$lib/server/request';
import { alert, logEvent } from './events.server';
import { verifyPassword } from './password.server';
import { answerMatches, parsePath, readChallenge, spendChallenge } from './puzzle.server';
import { spend } from './recovery.server';
import { createSession, cookieOptions, deleteSession, SESSION_COOKIE, type Method, type Strength } from './sessions.server';
import { lockedUntil, recordFailure, recordSuccess, type Door } from './throttle.server';

/**
 * The two doors for signing in without any of your devices:
 *
 * - password + puzzle → a `limited` session;
 * - password + recovery code → a `full` one.
 *
 * Both answer every wrong guess with the same sentence, whichever half was
 * wrong, and both pay the full password hash every time, so neither the reply
 * nor its timing says which half to keep guessing.
 */

type Env = App.Platform['env'];

export type Outcome =
	| { ok: true; strength: Strength; method: Method }
	| { ok: false; status: number; error: string; retryAt: number | null };

const refused = (status: number, error: string, retryAt: number | null = null): Outcome => ({
	ok: false,
	status,
	error,
	retryAt
});

const WRONG = 'That did not match. Check both and try again.';
const LOCKED = 'Too many tries. Wait, or use a passkey.';
const NOT_SET_UP = refused(503, 'Password sign-in is not set up.');

/** Whether this deployment has the password + puzzle door set up at all. */
export const passwordConfigured = (env: Env | undefined) =>
	Boolean(env?.PASSWORD_HASH && env.PASSWORD_PEPPER && env.SESSION_SECRET && parsePath(env.PUZZLE_PATH));

/**
 * One guess at a door: refused while the door is locked for this caller,
 * counted (and logged) when wrong, and clearing the caller's count when right.
 */
async function attempt(
	env: Env,
	request: Request,
	door: Door,
	success: Extract<Outcome, { ok: true }>,
	guess: () => Promise<boolean>,
	now: number
): Promise<Outcome> {
	const ip = clientIp(request);
	const until = await lockedUntil(env, door, ip, now);
	if (until) return refused(429, LOCKED, until);

	if (await guess()) {
		await recordSuccess(env, door, ip);
		return success;
	}

	const lock = await recordFailure(env, door, ip, now);
	await logEvent(env, lock ? 'locked' : 'failed', success.method, requestMeta(request), now);
	return lock ? refused(429, LOCKED, lock) : refused(401, WRONG);
}

export async function passwordAndPuzzle(
	env: Env,
	request: Request,
	input: { password: string; answer: string; challenge: string },
	now = Date.now()
): Promise<Outcome> {
	const route = parsePath(env.PUZZLE_PATH);
	if (!passwordConfigured(env) || !route) return NOT_SET_UP;

	// An expired or forged grid is not a guess: the page just needs a new one.
	const challenge = await readChallenge(input.challenge, env.SESSION_SECRET, now);
	if (!challenge) return refused(400, 'That puzzle expired. Here is a new one.');

	return attempt(env, request, 'pw', { ok: true, strength: 'limited', method: 'password' }, async () => {
		// Spent before checking, so each grid takes one answer, right or wrong.
		const fresh = await spendChallenge(env, challenge, now);
		const passwordOk = verifyPassword(input.password, env.PASSWORD_HASH, env.PASSWORD_PEPPER);
		return passwordOk && fresh && answerMatches(input.answer, challenge.grid, route);
	}, now);
}

export async function passwordAndRecoveryCode(
	env: Env,
	request: Request,
	input: { password: string; code: string },
	now = Date.now()
): Promise<Outcome> {
	if (!env.PASSWORD_HASH || !env.PASSWORD_PEPPER) return NOT_SET_UP;

	return attempt(env, request, 'rc', { ok: true, strength: 'full', method: 'recovery' }, async () => {
		// Only a right password may burn a code, so wrong guesses cannot use up the sheet.
		const passwordOk = verifyPassword(input.password, env.PASSWORD_HASH, env.PASSWORD_PEPPER);
		return passwordOk && (await spend(env, input.code, now));
	}, now);
}

/**
 * Opens a session after any door succeeded: sets the cookie, ends the session
 * the browser had before (a re-login replaces it), logs the sign-in, and
 * alerts on the doors meant for borrowed computers.
 */
export async function startSession(
	event: { request: Request; cookies: Cookies; platform?: App.Platform; url: URL; locals: App.Locals },
	strength: Strength,
	method: Method
) {
	const env = event.platform!.env;
	const meta = requestMeta(event.request);
	const { token } = await createSession(env, strength, method, meta);
	if (event.locals.session) await deleteSession(env, event.locals.session.id);
	event.cookies.set(SESSION_COOKIE, token, cookieOptions(strength));
	await logEvent(env, 'sign-in', method, meta);

	if (method === 'password' || method === 'recovery') {
		const where = [describeAgent(meta.userAgent), meta.country, meta.ip].filter(Boolean).join(' · ');
		alert(
			event.platform,
			method === 'password' ? 'ij5.dev: signed in with password + puzzle' : 'ij5.dev: recovery code used',
			[
				where,
				method === 'recovery' ? 'A full session. Print new codes if you are running low.' : 'A limited session, for one hour.',
				'Not you? Revoke it on the security page and change the password.'
			],
			event.url.origin
		);
	}
}
