import { imageKeysIn, isAssetKey, mintAssetKey } from './assetKeys';
import { HOME_KEYS, type AssetRow, type HomeDoc } from '$lib/home/types';

/**
 * Uploaded images are content-addressed and shared, so an R2 object may only
 * go when nothing can still draw it. "Anything" is wider than the editor:
 * the D1 draft, the published document visitors are looking at right now, and
 * the previous one a revert would bring back. Checking D1 alone would delete a
 * photo the moment it left the *draft*, breaking the live page until the next
 * publish and leaving a revert pointing at nothing.
 *
 * No scheduled cleanup: an object is released by the handler that dropped its
 * last reference — a save, a profile edit, or a publish pushing a document out
 * of `home:prev`.
 */

type Env = App.Platform['env'];


export function docKeys(doc: Pick<HomeDoc, 'markdown' | 'profile'> | null | undefined): string[] {
	if (!doc) return [];
	return [...imageKeysIn(doc.markdown), doc.profile?.avatar].filter(isAssetKey);
}

async function referencedKeys(env: Env): Promise<Set<string>> {
	const [row, published, prev] = await Promise.all([
		env.DB.prepare(`SELECT content, avatar FROM profile WHERE id = 1`).first<{
			content: string | null;
			avatar: string | null;
		}>(),
		env.KV.get<HomeDoc>(HOME_KEYS.published, { type: 'json' }),
		env.KV.get<HomeDoc>(HOME_KEYS.previous, { type: 'json' })
	]);
	return new Set([
		...imageKeysIn(row?.content),
		...[row?.avatar].filter(isAssetKey),
		...docKeys(published),
		...docKeys(prev)
	]);
}

export async function isReferenced(env: Env, key: string): Promise<boolean> {
	return (await referencedKeys(env)).has(key);
}

export async function removeAsset(env: Env, key: string): Promise<void> {
	// The row goes only once the object has: a row with no object is
	// harmless, an object with no row is never found again.
	await env.BUCKET.delete(key);
	await env.DB.prepare(`DELETE FROM assets WHERE key = ?`).bind(key).run();
}

/**
 * Deletes every key in `keys` that nothing references any more. Call it
 * *after* the write that dropped the reference — the check is live, so running
 * it first would find the reference being replaced and keep the object.
 */
export async function releaseAssets(env: Env, keys: string[]): Promise<void> {
	if (!keys.length) return;
	const live = await referencedKeys(env);
	for (const key of new Set(keys)) {
		// A failed delete keeps the row, so the image stays listed and can be removed by hand.
		if (!live.has(key)) await removeAsset(env, key).catch((e: unknown) => console.error('image cleanup failed:', key, e));
	}
}

/** Every uploaded image, newest first, for the editor's image list. */
export async function listAssets(env: Env): Promise<AssetRow[]> {
	const { results } = await env.DB.prepare(`SELECT key, mime, bytes, w, h, at FROM assets ORDER BY at DESC LIMIT 200`).all<AssetRow>();
	return results;
}

/** Intrinsic sizes for the images a document draws, so each reserves its box before it loads. */
export async function assetDims(env: Env, keys: string[]): Promise<Map<string, { w: number; h: number }>> {
	const dims = new Map<string, { w: number; h: number }>();
	if (!keys.length) return dims;
	const { results } = await env.DB.prepare(`SELECT key, w, h FROM assets WHERE key IN (${keys.map(() => '?').join(',')})`)
		.bind(...keys)
		.all<{ key: string; w: number | null; h: number | null }>();
	for (const row of results as Array<{ key: string; w: number | null; h: number | null }>) {
		if (row.w && row.h) dims.set(row.key, { w: row.w, h: row.h });
	}
	return dims;
}

/**
 * Stores an uploaded image, or finds it already stored. Setting
 * `cacheControl` at upload makes serving a pure passthrough: the bucket's
 * custom domain answers without the Worker running.
 */
export async function storeAsset(
	env: Env,
	body: ArrayBuffer,
	format: { mime: string; ext: string },
	size: { w: number | null; h: number | null }
): Promise<{ key: string; deduped: boolean }> {
	const key = await mintAssetKey(body, format.ext);
	if (await env.DB.prepare(`SELECT 1 FROM assets WHERE key = ?`).bind(key).first()) return { key, deduped: true };
	await env.BUCKET.put(key, body, {
		httpMetadata: { contentType: format.mime, cacheControl: 'public, max-age=31536000, immutable' }
	});
	await env.DB.prepare(`INSERT INTO assets (key, mime, bytes, w, h, at) VALUES (?, ?, ?, ?, ?, ?)`)
		.bind(key, format.mime, body.byteLength, size.w, size.h, Date.now())
		.run();
	return { key, deduped: false };
}
