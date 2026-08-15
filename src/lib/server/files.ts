import type { FileRow } from '$lib/types';

/**
 * File sharing, SendAnywhere-style: bytes go to R2 under `dl/{slug}`, D1 keeps
 * the catalog row, and `/d/{slug}` serves a landing page whose download link
 * streams the object. Two segments, so the hook's single-segment fast path
 * never sees it — everything here resolves through SvelteKit.
 *
 * D1 and R2 are kept in lockstep like the KV mirrors elsewhere: an R2 object
 * with no row is an orphan, and a row with no object is a download that 404s,
 * so every write cleans up after itself when the other store fails.
 */

type Env = App.Platform['env'];

const r2Key = (slug: string) => `dl/${slug}`;

/** No ambiguous characters — a slug someone types from a chat message must
 *  survive being read out loud. */
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function randomFileSlug(length = 8): string {
	const rand = crypto.getRandomValues(new Uint8Array(length));
	let out = '';
	for (let i = 0; i < length; i++) out += SLUG_ALPHABET[rand[i] % SLUG_ALPHABET.length];
	return out;
}

/** The three tables share the root-slug namespace; one batch checks them all. */
export async function slugAvailable(env: Env, slug: string): Promise<boolean> {
	const results = await env.DB.batch([
		env.DB.prepare(`SELECT 1 FROM slugs WHERE slug = ?`).bind(slug),
		env.DB.prepare(`SELECT 1 FROM pastes WHERE slug = ?`).bind(slug),
		env.DB.prepare(`SELECT 1 FROM files WHERE slug = ?`).bind(slug)
	]);
	return results.every((r: { results: unknown[] }) => r.results.length === 0);
}

/** A filename becomes a header value and a title; strip anything that could
 *  break out of either. */
export function cleanName(name: string): string {
	const cleaned = name
		.replace(/[\\/]/g, '-')
		.replace(/["\n\r]/g, '')
		.trim();
	return cleaned.slice(0, 255) || 'file';
}

export async function listFiles(env: Env): Promise<FileRow[]> {
	const { results } = await env.DB.prepare(
		`SELECT slug, key, name, mime, bytes, created_at, expires_at, downloads
		 FROM files ORDER BY created_at DESC`
	).all<FileRow>();
	return results;
}

export async function getFile(env: Env, slug: string): Promise<FileRow | null> {
	return await env.DB.prepare(
		`SELECT slug, key, name, mime, bytes, created_at, expires_at, downloads
		 FROM files WHERE slug = ?`
	)
		.bind(slug)
		.first<FileRow>();
}

export async function createFile(
	env: Env,
	row: Omit<FileRow, 'created_at' | 'downloads'>,
	body: ArrayBuffer
): Promise<void> {
	const created = Date.now();
	await env.BUCKET.put(r2Key(row.slug), body, { httpMetadata: { contentType: row.mime } });

	try {
		await env.DB.prepare(
			`INSERT INTO files (slug, key, name, mime, bytes, created_at, expires_at, downloads)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
		)
			.bind(row.slug, r2Key(row.slug), row.name, row.mime, row.bytes, created, row.expires_at)
			.run();
	} catch (e) {
		// An orphan object is wasted storage; undo the put and let the caller
		// retry the whole upload cleanly.
		await env.BUCKET.delete(r2Key(row.slug)).catch(() => {});
		throw e;
	}
}

export async function deleteFile(env: Env, slug: string): Promise<void> {
	const prev = await getFile(env, slug);
	await env.DB.prepare(`DELETE FROM files WHERE slug = ?`).bind(slug).run();

	try {
		await env.BUCKET.delete(r2Key(slug));
	} catch (e) {
		if (prev) {
			await env.DB.prepare(
				`INSERT INTO files (slug, key, name, mime, bytes, created_at, expires_at, downloads)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
				.bind(prev.slug, prev.key, prev.name, prev.mime, prev.bytes, prev.created_at, prev.expires_at, prev.downloads)
				.run()
				.catch(() => {});
		}
		throw e;
	}
}

/** Fire-and-forget from the download route; a missed count is not a failure. */
export async function bumpDownloads(env: Env, slug: string): Promise<void> {
	await env.DB.prepare(`UPDATE files SET downloads = downloads + 1 WHERE slug = ?`).bind(slug).run();
}
