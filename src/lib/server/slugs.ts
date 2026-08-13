import type { SlugRecord, SlugRow } from '$lib/types';

/**
 * D1 is the source of truth for links; KV is what the redirect path reads.
 * Every write here mirrors into KV, and every delete clears it, so the two can
 * only disagree for as long as one `await` takes.
 */

type Env = App.Platform['env'];

const kvKey = (slug: string) => `slug:${slug}`;

/**
 * Schemes a link may point at. A short link is only ever a `Location:` header,
 * so `mailto:` and friends are legitimate targets — but the allow-list stays,
 * so a paste can never smuggle in `javascript:`, `data:` or anything else that
 * turns a redirect into a payload.
 */
const TARGET_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'sms']);

/**
 * Whether a destination is one the shortener will accept. `z.url()` only
 * admits http(s); here the URL must parse and its scheme be allow-listed.
 */
export function isTargetUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return TARGET_SCHEMES.has(url.protocol.slice(0, -1));
}

const toRecord = (row: Pick<SlugRow, 'target_url' | 'status' | 'expires_at'>): SlugRecord => ({
	target: row.target_url,
	status: row.status,
	exp: row.expires_at
});

export async function listSlugs(env: Env): Promise<SlugRow[]> {
	const { results } = await env.DB.prepare(
		`SELECT slug, target_url, status, note, created_at, expires_at
		 FROM slugs ORDER BY created_at DESC`
	).all<SlugRow>();
	return results;
}

export async function getSlug(env: Env, slug: string): Promise<SlugRow | null> {
	return await env.DB.prepare(
		`SELECT slug, target_url, status, note, created_at, expires_at FROM slugs WHERE slug = ?`
	)
		.bind(slug)
		.first<SlugRow>();
}

export async function createSlug(env: Env, row: Omit<SlugRow, 'created_at'>): Promise<void> {
	const created = Date.now();
	await env.DB.prepare(
		`INSERT INTO slugs (slug, target_url, status, note, created_at, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?)`
	)
		.bind(row.slug, row.target_url, row.status, row.note, created, row.expires_at)
		.run();

	await env.KV.put(kvKey(row.slug), JSON.stringify(toRecord(row)));
}

export async function updateSlug(env: Env, row: Omit<SlugRow, 'created_at'>): Promise<void> {
	await env.DB.prepare(
		`UPDATE slugs SET target_url = ?, status = ?, note = ?, expires_at = ? WHERE slug = ?`
	)
		.bind(row.target_url, row.status, row.note, row.expires_at, row.slug)
		.run();

	await env.KV.put(kvKey(row.slug), JSON.stringify(toRecord(row)));
}

export async function deleteSlug(env: Env, slug: string): Promise<void> {
	await env.DB.prepare(`DELETE FROM slugs WHERE slug = ?`).bind(slug).run();
	await env.KV.delete(kvKey(slug));
}

/**
 * The edge cache holds a redirect for up to five minutes and `cache.delete()`
 * only reaches the colo it runs in, so an edited slug can serve its old target
 * for that long elsewhere. Purging locally is still worth the one call: it
 * makes the change instant for whoever is editing, which is who checks.
 */
export async function purgeLocalCache(
	platform: App.Platform | undefined,
	slug: string
): Promise<void> {
	try {
		await platform?.caches?.default?.delete(new Request(`https://cache.internal/s/${slug}`));
	} catch {
		// A cache purge is a convenience; failing it must not fail the edit.
	}
}
