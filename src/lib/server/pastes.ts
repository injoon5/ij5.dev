import { MAX_PASTE_CHARS, type PasteRecord, type PasteRow } from '$lib/types';

/**
 * Pastes share the shortener's storage contract: D1 is the source of truth,
 * every write mirrors into `paste:{slug}` in KV, and the hook serves the view
 * or the raw text from KV without ever touching D1. A D1 row with no KV mirror
 * is a paste that 404s — the same lockstep rule `slugs.ts` runs on.
 *
 * The two tables are separate but share the root-slug namespace. Creation on
 * either side rejects a slug the other already owns, so a paste can never
 * silently shadow a link or vice versa (the hook checks links first).
 *
 * `MAX_PASTE_CHARS` lives in `$lib/types` — this module is server-only, and
 * the admin form needs the same limit for its counter.
 */

type Env = App.Platform['env'];

const kvKey = (slug: string) => `paste:${slug}`;

const toRecord = (
	row: Pick<PasteRow, 'body' | 'note' | 'expires_at' | 'cache'>,
	created: number
): PasteRecord => ({
	body: row.body,
	note: row.note,
	created_at: created,
	exp: row.expires_at,
	cache: row.cache
});

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
	const created = Date.now();
	await env.DB.prepare(
		`INSERT INTO pastes (slug, body, note, created_at, expires_at, cache)
		 VALUES (?, ?, ?, ?, ?, ?)`
	)
		.bind(row.slug, row.body, row.note, created, row.expires_at, row.cache ? 1 : 0)
		.run();

	// Same rollback contract as `createSlug`: a row with no mirror is a paste
	// that 404s forever, and a retry then bounces off "slug taken".
	try {
		await env.KV.put(kvKey(row.slug), JSON.stringify(toRecord(row, created)));
	} catch (e) {
		await env.DB.prepare(`DELETE FROM pastes WHERE slug = ?`).bind(row.slug).run().catch(() => {});
		throw e;
	}
}

export async function updatePaste(env: Env, row: Omit<PasteRow, 'created_at'>): Promise<void> {
	const prev = await getPaste(env, row.slug);
	await env.DB.prepare(
		`UPDATE pastes SET body = ?, note = ?, expires_at = ?, cache = ? WHERE slug = ?`
	)
		.bind(row.body, row.note, row.expires_at, row.cache ? 1 : 0, row.slug)
		.run();

	try {
		await env.KV.put(kvKey(row.slug), JSON.stringify(toRecord(row, prev?.created_at ?? Date.now())));
	} catch (e) {
		if (prev) {
			await env.DB.prepare(
				`UPDATE pastes SET body = ?, note = ?, expires_at = ?, cache = ? WHERE slug = ?`
			)
				.bind(prev.body, prev.note, prev.expires_at, prev.cache ? 1 : 0, prev.slug)
				.run()
				.catch(() => {});
		} else {
			await env.DB.prepare(`DELETE FROM pastes WHERE slug = ?`).bind(row.slug).run().catch(() => {});
		}
		throw e;
	}
}

export async function deletePaste(env: Env, slug: string): Promise<void> {
	const prev = await getPaste(env, slug);
	await env.DB.prepare(`DELETE FROM pastes WHERE slug = ?`).bind(slug).run();

	try {
		await env.KV.delete(kvKey(slug));
	} catch (e) {
		if (prev) {
			await env.DB.prepare(
				`INSERT INTO pastes (slug, body, note, created_at, expires_at, cache)
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
				.bind(prev.slug, prev.body, prev.note, prev.created_at, prev.expires_at, prev.cache ? 1 : 0)
				.run()
				.catch(() => {});
		}
		throw e;
	}
}

/**
 * The view and raw pages are cached by the adapter keyed on the real URL
 * (`s-maxage`), so an edit must evict those entries — and `cache.delete()`
 * only reaches the colo it runs in, the same best-effort trade as
 * `purgeLocalCache`: local-only, worth it because the editor is who checks.
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
