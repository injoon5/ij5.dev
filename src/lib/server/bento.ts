import type { BentoDoc, Block, Profile, Span } from '$lib/types';

/**
 * The bento document lives in three KV keys (§11):
 *
 *   `bento:draft`  every editor save, instant, no version bump
 *   `bento`        the published document, `{ v, profile, blocks }`
 *   `bento:prev`   the document published before this one
 *
 * D1 stays the source of truth and every write mirrors into `bento:draft`.
 * Publishing swaps the whole document at once, so no visitor ever sees a
 * half-updated grid, and `bento:prev` makes a bad edit a scare rather than an
 * incident.
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
	links: []
};

function parseBlockRow(row: {
	id: string;
	ord: number;
	kind: string;
	span: string;
	data: string;
}): Block {
	let data: Record<string, unknown> = {};
	try {
		data = JSON.parse(row.data);
	} catch {
		// A block that cannot be parsed renders as nothing rather than taking
		// the page down with it.
	}
	return { id: row.id, ord: row.ord, kind: row.kind, span: row.span as Span, data };
}

/** Rebuilds the document from the source of truth. One batch, two queries. */
export async function loadFromD1(env: Env): Promise<{ profile: Profile; blocks: Block[] }> {
	const [profileRes, blockRes] = await env.DB.batch([
		env.DB.prepare(`SELECT name, bio, tagline, avatar, links FROM profile WHERE id = 1`),
		env.DB.prepare(`SELECT id, ord, kind, span, data FROM blocks ORDER BY ord ASC`)
	]);

	const row = (profileRes.results as Array<Record<string, string | null>>)[0];
	const profile: Profile = row
		? {
				name: row.name ?? 'ij5',
				bio: row.bio ?? null,
				tagline: row.tagline ?? null,
				avatar: row.avatar ?? null,
				links: safeJson(row.links, [])
			}
		: EMPTY_PROFILE;

	const blocks = (
		blockRes.results as Array<{ id: string; ord: number; kind: string; span: string; data: string }>
	).map(parseBlockRow);

	return { profile, blocks };
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
	const { profile, blocks } = await loadFromD1(env);
	return { v: 0, profile, blocks };
}

/** Called after every D1 write so the editor preview is never behind. */
export async function syncDraft(env: Env): Promise<BentoDoc> {
	const { profile, blocks } = await loadFromD1(env);
	const current = await readPublished(env);
	const draft: BentoDoc = { v: current?.v ?? 0, profile, blocks };
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
		blocks: draft.blocks
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
