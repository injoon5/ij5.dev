import { isExpired } from '$lib/expiry';
import { PASTE_TTL, type PasteInput, type PasteRow } from './paste';

/**
 * D1 is the only store: `/p/{slug}` and `/raw/{slug}` read it directly. A
 * paste with caching on is kept by the adapter's edge cache under each of its
 * URLs; every write drops those entries here (in this colo only — the rest
 * expire within `PASTE_TTL`).
 */

type Env = App.Platform['env'];

const COLUMNS = `slug, body, note, created_at, expires_at, cache`;

/** D1 stores `cache` as 0/1. */
const fromDb = (row: PasteRow | null): PasteRow | null => row && { ...row, cache: Boolean(row.cache) };

export async function listPastes(env: Env): Promise<PasteRow[]> {
	const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM pastes ORDER BY created_at DESC`).all<PasteRow>();
	return results.map((r: PasteRow) => fromDb(r)!);
}

export async function getPaste(env: Env, slug: string): Promise<PasteRow | null> {
	return fromDb(await env.DB.prepare(`SELECT ${COLUMNS} FROM pastes WHERE slug = ?`).bind(slug).first<PasteRow>());
}

/** The paste a visitor may see: present and not expired. */
export async function getLivePaste(env: Env, slug: string): Promise<PasteRow | null> {
	const paste = await getPaste(env, slug);
	return paste && !isExpired(paste.expires_at) ? paste : null;
}

export const pasteCacheControl = (paste: PasteRow) =>
	paste.cache ? `public, s-maxage=${PASTE_TTL}, max-age=0` : 'no-store';

async function dropCachedViews(origin: string, slug: string) {
	const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
	if (!cache) return;
	const urls = [`/p/${slug}`, `/p/${slug}/__data.json`, `/raw/${slug}`];
	await Promise.all(urls.map((u) => cache.delete(new Request(origin + u)))).catch((e) =>
		console.error('cache purge failed:', e)
	);
}

export async function createPaste(env: Env, row: PasteInput): Promise<void> {
	await env.DB.prepare(`INSERT INTO pastes (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`)
		.bind(row.slug, row.body, row.note, Date.now(), row.expires_at, row.cache ? 1 : 0)
		.run();
}

/** `origin` is the site's, for the cached view URLs to drop. */
export async function updatePaste(env: Env, row: PasteInput, origin: string): Promise<void> {
	await env.DB.prepare(`UPDATE pastes SET body = ?, note = ?, expires_at = ?, cache = ? WHERE slug = ?`)
		.bind(row.body, row.note, row.expires_at, row.cache ? 1 : 0, row.slug)
		.run();
	await dropCachedViews(origin, row.slug);
}

export async function deletePaste(env: Env, slug: string, origin: string): Promise<void> {
	await env.DB.prepare(`DELETE FROM pastes WHERE slug = ?`).bind(slug).run();
	await dropCachedViews(origin, slug);
}
