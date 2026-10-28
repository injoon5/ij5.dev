import { RESERVED, SLUG_PATTERN } from '$lib/reserved';
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

/**
 * A single `Range: bytes=…` request against a file of `size` bytes: the span
 * to send, `'unsatisfiable'` when it starts past the end, or `null` to send
 * the whole file (no header, a multi-range, or a header that does not parse
 * — RFC 9110 says to ignore those rather than fail).
 */
export function parseRange(
	header: string | null,
	size: number
): { offset: number; length: number } | 'unsatisfiable' | null {
	const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
	if (!m || (!m[1] && !m[2])) return null;
	if (!m[1]) {
		// A suffix: the last N bytes.
		const length = Math.min(Number(m[2]), size);
		return length > 0 ? { offset: size - length, length } : 'unsatisfiable';
	}
	const offset = Number(m[1]);
	if (offset >= size) return 'unsatisfiable';
	const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
	if (end < offset) return null;
	return { offset, length: end - offset + 1 };
}

/**
 * The quoted `filename=` of a Content-Disposition header. Header values must be
 * bytes, so a name with Hangul or an emoji in it would throw while the response
 * was being built and turn the download into a 500. The real name rides in the
 * RFC 5987 `filename*` beside it; this is only the fallback for clients that
 * ignore that, so anything outside printable ASCII becomes `_`.
 */
export function asciiName(name: string): string {
	return name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
}

/** Both forms of the filename, for `Content-Disposition: attachment`. */
export function contentDisposition(name: string): string {
	return `attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;
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

/** The R2 key a shared file's bytes live under. */
export const fileKey = r2Key;

/**
 * Writes the catalog row for bytes already in R2. If the row cannot be
 * written the object is deleted, so a failed upload never leaves an orphan.
 */
export async function insertFileRow(
	env: Env,
	row: Omit<FileRow, 'key' | 'created_at' | 'downloads'>
): Promise<void> {
	try {
		await env.DB.prepare(
			`INSERT INTO files (slug, key, name, mime, bytes, created_at, expires_at, downloads)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
		)
			.bind(row.slug, r2Key(row.slug), row.name, row.mime, row.bytes, Date.now(), row.expires_at)
			.run();
	} catch (e) {
		await env.BUCKET.delete(r2Key(row.slug)).catch(() => {});
		throw e;
	}
}

/** Parses the form's `YYYY-MM-DD` expiry into the end of that day, UTC. */
export function parseExpiry(raw: string | null | undefined): number | null {
	const v = (raw ?? '').trim();
	return v ? Date.parse(`${v}T23:59:59Z`) || null : null;
}

/**
 * Whether a slug can be used for a new file: valid, not reserved, free.
 * Returns the problem as a sentence, or nothing.
 */
export async function slugProblem(env: Env, slug: string): Promise<string | undefined> {
	if (!SLUG_PATTERN.test(slug)) return 'Use letters, numbers, hyphens and underscores.';
	if (RESERVED.has(slug)) return `"${slug}" is reserved by the site itself.`;
	if (!(await slugAvailable(env, slug))) return 'That name is taken.';
}

/** A free random slug, or null after a few unlucky tries. */
export async function freeRandomSlug(env: Env): Promise<string | null> {
	for (let i = 0; i < 8; i++) {
		const candidate = randomFileSlug();
		if (await slugAvailable(env, candidate)) return candidate;
	}
	return null;
}

/** The no-JS path: a small file posted in one form, buffered and stored. */
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
