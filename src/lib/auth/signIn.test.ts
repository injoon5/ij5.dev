import { describe, expect, it } from 'vitest';
import { hashPassword } from './password.server';
import { expectedAnswer, newChallenge, parsePath } from './puzzle.server';
import { regenerate } from './recovery.server';
import { passwordAndPuzzle, passwordAndRecoveryCode } from './signIn.server';
import { migratedDb, testEnv } from '$lib/server/testing/d1';

const PEPPER = 'pepper-for-tests';
const SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const ROUTE = 'A1 B2 C3 C4';
const PASSWORD = 'tangerine sky';

async function setup() {
	const { env, db } = await testEnv(migratedDb());
	Object.assign(env, {
		PASSWORD_HASH: hashPassword(PASSWORD, PEPPER, 8192, 1),
		PASSWORD_PEPPER: PEPPER,
		SESSION_SECRET: SECRET,
		PUZZLE_PATH: ROUTE
	});
	return { env, db };
}

const req = (ip = '198.51.100.1') =>
	new Request('https://ij5.dev/login', { method: 'POST', headers: { 'cf-connecting-ip': ip } });

async function grid() {
	const { token, grid } = await newChallenge(SECRET);
	return { challenge: token, right: expectedAnswer(grid, parsePath(ROUTE)!) };
}

const wrongOf = (answer: string) => answer.replace(/^./, (d) => String((Number(d) + 1) % 10));

describe('password + puzzle', () => {
	it('opens a limited session with both halves right', async () => {
		const { env } = await setup();
		const { challenge, right } = await grid();
		expect(await passwordAndPuzzle(env, req(), { password: PASSWORD, answer: right, challenge })).toEqual({
			ok: true,
			strength: 'limited',
			method: 'password'
		});
	});

	it('says the same thing whichever half is wrong', async () => {
		const { env } = await setup();
		const a = await grid();
		const b = await grid();
		const wrongPassword = await passwordAndPuzzle(env, req(), { password: 'nope', answer: a.right, challenge: a.challenge });
		const wrongPuzzle = await passwordAndPuzzle(env, req(), { password: PASSWORD, answer: wrongOf(b.right), challenge: b.challenge });
		expect(wrongPassword).toEqual(wrongPuzzle);
		expect(wrongPassword).toMatchObject({ ok: false, status: 401 });
	});

	it('refuses a grid answered before, even with the right answer — a keylogged login cannot be replayed', async () => {
		const { env } = await setup();
		const { challenge, right } = await grid();
		expect((await passwordAndPuzzle(env, req(), { password: PASSWORD, answer: right, challenge })).ok).toBe(true);
		expect((await passwordAndPuzzle(env, req('203.0.113.9'), { password: PASSWORD, answer: right, challenge })).ok).toBe(false);
	});

	it('asks for a fresh grid, without counting a guess, when the token is bad', async () => {
		const { env, db } = await setup();
		const out = await passwordAndPuzzle(env, req(), { password: PASSWORD, answer: '1234', challenge: 'garbage' });
		expect(out).toMatchObject({ ok: false, status: 400 });
		expect(db.prepare('SELECT COUNT(*) AS n FROM auth_throttle').get()).toEqual({ n: 0 });
	});

	it('locks after five failures — and the right answer does not get through the lock', async () => {
		const { env } = await setup();
		let last;
		for (let i = 0; i < 5; i++) {
			const g = await grid();
			last = await passwordAndPuzzle(env, req(), { password: 'guess' + i, answer: g.right, challenge: g.challenge });
		}
		expect(last).toMatchObject({ ok: false, status: 429 });
		const g = await grid();
		const out = await passwordAndPuzzle(env, req(), { password: PASSWORD, answer: g.right, challenge: g.challenge });
		expect(out).toMatchObject({ ok: false, status: 429 });
		// Another address is not locked out by it.
		const h = await grid();
		expect((await passwordAndPuzzle(env, req('192.0.2.50'), { password: PASSWORD, answer: h.right, challenge: h.challenge })).ok).toBe(true);
	});

	it('is closed when it is not configured', async () => {
		const { env } = await setup();
		env.PUZZLE_PATH = 'A1';
		const g = await grid();
		expect(await passwordAndPuzzle(env, req(), { password: PASSWORD, answer: g.right, challenge: g.challenge })).toMatchObject({ ok: false, status: 503 });
	});
});

describe('password + recovery code', () => {
	it('opens a full session and burns the code', async () => {
		const { env } = await setup();
		const [code] = await regenerate(env);
		expect(await passwordAndRecoveryCode(env, req(), { password: PASSWORD, code })).toEqual({
			ok: true,
			strength: 'full',
			method: 'recovery'
		});
		expect((await passwordAndRecoveryCode(env, req(), { password: PASSWORD, code })).ok).toBe(false);
	});

	it('does not let a wrong password use up a code', async () => {
		const { env } = await setup();
		const [code] = await regenerate(env);
		expect((await passwordAndRecoveryCode(env, req(), { password: 'nope', code })).ok).toBe(false);
		expect((await passwordAndRecoveryCode(env, req(), { password: PASSWORD, code })).ok).toBe(true);
	});
});
