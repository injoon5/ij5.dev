import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearCache,
	hasPrevious,
	publish,
	readDraft,
	readPublished,
	revert,
	syncDraft
} from './home';
import type { HomeDoc, Profile } from '$lib/types';

/**
 * The publish invariant behind §11's edge cache: a new document is a new
 * version, and a new version is a new cache key. `cache.delete()` only reaches
 * the colo it runs in, so if `v` ever failed to move, an edit would sit behind
 * stale HTML in every other region with nothing able to purge it.
 */

type Store = Map<string, string>;

/** Just enough KV to exercise the document lifecycle. */
function fakeEnv(store: Store = new Map()) {
	return {
		store,
		env: {
			KV: {
				get: async (key: string, opts?: { type?: string }) => {
					const raw = store.get(key);
					if (raw === undefined) return null;
					return opts?.type === 'json' ? JSON.parse(raw) : raw;
				},
				put: async (key: string, value: string) => void store.set(key, value),
				delete: async (key: string) => void store.delete(key)
			}
		} as unknown as App.Platform['env']
	};
}

const profile = (name: string): Profile => ({
	name,
	bio: null,
	tagline: null,
	avatar: null,
	links: [],
	content: null
});

const doc = (v: number, name: string, markdown: string): HomeDoc => ({
	v,
	profile: profile(name),
	markdown
});

describe('publish', () => {
	let store: Store;
	let env: App.Platform['env'];

	beforeEach(() => {
		const fake = fakeEnv();
		store = fake.store;
		env = fake.env;
	});

	const seedDraft = (d: HomeDoc) => store.set('home:draft', JSON.stringify(d));

	it('bumps the version, which is what invalidates every colo at once', async () => {
		seedDraft(doc(0, 'first', '# hi'));
		expect((await publish(env)).v).toBe(1);

		seedDraft(doc(1, 'second', '# hi there'));
		expect((await publish(env)).v).toBe(2);
	});

	it('swaps the whole document, so no visitor sees a half-updated page', async () => {
		seedDraft(doc(0, 'first', 'one'));
		await publish(env);

		seedDraft(doc(1, 'second', 'one two three'));
		const published = await publish(env);

		expect(published.profile.name).toBe('second');
		expect(published.markdown).toBe('one two three');
	});

	it('leaves the draft equal to what was published, so the editor is not dirty afterwards', async () => {
		seedDraft(doc(0, 'first', 'body'));
		const published = await publish(env);

		expect(await readDraft(env)).toEqual(published);
		expect(await readPublished(env)).toEqual(published);
	});

	it('keeps the document it replaced', async () => {
		expect(await hasPrevious(env)).toBe(false);

		seedDraft(doc(0, 'first', 'a'));
		await publish(env);
		// Nothing to fall back to yet: the first publish replaced nothing.
		expect(await hasPrevious(env)).toBe(false);

		seedDraft(doc(1, 'second', 'b'));
		await publish(env);
		expect(await hasPrevious(env)).toBe(true);
	});
});

describe('revert', () => {
	it('restores the previous document under a new version', async () => {
		const { store, env } = fakeEnv();

		store.set('home:draft', JSON.stringify(doc(0, 'first', 'a')));
		await publish(env); // v1, 'first'
		store.set('home:draft', JSON.stringify(doc(1, 'second', 'b')));
		await publish(env); // v2, 'second'

		const reverted = await revert(env);

		expect(reverted?.profile.name).toBe('first');
		// Forward, never back: a reused version number would leave the bad render
		// cached at the edge under a key that is no longer being written.
		expect(reverted?.v).toBe(3);
	});

	it('is itself revertible, so a mistaken revert is not a one-way door', async () => {
		const { store, env } = fakeEnv();

		store.set('home:draft', JSON.stringify(doc(0, 'first', 'a')));
		await publish(env);
		store.set('home:draft', JSON.stringify(doc(1, 'second', 'b')));
		await publish(env);

		await revert(env);
		const back = await revert(env);

		expect(back?.profile.name).toBe('second');
		expect(back?.v).toBe(4);
	});

	it('reports nothing to revert to rather than throwing', async () => {
		const { env } = fakeEnv();
		expect(await revert(env)).toBeNull();
	});
});

describe('clearCache', () => {
	it('bumps the version without touching content — the same key swap publish uses', async () => {
		const { store, env } = fakeEnv();
		store.set('home:draft', JSON.stringify(doc(0, 'first', 'a')));
		await publish(env); // v1

		// Unsaved edits sit in the draft; a cache clear must not disturb them.
		store.set('home:draft', JSON.stringify(doc(1, 'edited but unpublished', 'edited')));

		const cleared = await clearCache(env);

		expect(cleared?.v).toBe(2);
		expect(cleared?.profile.name).toBe('first');
		expect(cleared?.markdown).toBe('a');
		expect((await readDraft(env))?.profile.name).toBe('edited but unpublished');
	});

	it('reports nothing published rather than inventing a version', async () => {
		const { env } = fakeEnv();
		expect(await clearCache(env)).toBeNull();
	});
});

describe('syncDraft', () => {
	it('never advances the published version — only publish does that', async () => {
		const { store, env } = fakeEnv();
		store.set('home:draft', JSON.stringify(doc(0, 'first', 'a')));
		await publish(env);

		const before = (await readPublished(env))!.v;

		// D1 is the source of truth for a sync, so stand one in for this call. The
		// new loader reads a single profile row (content included) with `.all()`.
		(env as { DB: unknown }).DB = {
			prepare: () => ({
				all: async () => ({
					results: [
						{
							name: 'edited',
							bio: null,
							tagline: null,
							avatar: null,
							links: '[]',
							content: 'edited body'
						}
					]
				})
			})
		};

		const draft = await syncDraft(env);

		expect(draft.profile.name).toBe('edited');
		expect(draft.markdown).toBe('edited body');
		expect(draft.v).toBe(before);
		expect((await readPublished(env))!.profile.name).toBe('first');
	});
});
