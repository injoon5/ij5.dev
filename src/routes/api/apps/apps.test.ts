import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import * as list from './+server';
import * as item from './[slug]/+server';
import * as source from './[slug]/source/+server';
import * as revert from './[slug]/revert/+server';
import * as data from './[slug]/data/+server';
import * as dataKey from './[slug]/data/[key]/+server';
import * as keys from '../install-keys/+server';
import * as keyItem from '../install-keys/[id]/+server';
import { call, sqlite, testEnv } from '$lib/server/testing/d1';
import { KEY_ERROR, MAX_KEY_ATTEMPTS } from '$lib/apps/installKeys.server';
import { MAX_APP_BYTES } from '$lib/apps/app';

/**
 * The apps API and install keys end to end (Shelf plan §1.5, §9.5): the real
 * handlers, called the way the adapter calls them, over real SQLite with
 * every migration applied.
 */

const withSqlite = sqlite ? describe : describe.skip;

const APP = { name: 'Habits', icon: 'checkmark.circle', tint: 'green', source: 'struct ContentView {}\n' };
const SWIFT = '// Name: Tip Jar\n// Icon: dollarsign.circle\n// Tint: mint\n\nstruct ContentView {}\n';

withSqlite('apps API', () => {
	let env: App.Platform['env'];
	let db: import('node:sqlite').DatabaseSync;

	beforeEach(async () => {
		({ env, db } = await testEnv());
	});

	const put = (slug: string, body: unknown, token?: string | null, type?: string) =>
		call(item.PUT, env, {
			method: 'PUT',
			path: `/api/apps/${slug}`,
			params: { slug },
			token,
			type,
			body: typeof body === 'string' ? body : JSON.stringify(body)
		});

	const mint = async (slug?: string) => {
		const res = await call(keys.POST, env, {
			method: 'POST',
			path: '/api/install-keys',
			body: JSON.stringify(slug ? { slug } : {})
		});
		expect(res.status).toBe(201);
		return (await res.json()) as { key: string; id: string; expires_at: number };
	};

	const status = async (id: string) =>
		(await call(keyItem.GET, env, { path: `/api/install-keys/${id}`, params: { id } })).json();

	describe('PUT', () => {
		it('creates with 201, then updates with 200', async () => {
			const created = await put('habits', APP);
			expect(created.status).toBe(201);
			const meta = await created.json();
			expect(meta).toMatchObject({ slug: 'habits', name: 'Habits', tint: 'green', revertible: false });
			expect(meta).not.toHaveProperty('source');

			const updated = await put('habits', { ...APP, name: 'Habit' });
			expect(updated.status).toBe(200);
			expect(await updated.json()).toMatchObject({ name: 'Habit', revertible: true });
		});

		it('keeps the same version for identical content and still answers 200', async () => {
			const a = await (await put('habits', APP)).json();
			const again = await put('habits', APP);
			expect(again.status).toBe(200);
			expect(await again.json()).toEqual(a);
		});

		it('reads a text/x-swift body with the shared parser', async () => {
			const res = await put('tip-jar', SWIFT, undefined, 'text/x-swift');
			expect(res.status).toBe(201);
			const full = await (
				await call(item.GET, env, { path: '/api/apps/tip-jar', params: { slug: 'tip-jar' } })
			).json();
			expect(full).toMatchObject({ name: 'Tip Jar', icon: 'dollarsign.circle', tint: 'mint', source: SWIFT });
		});

		it('parses every shared fixture the way the parser test expects', async () => {
			const dir = fileURLToPath(new URL('../../../../fixtures/replies/', import.meta.url));
			const input = readFileSync(`${dir}odd-header.md`, 'utf8');
			const expected = JSON.parse(readFileSync(`${dir}odd-header.json`, 'utf8'));
			expect((await put('odd', input, undefined, 'text/x-swift')).status).toBe(201);
			const full = await (await call(item.GET, env, { path: '/api/apps/odd', params: { slug: 'odd' } })).json();
			expect(full).toMatchObject({ name: expected.name, icon: expected.icon, tint: expected.tint, source: expected.source });
		});

		it('falls back to blue for an unknown tint in a Swift file, but refuses one in JSON', async () => {
			const swift = SWIFT.replace('mint', 'magenta');
			expect(await (await put('a', swift, undefined, 'text/x-swift')).json()).toMatchObject({ tint: 'blue' });
			const res = await put('b', { ...APP, tint: 'magenta' });
			expect(res.status).toBe(422);
			expect((await res.json()).fields.tint).toBeTruthy();
		});

		it('refuses a Swift file with no // Name: line', async () => {
			const res = await put('a', '// Icon: star\nstruct A {}\n', undefined, 'text/x-swift');
			expect(res.status).toBe(422);
			expect(await res.json()).toEqual({
				error: 'That app is not valid.',
				fields: { name: 'Start the file with a // Name: line.' }
			});
		});

		it('answers 400 for bad JSON, 422 for a bad slug or long name, 413 over the limit', async () => {
			expect((await put('a', '{nope')).status).toBe(400);
			expect((await put('-bad', APP)).status).toBe(422);
			expect((await put('a', { ...APP, name: 'x'.repeat(33) })).status).toBe(422);

			const big = await put('a', { ...APP, source: 'x'.repeat(MAX_APP_BYTES + 1) });
			expect(big.status).toBe(413);
			expect((await big.json()).error).toBe('An app can be at most 256 KB.');
			const bigSwift = await put('a', `// Name: A\n${'x'.repeat(MAX_APP_BYTES)}`, undefined, 'text/x-swift');
			expect(bigSwift.status).toBe(413);
		});
	});

	describe('GET /api/apps', () => {
		it('lists by name with a strong ETag, and 304s on If-None-Match', async () => {
			await put('zeta', { ...APP, name: 'Zeta' });
			await put('alpha', { ...APP, name: 'alpha' });
			const res = await call(list.GET, env, { path: '/api/apps' });
			expect(res.status).toBe(200);
			const etag = res.headers.get('etag')!;
			expect(etag).toMatch(/^"[^"]+"$/);
			const body = await res.json();
			expect(body.apps.map((a: { slug: string }) => a.slug)).toEqual(['alpha', 'zeta']);
			expect(body.apps[0]).not.toHaveProperty('source');

			for (const tag of [etag, `W/${etag}`]) {
				const again = await call(list.GET, env, { path: '/api/apps', headers: { 'if-none-match': tag } });
				expect(again.status).toBe(304);
				expect(await again.text()).toBe('');
				expect(again.headers.get('etag')).toBe(etag);
			}

			await put('zeta', { ...APP, name: 'Zeta', tint: 'red' });
			const changed = await call(list.GET, env, { path: '/api/apps', headers: { 'if-none-match': etag } });
			expect(changed.status).toBe(200);
		});

		it('answers a wrong token with 401 and never echoes it', async () => {
			const wrong = 'wrong-token-that-must-not-appear';
			const res = await call(list.GET, env, { path: '/api/apps', token: wrong });
			expect(res.status).toBe(401);
			const text = await res.text();
			expect(text).not.toContain(wrong);
			expect(JSON.parse(text)).toEqual({ error: 'That token is not right.' });
		});

		it('answers a missing token with 401', async () => {
			expect((await call(list.GET, env, { path: '/api/apps', token: null })).status).toBe(401);
		});
	});

	describe('GET, DELETE, revert', () => {
		it('404s an unknown app', async () => {
			expect((await call(item.GET, env, { path: '/api/apps/x', params: { slug: 'x' } })).status).toBe(404);
		});

		it('deletes an app and keeps its data unless asked', async () => {
			await put('habits', APP);
			await call(dataKey.PUT, env, {
				method: 'PUT',
				path: '/api/apps/habits/data/k',
				params: { slug: 'habits', key: 'k' },
				body: '1'
			});
			const del = await call(item.DELETE, env, { method: 'DELETE', path: '/api/apps/habits', params: { slug: 'habits' } });
			expect(await del.json()).toEqual({ slug: 'habits', deleted: true });
			const kept = await call(data.GET, env, { path: '/api/apps/habits/data', params: { slug: 'habits' } });
			expect((await kept.json()).entries).toEqual({ k: 1 });

			await put('habits', APP);
			await call(item.DELETE, env, {
				method: 'DELETE',
				path: '/api/apps/habits?data=delete',
				params: { slug: 'habits' }
			});
			const gone = await call(data.GET, env, { path: '/api/apps/habits/data', params: { slug: 'habits' } });
			expect(await gone.json()).toEqual({ entries: {}, rev: 0 });
		});

		it('reverts to the previous version, and 404s with nothing to revert to', async () => {
			const first = await (await put('habits', APP)).json();
			const none = await call(revert.POST, env, { method: 'POST', path: '/api/apps/habits/revert', params: { slug: 'habits' } });
			expect(none.status).toBe(404);
			expect(await none.json()).toEqual({ error: 'Nothing to revert to.' });

			await put('habits', { ...APP, source: 'changed\n' });
			const back = await call(revert.POST, env, { method: 'POST', path: '/api/apps/habits/revert', params: { slug: 'habits' } });
			expect(back.status).toBe(200);
			expect((await back.json()).version).toBe(first.version);
		});
	});

	describe('install keys', () => {
		it('mints a key whose status is waiting, then used with the slug it installed', async () => {
			const { key, id, expires_at } = await mint();
			expect(key).toMatch(/^shelf_ik_/);
			expect(expires_at).toBeGreaterThan(Date.now());
			expect(await status(id)).toEqual({ status: 'waiting' });

			expect((await put('tip-jar', SWIFT, key, 'text/x-swift')).status).toBe(201);
			expect(await status(id)).toEqual({ status: 'used', slug: 'tip-jar' });

			// One use only.
			const again = await put('other', SWIFT, key, 'text/x-swift');
			expect(again.status).toBe(401);
			expect(await again.json()).toEqual({ error: KEY_ERROR });
		});

		it('stores only a hash of the secret', async () => {
			const { key } = await mint();
			const row = db.prepare(`SELECT * FROM install_keys`).get() as Record<string, unknown>;
			expect(JSON.stringify(row)).not.toContain(key.slice(-43));
		});

		it('records origin "key" for the version a key wrote', async () => {
			await put('tip-jar', SWIFT, (await mint()).key, 'text/x-swift');
			expect(db.prepare(`SELECT origin FROM apps`).get()).toEqual({ origin: 'key' });
			await put('tip-jar', { ...APP, name: 'Admin edit' });
			expect(db.prepare(`SELECT origin FROM app_versions`).get()).toEqual({ origin: 'key' });
		});

		it('a create key cannot overwrite an existing app, and the 409 leaves it usable', async () => {
			await put('habits', APP);
			const { key } = await mint();
			const res = await put('habits', SWIFT, key, 'text/x-swift');
			expect(res.status).toBe(409);
			expect((await (await call(item.GET, env, { path: '/api/apps/habits', params: { slug: 'habits' } })).json()).name).toBe('Habits');
			expect((await put('fresh', SWIFT, key, 'text/x-swift')).status).toBe(201);
		});

		it('an update key writes its own slug and no other', async () => {
			await put('habits', APP);
			await put('other', APP);
			const { key } = await mint('habits');
			const wrong = await put('other', SWIFT, key, 'text/x-swift');
			expect(wrong.status).toBe(401);
			expect(await wrong.json()).toEqual({ error: KEY_ERROR });
			expect((await put('habits', SWIFT, key, 'text/x-swift')).status).toBe(200);
		});

		it('two parallel PUTs with one key produce exactly one success', async () => {
			await put('habits', APP);
			const { key } = await mint('habits');
			const results = await Promise.all([
				put('habits', SWIFT, key, 'text/x-swift'),
				put('habits', SWIFT.replace('Tip Jar', 'Tip Jar 2'), key, 'text/x-swift'),
				put('habits', SWIFT.replace('Tip Jar', 'Tip Jar 3'), key, 'text/x-swift')
			]);
			const codes = results.map((r) => r.status).sort();
			expect(codes).toEqual([200, 401, 401]);
		});

		it('two parallel creates with one create key produce exactly one success', async () => {
			const { key } = await mint();
			const results = await Promise.all([
				put('one', SWIFT, key, 'text/x-swift'),
				put('two', SWIFT, key, 'text/x-swift')
			]);
			expect(results.filter((r) => r.ok)).toHaveLength(1);
			expect((db.prepare(`SELECT COUNT(*) AS n FROM apps`).get() as { n: number }).n).toBe(1);
		});

		it(`a failed 422 leaves the key usable; ${MAX_KEY_ATTEMPTS} failures burn it`, async () => {
			const { key, id } = await mint();
			for (let i = 0; i < MAX_KEY_ATTEMPTS; i++) {
				const res = await put('a', '// Icon: star\nx\n', key, 'text/x-swift');
				expect(res.status).toBe(422);
			}
			// The sixth try — even a valid one — finds the key burned.
			const sixth = await put('a', SWIFT, key, 'text/x-swift');
			expect(sixth.status).toBe(401);
			expect(await sixth.json()).toEqual({ error: KEY_ERROR });
			expect(await status(id)).toEqual({ status: 'expired' });
		});

		it('a failure then a fix installs', async () => {
			const { key } = await mint();
			expect((await put('a', '// Icon: star\nx\n', key, 'text/x-swift')).status).toBe(422);
			expect((await put('a', '{bad', key)).status).toBe(400);
			expect((await put('a', SWIFT, key, 'text/x-swift')).status).toBe(201);
		});

		it('an expired key is refused', async () => {
			const { key, id } = await mint();
			db.prepare(`UPDATE install_keys SET expires_at = ?`).run(Date.now() - 1);
			const res = await put('a', SWIFT, key, 'text/x-swift');
			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({ error: KEY_ERROR });
			expect(await status(id)).toEqual({ status: 'expired' });
		});

		it('a wrong secret, an unknown id and a malformed key all get the same sentence', async () => {
			const { key } = await mint();
			const tampered = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');
			const unknown = 'shelf_ik_AAAAAAAAAAA_' + key.slice(-43);
			for (const k of [tampered, unknown, 'shelf_ik_', 'shelf_ik_short']) {
				const res = await put('a', SWIFT, k, 'text/x-swift');
				expect(res.status).toBe(401);
				const text = await res.text();
				expect(JSON.parse(text)).toEqual({ error: KEY_ERROR });
				expect(text).not.toContain(k);
			}
		});

		it('works only on PUT and, for an update key, its own source', async () => {
			await put('habits', APP);
			const create = (await mint()).key;
			const update = (await mint('habits')).key;
			const p = { slug: 'habits' };
			const attempts: Array<[string, Promise<Response>]> = [];
			for (const token of [create, update]) {
				attempts.push(
					['list', call(list.GET, env, { path: '/api/apps', token })],
					['get', call(item.GET, env, { path: '/api/apps/habits', params: p, token })],
					['delete', call(item.DELETE, env, { method: 'DELETE', path: '/api/apps/habits', params: p, token })],
					['revert', call(revert.POST, env, { method: 'POST', path: '/api/apps/habits/revert', params: p, token })],
					['data', call(data.GET, env, { path: '/api/apps/habits/data', params: p, token })],
					['data-post', call(data.POST, env, { method: 'POST', path: '/api/apps/habits/data', params: p, token, body: '{"set":{"a":1}}' })],
					['data-key', call(dataKey.PUT, env, { method: 'PUT', path: '/api/apps/habits/data/a', params: { ...p, key: 'a' }, token, body: '1' })],
					['mint', call(keys.POST, env, { method: 'POST', path: '/api/install-keys', token, body: '{}' })],
					['status', call(keyItem.GET, env, { path: '/api/install-keys/x', params: { id: 'x' }, token })]
				);
			}
			attempts.push([
				'create-key source',
				call(source.GET, env, { path: '/api/apps/habits/source', params: p, token: create })
			]);
			for (const [label, promise] of attempts) {
				const res = await promise;
				expect(res.status, label).toBe(401);
				expect(await res.json(), label).toEqual({ error: KEY_ERROR });
			}

			// The update key reads its own source, and reading does not use it up.
			for (let i = 0; i < 2; i++) {
				const res = await call(source.GET, env, { path: '/api/apps/habits/source', params: p, token: update });
				expect(res.status).toBe(200);
				expect(res.headers.get('content-type')).toBe('text/x-swift; charset=utf-8');
				expect(await res.text()).toBe(APP.source);
			}
			await put('other', APP);
			const otherSource = await call(source.GET, env, {
				path: '/api/apps/other/source',
				params: { slug: 'other' },
				token: update
			});
			expect(otherSource.status).toBe(401);
			expect((await put('habits', SWIFT, update, 'text/x-swift')).status).toBe(200);
		});

		it('revokes a key, after which it is unknown and refused', async () => {
			const { key, id } = await mint();
			const res = await call(keyItem.DELETE, env, { method: 'DELETE', path: `/api/install-keys/${id}`, params: { id } });
			expect(await res.json()).toEqual({ id, revoked: true });
			expect((await call(keyItem.GET, env, { path: `/api/install-keys/${id}`, params: { id } })).status).toBe(404);
			expect((await put('a', SWIFT, key, 'text/x-swift')).status).toBe(401);
		});

		it('refuses a twenty-first live key', async () => {
			for (let i = 0; i < 20; i++) await mint();
			const res = await call(keys.POST, env, { method: 'POST', path: '/api/install-keys', body: '' });
			expect(res.status).toBe(429);
		});

		it('rejects a bad slug when minting', async () => {
			const res = await call(keys.POST, env, { method: 'POST', path: '/api/install-keys', body: '{"slug":"no/slash"}' });
			expect(res.status).toBe(422);
		});
	});
});
