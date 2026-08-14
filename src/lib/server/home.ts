import type { HomeDoc, Profile } from '$lib/types';

/**
 * The homepage document lives in three KV keys (§11):
 *
 *   `home:draft`  every editor save, instant, no version bump
 *   `home`        the published document, `{ v, profile, markdown }`
 *   `home:prev`   the document published before this one
 *
 * D1 stays the source of truth and every write mirrors into `home:draft`.
 * Publishing swaps the whole document at once, so no visitor ever sees a
 * half-updated page, and `home:prev` makes a bad edit a scare rather than an
 * incident. (The KV keys keep the `home:` prefix — the page changed shape, the
 * storage contract did not.)
 */

type Env = App.Platform['env'];

const PUBLISHED = 'home';
const DRAFT = 'home:draft';
const PREV = 'home:prev';

const EMPTY_PROFILE: Profile = {
	name: 'ij5',
	bio: null,
	tagline: null,
	avatar: null,
	links: [],
	content: null
};

/** Rebuilds the document from the source of truth. One row, one query. */
export async function loadFromD1(env: Env): Promise<{ profile: Profile; markdown: string }> {
	const row = (await env.DB.prepare(
		`SELECT name, bio, tagline, avatar, links, content FROM profile WHERE id = 1`
	).first()) as Record<string, string | null> | null;

	const profile: Profile = row
		? {
				name: row.name ?? 'ij5',
				bio: row.bio ?? null,
				tagline: row.tagline ?? null,
				avatar: row.avatar ?? null,
				links: safeJson(row.links, []),
				content: row.content ?? null
			}
		: EMPTY_PROFILE;

	return { profile, markdown: profile.content ?? '' };
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export async function readPublished(env: Env): Promise<HomeDoc | null> {
	return await env.KV.get<HomeDoc>(PUBLISHED, { type: 'json', cacheTtl: 60 });
}

export async function readDraft(env: Env): Promise<HomeDoc> {
	const draft = await env.KV.get<HomeDoc>(DRAFT, { type: 'json' });
	if (draft) return draft;

	// No draft yet: derive one from D1 so the editor always opens on something.
	const { profile, markdown } = await loadFromD1(env);
	return { v: 0, profile, markdown };
}

/** Called after every D1 write so the editor preview is never behind. */
export async function syncDraft(env: Env): Promise<HomeDoc> {
	const { profile, markdown } = await loadFromD1(env);
	const current = await readPublished(env);
	const draft: HomeDoc = { v: current?.v ?? 0, profile, markdown };
	await env.KV.put(DRAFT, JSON.stringify(draft));
	return draft;
}

/**
 * Draft becomes published, version increments, previous published is kept.
 * The version bump is what invalidates every colo's edge cache at once —
 * `cache.delete()` would only reach the colo it ran in.
 */
export async function publish(env: Env): Promise<HomeDoc> {
	const [draft, current] = await Promise.all([readDraft(env), readPublished(env)]);
	const next: HomeDoc = {
		v: (current?.v ?? 0) + 1,
		profile: draft.profile,
		markdown: draft.markdown
	};

	if (current) await env.KV.put(PREV, JSON.stringify(current));
	await env.KV.put(PUBLISHED, JSON.stringify(next));
	await env.KV.put(DRAFT, JSON.stringify(next));
	return next;
}

/** Two KV writes, and the difference between a bad edit and an incident. */
export async function revert(env: Env): Promise<HomeDoc | null> {
	const [prev, current] = await Promise.all([
		env.KV.get<HomeDoc>(PREV, { type: 'json' }),
		readPublished(env)
	]);
	if (!prev) return null;

	const restored: HomeDoc = { ...prev, v: (current?.v ?? prev.v) + 1 };
	await env.KV.put(PUBLISHED, JSON.stringify(restored));
	await env.KV.put(DRAFT, JSON.stringify(restored));
	if (current) await env.KV.put(PREV, JSON.stringify(current));
	return restored;
}

/**
 * Bump the published version without changing the content — the "clear cache"
 * escape hatch for the homepage.
 *
 * The edge cache is version-keyed (`home/v${v}` in the hook) precisely because
 * `cache.delete()` only reaches the colo it runs in (§11): a bump swaps the
 * key everywhere at once, so the next visitor to `/` misses, re-renders from
 * scratch (live widgets included), and repopulates the cache. Content is
 * untouched, and so is the draft — unsaved edits in the editor are not
 * publishable and must not be disturbed.
 */
export async function clearCache(env: Env): Promise<HomeDoc | null> {
	const current = await readPublished(env);
	if (!current) return null;

	const next: HomeDoc = { ...current, v: current.v + 1 };
	await env.KV.put(PUBLISHED, JSON.stringify(next));
	return next;
}

export async function hasPrevious(env: Env): Promise<boolean> {
	return (await env.KV.get(PREV, { type: 'text' })) !== null;
}
