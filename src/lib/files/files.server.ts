import { isExpired } from '$lib/expiry';
import type { FileRow } from '$lib/files/file';

/**
 * File sharing, SendAnywhere-style: bytes go to R2 under `dl/{slug}`, D1 keeps
 * the catalog row, and `/d/{slug}` serves a landing page whose download link
 * streams the object.
 *
 * An R2 object with no row is an orphan, and a row with no object is a
 * download that 404s, so every write cleans up after itself when the other
 * store fails.
 */

type Env = App.Platform['env'];

export const fileKey = (slug: string) => `dl/${slug}`;

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
function asciiName(name: string): string {
	return name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
}

export function contentDisposition(name: string): string {
	return `attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const COLUMNS = `slug, key, name, mime, bytes, created_at, expires_at, downloads`;

export async function listFiles(env: Env): Promise<FileRow[]> {
	const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM files ORDER BY created_at DESC`).all<FileRow>();
	return results;
}

export async function getFile(env: Env, slug: string): Promise<FileRow | null> {
	return env.DB.prepare(`SELECT ${COLUMNS} FROM files WHERE slug = ?`).bind(slug).first<FileRow>();
}

/** The file a visitor may download: present and not expired. */
export async function getLiveFile(env: Env, slug: string): Promise<FileRow | null> {
	const file = await getFile(env, slug);
	return file && !isExpired(file.expires_at) ? file : null;
}

export type FileInput = Omit<FileRow, 'key' | 'created_at' | 'downloads'>;

/**
 * Catalogs bytes already in R2 at `fileKey(slug)`. If the row cannot be
 * written the object goes too — unless another upload won the same slug, in
 * which case the object is the winner's.
 */
export async function recordFile(env: Env, row: FileInput): Promise<void> {
	const key = fileKey(row.slug);
	try {
		await env.DB.prepare(`INSERT INTO files (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`)
			.bind(row.slug, key, row.name, row.mime, row.bytes, Date.now(), row.expires_at)
			.run();
	} catch (e) {
		if (!(await getFile(env, row.slug))) {
			await env.BUCKET.delete(key).catch((d: unknown) => console.error('orphan cleanup failed:', d));
		}
		throw e;
	}
}

/** The no-JS path: a small file posted in one form, buffered and stored. */
export async function createFile(env: Env, row: FileInput, body: ArrayBuffer): Promise<void> {
	await env.BUCKET.put(fileKey(row.slug), body, { httpMetadata: { contentType: row.mime } });
	await recordFile(env, row);
}

/** `current` is the row as the caller read it; it is put back if R2 fails. */
export async function deleteFile(env: Env, current: FileRow): Promise<void> {
	await env.DB.prepare(`DELETE FROM files WHERE slug = ?`).bind(current.slug).run();
	try {
		await env.BUCKET.delete(current.key);
	} catch (e) {
		await env.DB.prepare(`INSERT INTO files (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
			.bind(current.slug, current.key, current.name, current.mime, current.bytes, current.created_at, current.expires_at, current.downloads)
			.run()
			.catch((r: unknown) => console.error('file rollback failed:', r));
		throw e;
	}
}

export async function bumpDownloads(env: Env, slug: string): Promise<void> {
	await env.DB.prepare(`UPDATE files SET downloads = downloads + 1 WHERE slug = ?`).bind(slug).run();
}
