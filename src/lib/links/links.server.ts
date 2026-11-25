import { kvKey, redirectCacheKey, toRecord, type LinkInput, type SlugRow } from './link';

/**
 * Every write goes to D1 and then KV; if KV fails, D1 is put back, so the two
 * only disagree for as long as one `await` takes. A D1 row with no KV entry
 * is a link that 404s; a KV entry with no row is one that can no longer be
 * edited.
 *
 * Writes also drop the edge-cached redirect. `cache.delete()` only reaches the
 * colo it runs in, so elsewhere the old target can live for `REDIRECT_TTL`
 * seconds; locally — where the person editing checks — it changes at once.
 */

type Env = App.Platform['env'];

const COLUMNS = `slug, target_url, status, note, created_at, expires_at`;

export async function listLinks(env: Env): Promise<SlugRow[]> {
	const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM slugs ORDER BY created_at DESC`).all<SlugRow>();
	return results;
}

export async function getLink(env: Env, slug: string): Promise<SlugRow | null> {
	return env.DB.prepare(`SELECT ${COLUMNS} FROM slugs WHERE slug = ?`).bind(slug).first<SlugRow>();
}

const insert = (env: Env, row: SlugRow) =>
	env.DB.prepare(`INSERT INTO slugs (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`)
		.bind(row.slug, row.target_url, row.status, row.note, row.created_at, row.expires_at)
		.run();

const update = (env: Env, row: LinkInput) =>
	env.DB.prepare(`UPDATE slugs SET target_url = ?, status = ?, note = ?, expires_at = ? WHERE slug = ?`)
		.bind(row.target_url, row.status, row.note, row.expires_at, row.slug)
		.run();

const remove = (env: Env, slug: string) => env.DB.prepare(`DELETE FROM slugs WHERE slug = ?`).bind(slug).run();

async function dropCachedRedirect(slug: string) {
	const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
	await cache?.delete(redirectCacheKey(slug)).catch((e) => console.error('cache purge failed:', e));
}

/** Runs `undo` if `write` fails, then rethrows the write's error. */
async function orUndo(write: () => Promise<unknown>, undo: () => Promise<unknown>) {
	try {
		await write();
	} catch (e) {
		await undo().catch((u) => console.error('link rollback failed:', u));
		throw e;
	}
}

export async function createLink(env: Env, input: LinkInput): Promise<SlugRow> {
	const row: SlugRow = { ...input, created_at: Date.now() };
	await insert(env, row);
	await orUndo(
		() => env.KV.put(kvKey(row.slug), JSON.stringify(toRecord(row))),
		() => remove(env, row.slug)
	);
	return row;
}

/** `current` is the row as the caller read it; it is what a failed write restores. */
export async function updateLink(env: Env, current: SlugRow, next: LinkInput): Promise<SlugRow> {
	await update(env, next);
	await orUndo(
		() => env.KV.put(kvKey(next.slug), JSON.stringify(toRecord(next))),
		() => update(env, current)
	);
	await dropCachedRedirect(next.slug);
	return { ...next, created_at: current.created_at };
}

export async function deleteLink(env: Env, current: SlugRow): Promise<void> {
	await remove(env, current.slug);
	await orUndo(
		() => env.KV.delete(kvKey(current.slug)),
		() => insert(env, current)
	);
	await dropCachedRedirect(current.slug);
}
