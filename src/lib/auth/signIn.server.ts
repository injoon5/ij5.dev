import type { Cookies } from '@sveltejs/kit';
import { clientIp, requestMeta } from '$lib/server/request';
import { alert, describeAgent, logEvent } from './events.server';
import { verifyPassword } from './password.server';
import { answerMatches, parsePath, readChallenge, spendChallenge } from './puzzle.server';
import { spend } from './recovery.server';
import { createSession, cookieOptions, SESSION_COOKIE, type Method, type Strength } from './sessions.server';
import { lockedUntil, recordFailure, recordSuccess, type Door } from './throttle.server';

/**
 * The two doors for signing in without any of your devices (§4):
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
	| { ok: false; status: number; error: string; retryAt?: number };

const WRONG = 'That did not match. Check both and try again.';

/** Whether this deployment has the password door set up at all. */
export const passwordConfigured = (env: Env | undefined) =>
	Boolean(env?.PASSWORD_HASH && env.PASSWORD_PEPPER && env.SESSION_SECRET && parsePath(env.PUZZLE_PATH));

async function locked(env: Env, door: Door, ip: string, now: number): Promise<Outcome | null> {
	const until = await lockedUntil(env, door, ip, now);
	return until
		? { ok: false, status: 429, error: 'Too many tries. Wait, or use a passkey.', retryAt: until }
		: null;
}

async function failed(env: Env, door: Door, ip: string, meta: ReturnType<typeof requestMeta>, now: number) {
	const until = await recordFailure(env, door, ip, now);
	await logEvent(env, until ? 'locked' : 'failed', door === 'pw' ? 'password' : 'recovery', meta, now);
	return until;
}

export async function passwordAndPuzzle(
	env: Env,
	request: Request,
	input: { password: string; answer: string; challenge: string },
	now = Date.now()
): Promise<Outcome> {
	if (!passwordConfigured(env)) return { ok: false, status: 503, error: 'Password sign-in is not set up.' };
	const ip = clientIp(request);
	const meta = requestMeta(request);

	const lock = await locked(env, 'pw', ip, now);
	if (lock) return lock;

	const challenge = await readChallenge(input.challenge, env.SESSION_SECRET, now);
	if (!challenge) {
		// Expired or not ours. Not a guess, so not counted — the page just
		// needs a fresh grid.
		return { ok: false, status: 400, error: 'That puzzle expired. Here is a new one.' };
	}

	// Spend the grid before checking anything, so it gets one answer whether
	// that answer is right or not.
	const fresh = await spendChallenge(env, challenge, now);
	const passwordOk = verifyPassword(input.password, env.PASSWORD_HASH, env.PASSWORD_PEPPER);
	const puzzleOk = fresh && answerMatches(input.answer, challenge.grid, parsePath(env.PUZZLE_PATH)!);

	if (!passwordOk || !puzzleOk) {
		const until = await failed(env, 'pw', ip, meta, now);
		return { ok: false, status: until ? 429 : 401, error: until ? 'Too many tries. Wait, or use a passkey.' : WRONG, retryAt: until || undefined };
	}

	await recordSuccess(env, 'pw', ip);
	return { ok: true, strength: 'limited', method: 'password' };
}

export async function passwordAndRecoveryCode(
	env: Env,
	request: Request,
	input: { password: string; code: string },
	now = Date.now()
): Promise<Outcome> {
	if (!env.PASSWORD_HASH || !env.PASSWORD_PEPPER) {
		return { ok: false, status: 503, error: 'Password sign-in is not set up.' };
	}
	const ip = clientIp(request);
	const meta = requestMeta(request);

	const lock = await locked(env, 'rc', ip, now);
	if (lock) return lock;

	const passwordOk = verifyPassword(input.password, env.PASSWORD_HASH, env.PASSWORD_PEPPER);
	// Only a right password may burn a code: a wrong guess must not be able to
	// use up the sheet.
	const codeOk = passwordOk && (await spend(env, input.code, now));

	if (!codeOk) {
		const until = await failed(env, 'rc', ip, meta, now);
		return { ok: false, status: until ? 429 : 401, error: until ? 'Too many tries. Wait, or use a passkey.' : WRONG, retryAt: until || undefined };
	}

	await recordSuccess(env, 'rc', ip);
	return { ok: true, strength: 'full', method: 'recovery' };
}

/**
 * Opens a session after any door succeeded: sets the cookie, ends the session
 * the browser had before (a re-login replaces it, it does not stack), logs the
 * sign-in, and alerts on the doors meant for borrowed computers.
 */
export async function startSession(
	event: { request: Request; cookies: Cookies; platform?: App.Platform; url: URL; locals: App.Locals },
	strength: Strength,
	method: Method
) {
	const env = event.platform!.env;
	const meta = requestMeta(event.request);
	const previous = event.locals.session;
	const { token } = await createSession(env, strength, method, meta);
	if (previous) await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(previous.id).run();
	event.cookies.set(SESSION_COOKIE, token, cookieOptions(strength));
	await logEvent(env, 'sign-in', method, meta);

	if (method === 'password' || method === 'recovery') {
		alert(
			event.platform,
			method === 'password' ? 'ij5.dev: signed in with password + puzzle' : 'ij5.dev: recovery code used',
			[
				`${describeAgent(meta.userAgent)}${meta.country ? ` · ${meta.country}` : ''}${meta.ip ? ` · ${meta.ip}` : ''}`,
				method === 'recovery' ? 'A full session. Print new codes if you are running low.' : 'A limited session, for one hour.',
				'Not you? Revoke it on the security page and change the password.'
			],
			event.url.origin
		);
	}
}
