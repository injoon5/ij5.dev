import { beforeEach, describe, expect, it } from 'vitest';
import * as data from './+server';
import * as item from './[key]/+server';
import { call, sqlite, testEnv } from '$lib/server/testing/d1';
import { MAX_DATA_APP_BYTES, MAX_DATA_KEYS, MAX_DATA_VALUE_BYTES } from '$lib/apps/app';

/**
 * Per-app data (Shelf plan §8.2): rev ordering, tombstones, atomic batches and
 * the limits, through the real handlers over real SQLite.
 */

const withSqlite = sqlite ? describe : describe.skip;

withSqlite('app data API', () => {
	let env: App.Platform['env'];
	let db: import('node:sqlite').DatabaseSync;

	beforeEach(async () => {
		({ env, db } = await testEnv());
	});

	const putKey = (slug: string, key: string, body: string) =>
		call(item.PUT, env, { method: 'PUT', path: `/api/apps/${slug}/data/${key}`, params: { slug, key }, body });
	const delKey = (slug: string, key: string) =>
		call(item.DELETE, env, { method: 'DELETE', path: `/api/apps/${slug}/data/${key}`, params: { slug, key } });
	const getKey = (slug: string, key: string) =>
		call(item.GET, env, { path: `/api/apps/${slug}/data/${key}`, params: { slug, key } });
	const batch = (slug: string, body: unknown) =>
		call(data.POST, env, {
			method: 'POST',
			path: `/api/apps/${slug}/data`,
			params: { slug },
			body: typeof body === 'string' ? body : JSON.stringify(body)
		});
	const all = async (slug: string) =>
		(await call(data.GET, env, { path: `/api/apps/${slug}/data`, params: { slug } })).json();
	const since = async (slug: string, rev: number) =>
		(await call(data.GET, env, { path: `/api/apps/${slug}/data?since=${rev}`, params: { slug } })).json();

	it('starts empty at rev 0', async () => {
		expect(await all('todo')).toEqual({ entries: {}, rev: 0 });
		expect(await since('todo', 0)).toEqual({ changes: [], rev: 0 });
	});

	it('puts, reads back and replaces a value', async () => {
		const res = await putKey('todo', 'items', '[{"t":"milk"}]');
		expect(await res.json()).toEqual({ key: 'items', rev: 1 });
		const got = await getKey('todo', 'items');
		expect(got.headers.get('content-type')).toBe('application/json');
		expect(await got.json()).toEqual([{ t: 'milk' }]);
		await putKey('todo', 'items', '[]');
		expect(await all('todo')).toEqual({ entries: { items: [] }, rev: 2 });
	});

	it('404s a missing key', async () => {
		const res = await getKey('todo', 'nope');
		expect(res.status).toBe(404);
	});

	it('increases rev across interleaved writes to different apps', async () => {
		const revs: number[] = [];
		for (const [slug, key] of [['a', 'x'], ['b', 'x'], ['a', 'y'], ['b', 'y'], ['a', 'x']]) {
			revs.push((await (await putKey(slug, key, '1')).json()).rev);
		}
		expect(revs).toEqual([1, 2, 3, 4, 5]);
		expect(await since('a', 0)).toEqual({
			changes: [
				{ key: 'y', value: 1, rev: 3 },
				{ key: 'x', value: 1, rev: 5 }
			],
			rev: 5
		});
		// Nothing newer: `since` is echoed back.
		expect(await since('b', 9)).toEqual({ changes: [], rev: 9 });
	});

	it('keeps rev increasing after the newest rows are deleted', async () => {
		await putKey('a', 'x', '1');
		await putKey('b', 'x', '1');
		db.prepare(`DELETE FROM app_data WHERE slug = 'b'`).run();
		expect((await (await putKey('a', 'y', '1')).json()).rev).toBe(3);
	});

	it('returns tombstones from since, and hides them from the full read', async () => {
		await putKey('todo', 'a', '1');
		await putKey('todo', 'b', '2');
		const del = await delKey('todo', 'a');
		expect(await del.json()).toEqual({ key: 'a', rev: 3 });
		expect(await all('todo')).toEqual({ entries: { b: 2 }, rev: 3 });
		expect(await since('todo', 2)).toEqual({ changes: [{ key: 'a', value: null, rev: 3 }], rev: 3 });
		expect((await getKey('todo', 'a')).status).toBe(404);
	});

	it('purges tombstones older than 30 days on the next write', async () => {
		await putKey('todo', 'a', '1');
		await delKey('todo', 'a');
		db.prepare(`UPDATE app_data SET updated_at = 0`).run();
		await putKey('todo', 'b', '1');
		expect(db.prepare(`SELECT key FROM app_data`).all().map((r) => ({ ...r }))).toEqual([{ key: 'b' }]);
	});

	it('applies a batch of sets and deletes under one rev', async () => {
		await putKey('todo', 'old', '1');
		const res = await batch('todo', { set: { a: { n: 1 }, b: null }, delete: ['old'] });
		expect(await res.json()).toEqual({ rev: 2 });
		expect(await all('todo')).toEqual({ entries: { a: { n: 1 }, b: null }, rev: 2 });
	});

	it('writes nothing from a batch when one value is too large', async () => {
		await putKey('todo', 'keep', '1');
		const res = await batch('todo', {
			set: { small: 1, huge: 'x'.repeat(MAX_DATA_VALUE_BYTES) },
			delete: ['keep']
		});
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: 'A value can be at most 64 KB.', key: 'huge' });
		expect(await all('todo')).toEqual({ entries: { keep: 1 }, rev: 1 });
	});

	it('refuses a single value over 64 KB', async () => {
		const ok = await putKey('todo', 'a', JSON.stringify('x'.repeat(MAX_DATA_VALUE_BYTES - 2)));
		expect(ok.status).toBe(200);
		const res = await putKey('todo', 'b', JSON.stringify('x'.repeat(MAX_DATA_VALUE_BYTES - 1)));
		expect(res.status).toBe(413);
	});

	it(`refuses key ${MAX_DATA_KEYS + 1}, but still lets existing keys change`, async () => {
		const set: Record<string, number> = {};
		for (let i = 0; i < MAX_DATA_KEYS; i++) set[`k${i}`] = i;
		expect((await batch('todo', { set })).status).toBe(200);
		const res = await putKey('todo', 'one-more', '1');
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: 'An app can keep at most 1,000 keys.' });
		expect((await putKey('todo', 'k0', '"changed"')).status).toBe(200);
	});

	it('refuses to store more than 5 MB in one app', async () => {
		const value = JSON.stringify('x'.repeat(MAX_DATA_VALUE_BYTES - 100));
		const set: Record<string, string> = {};
		const n = Math.floor(MAX_DATA_APP_BYTES / value.length);
		for (let i = 0; i < n; i++) set[`k${i}`] = JSON.parse(value);
		expect((await batch('todo', { set })).status).toBe(200);
		const res = await putKey('todo', 'last', value);
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: 'An app can store at most 5 MB of data.' });
		// Another app has its own allowance.
		expect((await putKey('other', 'last', value)).status).toBe(200);
	});

	it('validates keys and bodies', async () => {
		expect((await putKey('todo', 'x'.repeat(129), '1')).status).toBe(422);
		expect((await putKey('todo', 'tab\there', '1')).status).toBe(422);
		expect((await putKey('todo', 'a', '{bad')).status).toBe(400);
		expect((await batch('todo', '{bad')).status).toBe(400);
		expect((await batch('todo', {})).status).toBe(422);
		expect((await batch('todo', { set: [] })).status).toBe(422);
		expect((await batch('todo', { delete: [1] })).status).toBe(422);
		expect((await batch('todo', { set: { a: 1 }, delete: ['a'] })).status).toBe(422);
		expect((await batch('todo', { set: { 'a/b': 1 } })).status).toBe(422);
		const bad = await call(data.GET, env, { path: '/api/apps/todo/data?since=-1', params: { slug: 'todo' } });
		expect(bad.status).toBe(400);
	});

	it('answers 401 with no data in the body', async () => {
		await putKey('todo', 'secret', '"hidden value"');
		for (const token of [null, 'wrong']) {
			const res = await call(data.GET, env, { path: '/api/apps/todo/data', params: { slug: 'todo' }, token });
			expect(res.status).toBe(401);
			const text = await res.text();
			expect(text).not.toContain('hidden value');
			expect(Object.keys(JSON.parse(text))).toEqual(['error']);
		}
	});
});
