import { describe, expect, it } from 'vitest';
import { isTargetUrl } from './link';
import { createLink, deleteLink, getLink, updateLink } from './links.server';
import { migratedDb, testEnv } from '$lib/server/testing/d1';

/**
 * The shortener's destination is a `Location:` header, not a page — so
 * `mailto:` is as valid as `https:`. The scheme allow-list is what keeps a
 * paste from smuggling in `javascript:` or `data:` as a redirect payload.
 */

describe('isTargetUrl', () => {
	it('accepts http and https, with or without a www', () => {
		expect(isTargetUrl('https://ij5.dev')).toBe(true);
		expect(isTargetUrl('https://www.example.com/a/b?c=d')).toBe(true);
		expect(isTargetUrl('http://example.com')).toBe(true);
	});

	it('accepts mailto, tel and sms', () => {
		expect(isTargetUrl('mailto:hi@ij5.dev')).toBe(true);
		expect(isTargetUrl('tel:+15551234567')).toBe(true);
		expect(isTargetUrl('sms:+15551234567')).toBe(true);
	});

	it('rejects schemes that would turn a redirect into a payload', () => {
		for (const bad of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd']) {
			expect(isTargetUrl(bad)).toBe(false);
		}
	});

	it('rejects strings that are not a URL at all', () => {
		for (const bad of ['', 'example.com', 'not a url', 'https://']) {
			expect(isTargetUrl(bad)).toBe(false);
		}
	});
});

describe('the links store', () => {
	/** KV that can be told to fail its next write. */
	function kv() {
		const store = new Map<string, string>();
		let failNext = false;
		const maybeFail = () => {
			if (failNext) {
				failNext = false;
				throw new Error('KV down');
			}
		};
		return {
			store,
			failNext: () => (failNext = true),
			api: {
				get: async (k: string) => store.get(k) ?? null,
				put: async (k: string, v: string) => (maybeFail(), void store.set(k, v)),
				delete: async (k: string) => (maybeFail(), void store.delete(k))
			}
		};
	}

	async function setup() {
		const { env } = await testEnv(migratedDb());
		const k = kv();
		Object.assign(env, { KV: k.api });
		return { env, kv: k };
	}

	const input = { slug: 'gh', target_url: 'https://github.com', status: 302, note: null, expires_at: null };

	it('writes D1 and the KV record the redirect reads', async () => {
		const { env, kv } = await setup();
		await createLink(env, input);
		expect(await getLink(env, 'gh')).toMatchObject({ target_url: 'https://github.com' });
		expect(JSON.parse(kv.store.get('slug:gh')!)).toEqual({ target: 'https://github.com', status: 302, exp: null });
	});

	it('undoes the D1 row when KV refuses a create, so a retry is clean', async () => {
		const { env, kv } = await setup();
		kv.failNext();
		await expect(createLink(env, input)).rejects.toThrow();
		expect(await getLink(env, 'gh')).toBeNull();
	});

	it('restores the previous row when KV refuses an update or a delete', async () => {
		const { env, kv } = await setup();
		const row = await createLink(env, input);
		kv.failNext();
		await expect(updateLink(env, row, { ...input, target_url: 'https://example.com' })).rejects.toThrow();
		expect((await getLink(env, 'gh'))!.target_url).toBe('https://github.com');

		kv.failNext();
		await expect(deleteLink(env, row)).rejects.toThrow();
		expect(await getLink(env, 'gh')).toEqual(row);
		expect(kv.store.has('slug:gh')).toBe(true);
	});
});
