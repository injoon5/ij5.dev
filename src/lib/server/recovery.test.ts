import { describe, expect, it } from 'vitest';
import { COUNT, newCode, normalise, regenerate, remaining, spend } from './recovery';
import { migratedDb, sqlite, testEnv } from './testing/d1';

describe('codes', () => {
	it('look like XXXXX-XXXXX in Crockford base32', () => {
		for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
	});

	it('forgive case, spacing and the letters people misread', () => {
		expect(normalise('abcde-fghjk')).toBe('ABCDEFGHJK');
		expect(normalise(' o1i2l 34567 ')).toBe('0112134567');
		expect(normalise('ABCDE-FGHJ')).toBeNull();
		expect(normalise('UUUUU-UUUUU')).toBeNull();
	});
});

(sqlite ? describe : describe.skip)('recovery codes in D1', () => {
	it('each work once, and a new sheet kills the old one', async () => {
		const { env } = await testEnv(migratedDb());
		const codes = await regenerate(env);
		expect(codes).toHaveLength(COUNT);
		expect(await remaining(env)).toMatchObject({ left: COUNT, total: COUNT });

		expect(await spend(env, codes[3].toLowerCase())).toBe(true);
		expect(await spend(env, codes[3])).toBe(false);
		expect((await remaining(env)).left).toBe(COUNT - 1);

		const fresh = await regenerate(env);
		expect(await spend(env, codes[4])).toBe(false);
		expect(await spend(env, fresh[0])).toBe(true);
	});

	it('refuses junk without a query error', async () => {
		const { env } = await testEnv(migratedDb());
		expect(await spend(env, '')).toBe(false);
		expect(await spend(env, "'; DROP TABLE recovery_codes; --")).toBe(false);
	});
});
