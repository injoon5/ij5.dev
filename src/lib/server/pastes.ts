import { MAX_PASTE_CHARS, type PasteRow } from '$lib/types';

/**
 * Pastes live at `/p/{slug}`, served by SvelteKit routes that read D1
 * directly — there is no hook fast path anymore, so there is no KV mirror.
 * One store, one source of truth, and no second write that could fail the
 * first. The two tables still share the root-slug namespace, so creation on
 * either side rejects a slug the other already owns.
 *
 * `MAX_PASTE_CHARS` lives in `$lib/types` — this module is server-only, and
 * the admin form needs the same limit for its counter.
 */

type Env = App.Platform['env'];

export async function listPastes(env: Env): Promise<PasteRow[]> {
	const { results } = await env.DB.prepare(
		`SELECT slug, body, note, created_at, expires_at, cache FROM pastes ORDER BY created_at DESC`
	).all<PasteRow>();
	return results;
}

export async function getPaste(env: Env, slug: string): Promise<PasteRow | null> {
	return await env.DB.prepare(
		`SELECT slug, body, note, created_at, expires_at, cache FROM pastes WHERE slug = ?`
	)
		.bind(slug)
		.first<PasteRow>();
}

export async function createPaste(env: Env, row: Omit<PasteRow, 'created_at'>): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO pastes (slug, body, note, created_at, expires_at, cache)
		 VALUES (?, ?, ?, ?, ?, ?)`
	)
		.bind(row.slug, row.body, row.note, Date.now(), row.expires_at, row.cache ? 1 : 0)
		.run();
}

export async function updatePaste(env: Env, row: Omit<PasteRow, 'created_at'>): Promise<void> {
	await env.DB.prepare(
		`UPDATE pastes SET body = ?, note = ?, expires_at = ?, cache = ? WHERE slug = ?`
	)
		.bind(row.body, row.note, row.expires_at, row.cache ? 1 : 0, row.slug)
		.run();
}

export async function deletePaste(env: Env, slug: string): Promise<void> {
	await env.DB.prepare(`DELETE FROM pastes WHERE slug = ?`).bind(slug).run();
}

/**
 * The view and raw pages can sit in the adapter cache for five minutes when a
 * paste has caching on, and `cache.delete()` only reaches the colo it runs
 * in — the same best-effort trade as `purgeLocalCache`: local-only, worth it
 * because the editor is who checks.
 */
export async function purgePasteCache(
	platform: App.Platform | undefined,
	slug: string,
	origin: string
): Promise<void> {
	try {
		const cache = platform?.caches?.default;
		await cache?.delete(new Request(`${origin}/p/${slug}`));
		await cache?.delete(new Request(`${origin}/raw/${slug}`));
	} catch {
		// A cache purge is a convenience; failing it must not fail the edit.
	}
}
