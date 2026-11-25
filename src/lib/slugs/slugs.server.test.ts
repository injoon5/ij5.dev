import { describe, expect, it } from 'vitest';
import { chooseSlug, randomSlug, slugProblem } from './slugs.server';
import { SLUG_PATTERN } from './slugs';
import { migratedDb, testEnv } from '$lib/server/testing/d1';

describe('randomSlug', () => {
	it('is always a valid slug with nothing that reads as something else', () => {
		for (let i = 0; i < 200; i++) {
			const slug = randomSlug();
			expect(SLUG_PATTERN.test(slug)).toBe(true);
			expect(slug).not.toMatch(/[ilo01]/);
		}
	});
});

describe('the shared namespace', () => {
	async function seeded() {
		const { env, db } = await testEnv(migratedDb());
		db.prepare(`INSERT INTO slugs (slug, target_url, status, created_at) VALUES ('gh', 'https://github.com', 302, 0)`).run();
		db.prepare(`INSERT INTO pastes (slug, body, created_at, cache) VALUES ('notes', 'x', 0, 1)`).run();
		db.prepare(`INSERT INTO files (slug, key, name, mime, bytes, created_at) VALUES ('cv', 'dl/cv', 'cv.pdf', 'application/pdf', 1, 0)`).run();
		return env;
	}

	it('refuses a name already used by a link, a paste or a file, whatever is being created', async () => {
		const env = await seeded();
		expect(await slugProblem(env, 'gh')).toMatch(/link/);
		expect(await slugProblem(env, 'notes')).toMatch(/paste/);
		expect(await slugProblem(env, 'cv')).toMatch(/file/);
		expect(await slugProblem(env, 'fresh')).toBeUndefined();
	});

	it('refuses every top-level route and malformed names before looking anything up', async () => {
		const env = await seeded();
		for (const route of ['admin', 'login', 'p', 'd', 'raw', 'oauth', 'new']) {
			expect(await slugProblem(env, route)).toMatch(/reserved/);
		}
		for (const bad of ['', '-x', 'a/b', 'a b', 'x'.repeat(65)]) expect(await slugProblem(env, bad)).toBeTruthy();
	});

	it('takes the asked-for name when free, and deals a free one when none is asked for', async () => {
		const env = await seeded();
		expect(await chooseSlug(env, ' mine ')).toEqual({ ok: true, slug: 'mine' });
		expect(await chooseSlug(env, 'gh')).toMatchObject({ ok: false });
		const dealt = await chooseSlug(env, '');
		expect(dealt.ok && SLUG_PATTERN.test(dealt.slug)).toBe(true);
	});
});
