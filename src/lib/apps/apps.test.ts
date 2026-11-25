import { beforeEach, describe, expect, it } from 'vitest';
import { appContent, appVersion, etagMatches, HISTORY, LIST_APPS, listVersions, putApp, revertApp } from './apps.server';
import { mintKey } from './installKeys.server';
import { sqlite, testEnv } from '$lib/server/testing/d1';
import { MAX_APP_BYTES } from '$lib/apps/app';

/**
 * Shelf plan §1.5: the content hash, the limits, and the list query — plus
 * the history that Revert stands on, run against real SQLite with every
 * migration applied.
 */

const APP = { name: 'Habits', icon: 'checkmark.circle', tint: 'green' as const, source: 'struct A {}\n' };

describe('appVersion', () => {
	it('is stable for the same content', async () => {
		expect(await appVersion(APP)).toBe(await appVersion({ ...APP }));
		expect(await appVersion(APP)).toMatch(/^[A-Za-z0-9_-]{16}$/);
	});

	it('changes when any field changes', async () => {
		const base = await appVersion(APP);
		for (const change of [
			{ name: 'Habit' },
			{ icon: null },
			{ icon: 'star' },
			{ tint: 'red' as const },
			{ source: 'struct B {}\n' }
		]) {
			expect(await appVersion({ ...APP, ...change })).not.toBe(base);
		}
	});

	it('cannot be fooled by moving text from one field into the next', async () => {
		expect(await appVersion({ ...APP, name: 'ab', icon: 'c' })).not.toBe(
			await appVersion({ ...APP, name: 'a', icon: 'bc' })
		);
	});
});

describe('appContent', () => {
	it('accepts every named tint and nothing else', () => {
		expect(appContent.safeParse({ ...APP, tint: 'indigo' }).success).toBe(true);
		for (const tint of ['magenta', 'Blue', '#ff0000', '']) {
			expect(appContent.safeParse({ ...APP, tint }).success).toBe(false);
		}
	});

	it('limits the name to 32 characters and the source to MAX_APP_BYTES', () => {
		expect(appContent.safeParse({ ...APP, name: 'x'.repeat(32) }).success).toBe(true);
		expect(appContent.safeParse({ ...APP, name: 'x'.repeat(33) }).success).toBe(false);
		expect(appContent.safeParse({ ...APP, source: 'x'.repeat(MAX_APP_BYTES) }).success).toBe(true);
		// Bytes, not characters: 'é' is two bytes in UTF-8.
		expect(appContent.safeParse({ ...APP, source: 'é'.repeat(MAX_APP_BYTES / 2 + 1) }).success).toBe(false);
	});

	it('turns an empty icon into null', () => {
		const r = appContent.safeParse({ ...APP, icon: '  ' });
		expect(r.success && r.data.icon).toBe(null);
	});
});

describe('the list query', () => {
	it('never selects source', () => {
		expect(LIST_APPS).not.toMatch(/\bsource\b/);
	});
});

describe('etagMatches', () => {
	it('matches strong, weakened and listed tags', () => {
		expect(etagMatches('"abc"', '"abc"')).toBe(true);
		expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
		expect(etagMatches('"x", W/"abc"', '"abc"')).toBe(true);
		expect(etagMatches('"abd"', '"abc"')).toBe(false);
		expect(etagMatches(null, '"abc"')).toBe(false);
	});
});

const withSqlite = sqlite ? describe : describe.skip;

withSqlite('history', () => {
	let env: App.Platform['env'];
	beforeEach(async () => {
		({ env } = await testEnv());
	});

	const put = (source: string) => putApp(env, 'habits', { ...APP, source }, { origin: 'admin' });

	it('creates, then updates, keeping the previous version', async () => {
		const a = await put('a\n');
		expect(a.ok && a.created).toBe(true);
		expect(a.ok && a.app.revertible).toBe(false);

		const b = await put('b\n');
		expect(b.ok && b.created).toBe(false);
		expect(b.ok && b.app.revertible).toBe(true);
		expect((await listVersions(env, 'habits')).map((v) => v.version)).toEqual([
			a.ok && a.app.version
		]);
	});

	it('changes nothing when the content is identical', async () => {
		const a = await put('a\n');
		const again = await put('a\n');
		expect(again.ok && again.app).toEqual(a.ok && a.app);
		expect(await listVersions(env, 'habits')).toEqual([]);
	});

	it(`keeps the last ${HISTORY} versions and never the current one`, async () => {
		for (let i = 0; i < HISTORY + 5; i++) await put(`v${i}\n`);
		const versions = await listVersions(env, 'habits');
		expect(versions).toHaveLength(HISTORY);
		const current = await put(`v${HISTORY + 4}\n`);
		expect(versions.map((v) => v.version)).not.toContain(current.ok && current.app.version);
	});

	it('reverts, and a second revert is a redo', async () => {
		const a = await put('a\n');
		const b = await put('b\n');
		const r1 = await revertApp(env, 'habits');
		expect(r1.ok && r1.app.version).toBe(a.ok && a.app.version);
		const r2 = await revertApp(env, 'habits');
		expect(r2.ok && r2.app.version).toBe(b.ok && b.app.version);
	});

	it('has nothing to revert to on a new app', async () => {
		await put('a\n');
		expect(await revertApp(env, 'habits')).toEqual({ ok: false, reason: 'no-history' });
		expect(await revertApp(env, 'nope')).toEqual({ ok: false, reason: 'no-app' });
	});

	it('lets only the request whose claim is on the key write', async () => {
		await put('a\n');
		const key = await mintKey(env, 'habits');
		if (!key.ok) throw new Error('mint failed');
		const opts = (claim: string) => ({ origin: 'key' as const, keyId: key.id, createOnly: false, claim });

		const first = await putApp(env, 'habits', { ...APP, source: 'b\n' }, opts('first'));
		// The second request already passed its key check before the first
		// consumed the key; the batch is what has to stop it.
		const second = await putApp(env, 'habits', { ...APP, source: 'c\n' }, opts('second'));
		expect(first.ok).toBe(true);
		expect(second).toEqual({ ok: false, reason: 'key' });
		expect((await listVersions(env, 'habits')).map((v) => v.version)).toHaveLength(1);
	});
});
