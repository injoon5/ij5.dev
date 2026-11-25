import { z } from 'zod';
import {
	MAX_APP_BYTES,
	MAX_APP_NAME,
	normalizeSource,
	SOURCE_TOO_BIG,
	TINTS,
	utf8Bytes,
	type AppFull,
	type AppMeta,
	type Tint
} from '$lib/apps/app';
import { b64url } from '$lib/server/crypto';
import { forgetAllData } from './appData.server';
import { claimed, claimKey, newClaim, type InstallKeyRow } from './installKeys.server';

/**
 * Shelf's apps: one Swift file each, read by the phone through
 * `/api/apps`. D1 is the only store, so a write is visible on the phone's next
 * sync.
 *
 * Every content change keeps the previous version in `app_versions` (the last
 * `HISTORY` per app), so an agent's bad push can be undone with Revert. The
 * history push, the write and the trim run in one `DB.batch`, which D1 runs as
 * one transaction: there is no state in which the old version is gone and the
 * new one is not there.
 */

type Env = App.Platform['env'];

export type AppOrigin = 'admin' | 'key';

export type AppContent = { name: string; icon: string | null; tint: Tint; source: string };

/** What an app is made of, as the API and the admin form both check it. */
export const appContent = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Give the app a name.')
		.max(MAX_APP_NAME, `Keep the name to ${MAX_APP_NAME} characters.`),
	// An empty icon means "no icon", which the phone draws as `app`.
	icon: z
		.string()
		.trim()
		.max(100, 'That is not an SF Symbol name.')
		.nullish()
		.transform((v) => v || null),
	tint: z.enum(TINTS, `Use one of: ${TINTS.join(', ')}.`),
	source: z
		.string()
		.transform(normalizeSource)
		.refine((s) => s.trim() !== '', 'The source is empty.')
		.refine((s) => utf8Bytes(s) <= MAX_APP_BYTES, SOURCE_TOO_BIG)
});

/** Versions kept per app, not counting the current one. */
export const HISTORY = 10;

const META = `slug, name, icon, tint, version, updated_at,
	EXISTS (SELECT 1 FROM app_versions v WHERE v.slug = apps.slug) AS revertible`;

/**
 * The index query. It never names `source`: the list is read on every phone
 * launch, and an app's source can be 256 KB.
 */
const LIST_APPS = `SELECT ${META} FROM apps ORDER BY name COLLATE NOCASE, slug`;

type MetaRow = Omit<AppMeta, 'revertible'> & { revertible: number };
const toMeta = ({ revertible, ...row }: MetaRow): AppMeta => ({ ...row, revertible: !!revertible });

const digest = async (s: string) =>
	b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

export async function appVersion(c: AppContent): Promise<string> {
	return (await digest(JSON.stringify([c.name, c.icon, c.tint, c.source]))).slice(0, 16);
}

export async function appsEtag(apps: AppMeta[]): Promise<string> {
	return `"${(await digest(JSON.stringify(apps))).slice(0, 16)}"`;
}

/** Whether an `If-None-Match` header matches. Cloudflare may weaken a strong
 * ETag on the way out (when it compresses), so a `W/` prefix is ignored. */
export function etagMatches(header: string | null, etag: string): boolean {
	if (!header) return false;
	const strip = (t: string) => t.trim().replace(/^W\//, '');
	return header.split(',').some((t) => strip(t) === etag || t.trim() === '*');
}

export async function listApps(env: Env): Promise<AppMeta[]> {
	const { results } = await env.DB.prepare(LIST_APPS).all<MetaRow>();
	return results.map(toMeta);
}

export async function getApp(env: Env, slug: string): Promise<AppFull | null> {
	const row = await env.DB.prepare(`SELECT ${META}, source FROM apps WHERE slug = ?`)
		.bind(slug)
		.first<MetaRow & { source: string }>();
	return row ? { ...toMeta(row), source: row.source } : null;
}

export async function getAppMeta(env: Env, slug: string): Promise<AppMeta | null> {
	const row = await env.DB.prepare(`SELECT ${META} FROM apps WHERE slug = ?`)
		.bind(slug)
		.first<MetaRow>();
	return row ? toMeta(row) : null;
}

export async function getSource(env: Env, slug: string): Promise<string | null> {
	const row = await env.DB.prepare(`SELECT source FROM apps WHERE slug = ?`)
		.bind(slug)
		.first<{ source: string }>();
	return row?.source ?? null;
}

export async function listVersions(
	env: Env,
	slug: string
): Promise<Array<{ version: string; name: string; origin: AppOrigin; created_at: number }>> {
	const { results } = await env.DB.prepare(
		`SELECT version, name, origin, created_at FROM app_versions
		 WHERE slug = ? ORDER BY created_at DESC, rowid DESC`
	)
		.bind(slug)
		.all<{ version: string; name: string; origin: AppOrigin; created_at: number }>();
	return results;
}

export type PutResult =
	| { ok: true; created: boolean; app: AppMeta }
	/** A create key found the slug taken; nothing was written or consumed. */
	| { ok: false; reason: 'taken' }
	/** Another request consumed the key first; nothing was written. */
	| { ok: false; reason: 'key' };

/** Who is writing: the admin, or the holder of an install key (checked live by the caller). */
export type Writer = { origin: 'admin' } | { origin: 'key'; key: Pick<InstallKeyRow, 'id' | 'slug'> };

/**
 * Creates or updates an app. Writing content identical to the current version
 * changes nothing — same version, no history row, `updated_at` untouched — and
 * still succeeds.
 *
 * With an install key, the key is consumed in the same batch: one conditional
 * `UPDATE` stamps this request's `claim` on the key, and every later
 * statement in the batch only acts if the key carries that claim. Of two
 * requests racing with one key, the second's `UPDATE` matches no row, its
 * writes match nothing, and it reports `key`. A create key writes with a
 * plain `INSERT`, so a taken slug aborts the whole batch — key included —
 * and the key survives to try another slug.
 */
export async function putApp(
	env: Env,
	slug: string,
	content: AppContent,
	writer: Writer
): Promise<PutResult> {
	const now = Date.now();
	const version = await appVersion(content);
	const existed = (await env.DB.prepare(`SELECT 1 FROM apps WHERE slug = ?`).bind(slug).first()) !== null;
	const key = writer.origin === 'key' ? writer.key : null;
	// A key minted without a slug creates one new app and never overwrites.
	const createOnly = key !== null && key.slug === null;

	if (createOnly && existed) return { ok: false, reason: 'taken' };

	const claim = key ? newClaim() : '';
	const { sql: gate, args: gateArgs } = key ? claimed(key.id, claim) : { sql: '1', args: [] };

	const statements = [];
	if (key) statements.push(claimKey(env, key.id, claim, slug, now));

	// The version being replaced goes into history — read from the row itself
	// inside the batch, so a racing write can never push a stale copy.
	statements.push(
		env.DB.prepare(
			`INSERT OR REPLACE INTO app_versions (slug, version, name, icon, tint, source, origin, created_at)
			 SELECT slug, version, name, icon, tint, source, origin, ? FROM apps
			 WHERE slug = ? AND version != ? AND ${gate}`
		).bind(now, slug, version, ...gateArgs)
	);

	const values = [slug, content.name, content.icon, content.tint, content.source, version, writer.origin, now, now];
	statements.push(
		createOnly
			? env.DB.prepare(
					`INSERT INTO apps (slug, name, icon, tint, source, version, origin, created_at, updated_at)
					 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${gate}`
				).bind(...values, ...gateArgs)
			: env.DB.prepare(
					// The gate's WHERE is also what SQLite needs here: without
					// one, `SELECT … ON CONFLICT` is ambiguous to its parser.
					`INSERT INTO apps (slug, name, icon, tint, source, version, origin, created_at, updated_at)
					 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${gate}
					 ON CONFLICT (slug) DO UPDATE SET
					   name = excluded.name, icon = excluded.icon, tint = excluded.tint,
					   source = excluded.source, version = excluded.version,
					   origin = excluded.origin, updated_at = excluded.updated_at
					 WHERE apps.version != excluded.version`
				).bind(...values, ...gateArgs)
	);

	// The current version is never kept in history (it can come back there
	// after A → B → A), and history is capped.
	statements.push(
		env.DB.prepare(`DELETE FROM app_versions WHERE slug = ? AND version = ? AND ${gate}`).bind(
			slug,
			version,
			...gateArgs
		),
		trimHistory(env, slug)
	);

	let results;
	try {
		results = await env.DB.batch(statements);
	} catch (e) {
		// Only the create key's plain INSERT can hit the primary key: a slug
		// created between the read above and this batch. The batch has rolled
		// back, key included.
		if (createOnly && /UNIQUE|constraint/i.test(String(e))) {
			return { ok: false, reason: 'taken' };
		}
		throw e;
	}

	if (key && (results[0]?.meta?.changes ?? 0) === 0) {
		return { ok: false, reason: 'key' };
	}

	const app = await getAppMeta(env, slug);
	if (!app) throw new Error('App vanished after its write.');
	return { ok: true, created: !existed, app };
}

const trimHistory = (env: Env, slug: string) =>
	env.DB.prepare(
		`DELETE FROM app_versions WHERE slug = ? AND rowid NOT IN (
		   SELECT rowid FROM app_versions WHERE slug = ? ORDER BY created_at DESC, rowid DESC LIMIT ${HISTORY}
		 )`
	).bind(slug, slug);

export type RevertResult = { ok: true; app: AppMeta } | { ok: false; reason: 'no-app' | 'no-history' };

/**
 * Swaps the current version with the newest one in history. The replaced
 * current version goes into history, so reverting twice is a redo.
 */
export async function revertApp(env: Env, slug: string): Promise<RevertResult> {
	if (!(await env.DB.prepare(`SELECT 1 FROM apps WHERE slug = ?`).bind(slug).first())) {
		return { ok: false, reason: 'no-app' };
	}

	const prev = await env.DB.prepare(
		`SELECT version, name, icon, tint, source, origin FROM app_versions
		 WHERE slug = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`
	)
		.bind(slug)
		.first<AppContent & { version: string; origin: AppOrigin }>();
	if (!prev) return { ok: false, reason: 'no-history' };

	const now = Date.now();
	await env.DB.batch([
		env.DB.prepare(
			`INSERT OR REPLACE INTO app_versions (slug, version, name, icon, tint, source, origin, created_at)
			 SELECT slug, version, name, icon, tint, source, origin, ? FROM apps WHERE slug = ?`
		).bind(now, slug),
		// The restored content keeps the origin it was written with: it says
		// who wrote this source, not who pressed Revert.
		env.DB.prepare(
			`UPDATE apps SET name = ?, icon = ?, tint = ?, source = ?, version = ?, origin = ?, updated_at = ?
			 WHERE slug = ?`
		).bind(prev.name, prev.icon, prev.tint, prev.source, prev.version, prev.origin, now, slug),
		env.DB.prepare(`DELETE FROM app_versions WHERE slug = ? AND version = ?`).bind(slug, prev.version),
		trimHistory(env, slug)
	]);

	const app = await getAppMeta(env, slug);
	if (!app) throw new Error('App vanished after its revert.');
	return { ok: true, app };
}

/**
 * Deletes an app and its history. Its data stays unless asked: an app can be
 * deleted and made again without losing what it saved. History goes with the
 * app, so a new app under the same slug does not offer to "revert" into the
 * one that was deleted.
 */
export async function deleteApp(env: Env, slug: string, withData: boolean): Promise<void> {
	const statements = [
		env.DB.prepare(`DELETE FROM apps WHERE slug = ?`).bind(slug),
		env.DB.prepare(`DELETE FROM app_versions WHERE slug = ?`).bind(slug)
	];
	if (withData) statements.push(forgetAllData(env, slug));
	await env.DB.batch(statements);
}
