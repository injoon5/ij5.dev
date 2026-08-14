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

	// A D1 row with no KV mirror is a link that 404s forever, and a retry then
	// bounces off "slug taken". If the mirror fails, undo the insert so the two
	// stores stay in lockstep and the caller can try again cleanly.
	try {
		await env.KV.put(kvKey(row.slug), JSON.stringify(toRecord(row)));
	} catch (e) {
		await env.DB.prepare(`DELETE FROM slugs WHERE slug = ?`).bind(row.slug).run().catch(() => {});
		throw e;
	}
}

export async function updateSlug(env: Env, row: Omit<SlugRow, 'created_at'>): Promise<void> {
	const prev = await getSlug(env, row.slug);
	await env.DB.prepare(
		`UPDATE slugs SET target_url = ?, status = ?, note = ?, expires_at = ? WHERE slug = ?`
	)
		.bind(row.target_url, row.status, row.note, row.expires_at, row.slug)
		.run();

	try {
		await env.KV.put(kvKey(row.slug), JSON.stringify(toRecord(row)));
	} catch (e) {
		if (prev) {
			await env.DB.prepare(
				`UPDATE slugs SET target_url = ?, status = ?, note = ?, expires_at = ? WHERE slug = ?`
			)
				.bind(prev.target_url, prev.status, prev.note, prev.expires_at, prev.slug)
				.run()
				.catch(() => {});
		} else {
			await env.DB.prepare(`DELETE FROM slugs WHERE slug = ?`).bind(row.slug).run().catch(() => {});
		}
		throw e;
	}
}

export async function deleteSlug(env: Env, slug: string): Promise<void> {
	const prev = await getSlug(env, slug);
	await env.DB.prepare(`DELETE FROM slugs WHERE slug = ?`).bind(slug).run();

	try {
		await env.KV.delete(kvKey(slug));
	} catch (e) {
		// A KV entry with no D1 row is a link that still resolves but can no
		// longer be edited or deleted. Restore the row so the stores agree and
		// the caller can retry.
		if (prev) {
			await env.DB.prepare(
				`INSERT INTO slugs (slug, target_url, status, note, created_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
				.bind(prev.slug, prev.target_url, prev.status, prev.note, prev.created_at, prev.expires_at)
				.run()
				.catch(() => {});
		}
		throw e;
	}
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
