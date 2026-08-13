import type { BentoDoc, Profile } from '$lib/types';

/**
 * The homepage document lives in three KV keys (§11):
 *
 *   `bento:draft`  every editor save, instant, no version bump
 *   `bento`        the published document, `{ v, profile, markdown }`
 *   `bento:prev`   the document published before this one
 *
 * D1 stays the source of truth and every write mirrors into `bento:draft`.
 * Publishing swaps the whole document at once, so no visitor ever sees a
 * half-updated page, and `bento:prev` makes a bad edit a scare rather than an
 * incident. (The KV keys keep the `bento:` prefix — the page changed shape, the
 * storage contract did not.)
 */

type Env = App.Platform['env'];

const PUBLISHED = 'bento';
const DRAFT = 'bento:draft';
const PREV = 'bento:prev';

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
	const profileRes = await env.DB.prepare(
		`SELECT name, bio, tagline, avatar, links, content FROM profile WHERE id = 1`
	).all();

	const row = (profileRes.results as Array<Record<string, string | null>>)[0];
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

export async function readPublished(env: Env): Promise<BentoDoc | null> {
	return await env.KV.get<BentoDoc>(PUBLISHED, { type: 'json', cacheTtl: 60 });
}

export async function readDraft(env: Env): Promise<BentoDoc> {
	const draft = await env.KV.get<BentoDoc>(DRAFT, { type: 'json' });
	if (draft) return draft;

	// No draft yet: derive one from D1 so the editor always opens on something.
	const { profile, markdown } = await loadFromD1(env);
	return { v: 0, profile, markdown };
}

/** Called after every D1 write so the editor preview is never behind. */
export async function syncDraft(env: Env): Promise<BentoDoc> {
	const { profile, markdown } = await loadFromD1(env);
	const current = await readPublished(env);
	const draft: BentoDoc = { v: current?.v ?? 0, profile, markdown };
	await env.KV.put(DRAFT, JSON.stringify(draft));
	return draft;
}

/**
 * Draft becomes published, version increments, previous published is kept.
 * The version bump is what invalidates every colo's edge cache at once —
 * `cache.delete()` would only reach the colo it ran in.
 */
export async function publish(env: Env): Promise<BentoDoc> {
	const [draft, current] = await Promise.all([readDraft(env), readPublished(env)]);
	const next: BentoDoc = {
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
export async function revert(env: Env): Promise<BentoDoc | null> {
	const [prev, current] = await Promise.all([
		env.KV.get<BentoDoc>(PREV, { type: 'json' }),
		readPublished(env)
	]);
	if (!prev) return null;

	const restored: BentoDoc = { ...prev, v: (current?.v ?? prev.v) + 1 };
	await env.KV.put(PUBLISHED, JSON.stringify(restored));
	await env.KV.put(DRAFT, JSON.stringify(restored));
	if (current) await env.KV.put(PREV, JSON.stringify(current));
	return restored;
}

export async function hasPrevious(env: Env): Promise<boolean> {
	return (await env.KV.get(PREV, { type: 'text' })) !== null;
}
