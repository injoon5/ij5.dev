import { describe, expect, it } from 'vitest';
import { answerMatches, expectedAnswer, newChallenge, parsePath, readChallenge, spendChallenge } from './puzzle.server';
import { migratedDb, testEnv } from '$lib/server/testing/d1';

const SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('parsePath', () => {
	it('reads a route in any common separator, any case', () => {
		expect(parsePath('A1 B2 C3 D4')).toEqual([0, 5, 10, 15]);
		expect(parsePath('a1,b1;c1-d1')).toEqual([0, 1, 2, 3]);
		expect(parsePath('D4 D4 A1 A1')).toEqual([15, 15, 0, 0]);
	});

	it('refuses routes that are too short, too long or off the grid', () => {
		for (const bad of [undefined, '', 'A1 B2 C3', 'A1 B2 C3 E4', 'A1 B2 C3 A5', 'A1 '.repeat(9)]) {
			expect(parsePath(bad)).toBeNull();
		}
	});
});

describe('challenges', () => {
	it('deals 16 digits and reads its own token back', async () => {
		const { token, grid } = await newChallenge(SECRET);
		expect(grid).toHaveLength(16);
		expect(grid.every((d) => Number.isInteger(d) && d >= 0 && d <= 9)).toBe(true);
		expect((await readChallenge(token, SECRET))?.grid).toEqual(grid);
	});

	it('refuses a token whose grid was edited — the signature covers it', async () => {
		const { token } = await newChallenge(SECRET);
		const [payload, sig] = token.split('.');
		const c = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
		c.grid = c.grid.map(() => 1);
		const forged = btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		expect(await readChallenge(`${forged}.${sig}`, SECRET)).toBeNull();
	});

	it('refuses another secret, an expired grid and garbage', async () => {
		const { token } = await newChallenge(SECRET, 0);
		expect(await readChallenge(token, 'other', 1)).toBeNull();
		expect(await readChallenge(token, SECRET, 10 * 60e3)).toBeNull();
		for (const junk of ['', '.', 'a.b', token.split('.')[0]]) expect(await readChallenge(junk, SECRET)).toBeNull();
	});

	it('takes the digits along the route, with or without spaces', () => {
		const grid = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6];
		const path = parsePath('A1 B2 C3 D4')!;
		expect(expectedAnswer(grid, path)).toBe('1616');
		expect(answerMatches('16 16', grid, path)).toBe(true);
		expect(answerMatches('1617', grid, path)).toBe(false);
		expect(answerMatches('', grid, path)).toBe(false);
	});
});

describe('spendChallenge', () => {
	it('lets a grid be answered once', async () => {
		const { env } = await testEnv(migratedDb());
		const { token } = await newChallenge(SECRET);
		const c = (await readChallenge(token, SECRET))!;
		expect(await spendChallenge(env, c)).toBe(true);
		expect(await spendChallenge(env, c)).toBe(false);
	});
});
