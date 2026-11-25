import { describe, expect, it } from 'vitest';
import { lockFor, lockedUntil, recordFailure, recordSuccess } from './throttle.server';
import { migratedDb, sqlite, testEnv } from '$lib/server/testing/d1';

describe('lockFor', () => {
	const p = { free: 5, baseMs: 60e3, capMs: 3600e3 };
	it('lets the first few failures go, then doubles up to the cap', () => {
		expect([1, 2, 3, 4].map((n) => lockFor(n, p))).toEqual([0, 0, 0, 0]);
		expect(lockFor(5, p)).toBe(60e3);
		expect(lockFor(6, p)).toBe(120e3);
		expect(lockFor(30, p)).toBe(3600e3);
	});
});

(sqlite ? describe : describe.skip)('throttle', () => {
	const now = 1_800_000_000_000;

	it('locks one address after five failures and leaves others alone', async () => {
		const { env } = await testEnv(migratedDb());
		for (let i = 0; i < 4; i++) expect(await recordFailure(env, 'pw', '1.1.1.1', now)).toBe(0);
		expect(await recordFailure(env, 'pw', '1.1.1.1', now)).toBe(now + 60e3);
		expect(await lockedUntil(env, 'pw', '1.1.1.1', now)).toBe(now + 60e3);
		expect(await lockedUntil(env, 'pw', '2.2.2.2', now)).toBe(0);
		// After the lock runs out the door is open again.
		expect(await lockedUntil(env, 'pw', '1.1.1.1', now + 61e3)).toBe(0);
	});

	it('locks everyone after twenty failures spread over many addresses', async () => {
		const { env } = await testEnv(migratedDb());
		for (let i = 0; i < 19; i++) await recordFailure(env, 'pw', `10.0.0.${i}`, now);
		expect(await lockedUntil(env, 'pw', '9.9.9.9', now)).toBe(0);
		await recordFailure(env, 'pw', '10.0.1.1', now);
		expect(await lockedUntil(env, 'pw', '9.9.9.9', now)).toBe(now + 5 * 60e3);
	});

	it('keeps the recovery-code door separate from the puzzle door', async () => {
		const { env } = await testEnv(migratedDb());
		for (let i = 0; i < 25; i++) await recordFailure(env, 'pw', `10.0.0.${i}`, now);
		expect(await lockedUntil(env, 'rc', '9.9.9.9', now)).toBe(0);
	});

	it('forgets failures a day after the last one, and on success', async () => {
		const { env } = await testEnv(migratedDb());
		for (let i = 0; i < 4; i++) await recordFailure(env, 'pw', '1.1.1.1', now);
		expect(await recordFailure(env, 'pw', '1.1.1.1', now + 25 * 3600e3)).toBe(0);
		for (let i = 0; i < 3; i++) await recordFailure(env, 'pw', '1.1.1.1', now);
		await recordSuccess(env, 'pw', '1.1.1.1');
		expect(await recordFailure(env, 'pw', '1.1.1.1', now)).toBe(0);
	});
});
