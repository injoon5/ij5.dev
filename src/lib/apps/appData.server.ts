import { DATA_KEY_PATTERN, MAX_DATA_APP_BYTES, MAX_DATA_KEYS, MAX_DATA_VALUE_BYTES } from '$lib/apps/app';

/**
 * A small key-value store per app (Shelf plan §8). Values are JSON, keys are
 * strings, and the slug needs no row in `apps`.
 *
 * Every write takes the next value of one global counter as its `rev`, in the
 * same `DB.batch` as the write. D1 runs a batch as one transaction and writes
 * one at a time, so `rev` is a total order and a device can resume from any
 * rev it has seen with `?since=`. A delete is a tombstone (`value` NULL) so
 * other devices hear about it; tombstones older than 30 days are purged the
 * next time the app writes.
 *
 * Conflicts are last-write-wins per key. There is one user, and the real
 * conflict is the same person on two devices; merging is not worth it.
 */

type Env = App.Platform['env'];

const TOMBSTONE_TTL_MS = 30 * 864e5;

export const DATA_LIMITS = {
	value: `A value can be at most ${MAX_DATA_VALUE_BYTES / 1024} KB.`,
	keys: `An app can keep at most ${MAX_DATA_KEYS.toLocaleString('en')} keys.`,
	app: `An app can store at most ${MAX_DATA_APP_BYTES / 1024 / 1024} MB of data.`
};

export const KEY_RULE = 'Keys are 1–128 printable characters with no "/".';

export const isDataKey = (key: string) => DATA_KEY_PATTERN.test(key);

const bytes = (s: string) => new TextEncoder().encode(s).length;

export type DataEntry = { key: string; bytes: number; updated_at: number; rev: number };

/** Live keys with their sizes, for limit checks and the admin's Data tab. */
export async function listEntries(env: Env, slug: string): Promise<DataEntry[]> {
	const { results } = await env.DB.prepare(
		`SELECT key, length(CAST(value AS BLOB)) AS bytes, updated_at, rev FROM app_data
		 WHERE slug = ? AND value IS NOT NULL ORDER BY key`
	)
		.bind(slug)
		.all<DataEntry>();
	return results;
}

const maxRev = (env: Env, slug: string) =>
	env.DB.prepare(`SELECT COALESCE(MAX(rev), 0) AS rev FROM app_data WHERE slug = ?`).bind(slug);

/** Every live value, and the newest rev among the slug's rows (0 if none). */
export async function readAll(
	env: Env,
	slug: string
): Promise<{ entries: Record<string, unknown>; rev: number }> {
	const [rows, rev] = await env.DB.batch([
		env.DB.prepare(
			`SELECT key, value FROM app_data WHERE slug = ? AND value IS NOT NULL ORDER BY key`
		).bind(slug),
		maxRev(env, slug)
	]);
	const entries: Record<string, unknown> = {};
	for (const row of rows.results as Array<{ key: string; value: string }>) {
		entries[row.key] = JSON.parse(row.value);
	}
	return { entries, rev: (rev.results[0] as { rev: number }).rev };
}

/**
 * Everything written after `since`, tombstones included, in rev order. `rev`
 * is the newest one returned, or `since` itself when nothing is newer, so a
 * client can always store it and ask again.
 */
export async function readSince(
	env: Env,
	slug: string,
	since: number
): Promise<{ changes: Array<{ key: string; value: unknown; rev: number }>; rev: number }> {
	const [rows, rev] = await env.DB.batch([
		env.DB.prepare(
			`SELECT key, value, rev FROM app_data WHERE slug = ? AND rev > ? ORDER BY rev, key`
		).bind(slug, since),
		maxRev(env, slug)
	]);
	const changes = (rows.results as Array<{ key: string; value: string | null; rev: number }>).map(
		(r) => ({ key: r.key, value: r.value === null ? null : JSON.parse(r.value), rev: r.rev })
	);
	return { changes, rev: Math.max(since, (rev.results[0] as { rev: number }).rev) };
}

/** The stored JSON text of one live value, or null. */
export async function readOne(env: Env, slug: string, key: string): Promise<string | null> {
	const row = await env.DB.prepare(
		`SELECT value FROM app_data WHERE slug = ? AND key = ? AND value IS NOT NULL`
	)
		.bind(slug, key)
		.first<{ value: string }>();
	return row?.value ?? null;
}

export type WriteResult = { ok: true; rev: number } | { ok: false; error: string; key?: string };

/**
 * Sets and deletes keys in one transaction. `set` maps a key to its value's
 * JSON text. Limits are checked against what the app would hold afterwards,
 * so replacing a large value with a smaller one is always allowed; a write
 * that breaks any limit writes nothing at all.
 *
 * The limit check reads before the batch writes, so two writes racing each
 * other could together pass a limit by one value's worth. With one user that
 * is not worth a lock.
 */
export async function writeData(
	env: Env,
	slug: string,
	set: Record<string, string>,
	del: string[]
): Promise<WriteResult> {
	for (const [key, json] of Object.entries(set)) {
		if (bytes(json) > MAX_DATA_VALUE_BYTES) return { ok: false, error: DATA_LIMITS.value, key };
	}

	const sizes = new Map((await listEntries(env, slug)).map((e) => [e.key, e.bytes]));
	for (const key of del) sizes.delete(key);
	for (const [key, json] of Object.entries(set)) sizes.set(key, bytes(json));
	if (sizes.size > MAX_DATA_KEYS) return { ok: false, error: DATA_LIMITS.keys };
	let total = 0;
	for (const n of sizes.values()) total += n;
	if (total > MAX_DATA_APP_BYTES) return { ok: false, error: DATA_LIMITS.app };

	const now = Date.now();
	const results = await env.DB.batch([
		env.DB.prepare(`UPDATE app_data_counter SET rev = rev + 1 WHERE one = 1 RETURNING rev`),
		...Object.entries(set).map(([key, json]) =>
			env.DB.prepare(
				`INSERT INTO app_data (slug, key, value, rev, updated_at)
				 VALUES (?, ?, ?, (SELECT rev FROM app_data_counter WHERE one = 1), ?)
				 ON CONFLICT (slug, key) DO UPDATE SET
				   value = excluded.value, rev = excluded.rev, updated_at = excluded.updated_at`
			).bind(slug, key, json, now)
		),
		// Deleting a key that is not there writes nothing — a tombstone for
		// a key no device ever had would only be noise in `?since=`.
		...del.map((key) =>
			env.DB.prepare(
				`UPDATE app_data SET value = NULL, rev = (SELECT rev FROM app_data_counter WHERE one = 1), updated_at = ?
				 WHERE slug = ? AND key = ? AND value IS NOT NULL`
			).bind(now, slug, key)
		),
		// After the writes, so the newest tombstone can never be the one
		// purged out from under a write in the same batch.
		env.DB.prepare(`DELETE FROM app_data WHERE slug = ? AND value IS NULL AND updated_at < ?`).bind(
			slug,
			now - TOMBSTONE_TTL_MS
		)
	]);

	return { ok: true, rev: (results[0].results[0] as { rev: number }).rev };
}
