import { imageKeysIn } from '$lib/markdown';
import type { HomeDoc } from '$lib/types';

/**
 * Uploaded images are content-addressed and shared, so an R2 object may only
 * go when nothing can still draw it (§5). "Anything" is wider than the editor:
 * the D1 draft, the published document visitors are looking at right now, and
 * the previous one a revert would bring back. Checking D1 alone deleted a
 * photo the moment it left the *draft*, breaking the live page until the next
 * publish and leaving a revert pointing at nothing.
 *
 * No scheduled cleanup: an object is released by the handler that dropped its
 * last reference — a save, a profile edit, or a publish pushing a document out
 * of `home:prev`.
 */

type Env = App.Platform['env'];

export const isAssetKey = (v: unknown): v is string => typeof v === 'string' && v.startsWith('img/');

/** Every asset key a document draws: its body images and its avatar. */
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
		env.KV.get<HomeDoc>('home', { type: 'json' }),
		env.KV.get<HomeDoc>('home:prev', { type: 'json' })
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
	await env.BUCKET.delete(key).catch(() => {});
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
		if (!live.has(key)) await removeAsset(env, key);
	}
}
