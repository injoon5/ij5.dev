import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import {
	hasPrevious,
	publish,
	readDraft,
	readPublished,
	revert,
	syncDraft
} from '$lib/server/home';
import { parseLines } from '$lib/lines';
import { imageKeysIn } from '$lib/markdown';
import type { AssetRow } from '$lib/types';

const noEnv = () => fail(500, { error: 'No platform bindings.' });

const MAX_CONTENT = 50_000;

const profileForm = z.object({
	name: z.string().trim().min(1, 'A name is required.').max(80),
	tagline: z.string().trim().max(160),
	avatar: z.string().trim().max(200)
});

export const load: PageServerLoad = async ({ platform }) => {
	const env = platform?.env;
	if (!env) {
		return {
			draft: {
				v: 0,
				profile: { name: '', bio: null, tagline: null, avatar: null, links: [], content: null },
				markdown: ''
			},
			publishedVersion: 0,
			dirty: false,
			canRevert: false,
			assetsOrigin: '',
			files: []
		};
	}

	const [draft, published, canRevert, files] = await Promise.all([
		readDraft(env),
		readPublished(env),
		hasPrevious(env),
		env.DB.prepare(
			`SELECT key, mime, bytes, w, h, at FROM assets ORDER BY at DESC LIMIT 200`
		).all<AssetRow>()
	]);

	return {
		draft,
		publishedVersion: published?.v ?? 0,
		// Comparing serialised documents is exact and cheap at this size, and it
		// keeps the publish button honest about whether it would change anything.
		dirty:
			draft.markdown !== (published?.markdown ?? '') ||
			JSON.stringify(draft.profile) !== JSON.stringify(published?.profile ?? null),
		canRevert,
		assetsOrigin: env.ASSETS_ORIGIN ?? '',
		files: files.results
	};
};

export const actions: Actions = {
	profile: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const form = await request.formData();
		const parsed = profileForm.safeParse({
			name: String(form.get('name') ?? ''),
			tagline: String(form.get('tagline') ?? ''),
			avatar: String(form.get('avatar') ?? '')
		});

		if (!parsed.success) {
			return fail(400, {
				intent: 'profile',
				fields: Object.fromEntries(
					parsed.error.issues.map((i) => [String(i.path[0]), i.message])
				) as Record<string, string>
			});
		}

		// `Label | https://… | github` per line — a repeater with add and remove
		// buttons would need JavaScript, and this form has to work without it.
		const links = parseLines(String(form.get('links') ?? ''), ['label', 'href', 'icon']).filter(
			(l) => l.label && l.href
		);

		// The avatar is an asset like any other, so a replaced one is released on
		// the same terms as a replaced image in the body.
		const before = await env.DB.prepare(`SELECT avatar FROM profile WHERE id = 1`).first<{
			avatar: string | null;
		}>();

		const avatar = parsed.data.avatar || null;

		// `bio` is deliberately left untouched: the page no longer renders it, but
		// wiping the column on every save would be a silent data loss.
		await env.DB.prepare(
			`UPDATE profile SET name = ?, tagline = ?, avatar = ?, links = ? WHERE id = 1`
		)
			.bind(
				parsed.data.name,
				parsed.data.tagline || null,
				avatar,
				JSON.stringify(links.map((l) => ({ ...l, icon: l.icon || 'globe' })))
			)
			.run();

		if (before?.avatar !== avatar) {
			await releaseAssets(env, [before?.avatar].filter(isAssetKey));
		}

		await syncDraft(env);
		return { saved: 'profile' };
	},

	save: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const content = String((await request.formData()).get('content') ?? '');
		if (content.length > MAX_CONTENT) {
			return fail(400, {
				intent: 'content',
				error: `That is longer than the editor supports (${MAX_CONTENT.toLocaleString()} characters).`
			});
		}

		// Read what the body referenced before overwriting it: content-addressed
		// keys mean an image dropped from the document would otherwise linger in
		// R2 forever with nothing left pointing at it (§5).
		const before = await env.DB.prepare(`SELECT content FROM profile WHERE id = 1`).first<{
			content: string | null;
		}>();

		await env.DB.prepare(`UPDATE profile SET content = ? WHERE id = 1`)
			.bind(content || null)
			.run();

		if (before) {
			const kept = new Set(imageKeysIn(content));
			await releaseAssets(env, imageKeysIn(before.content).filter((key) => !kept.has(key)));
		}

		await syncDraft(env);
		return { saved: 'content' };
	},

	publish: async ({ platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();
		const doc = await publish(env);
		return { published: doc.v };
	},

	revert: async ({ platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();
		const doc = await revert(env);
		if (!doc) return fail(400, { error: 'Nothing to revert to yet.' });
		return { reverted: doc.v };
	},

	deleteFile: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const key = String((await request.formData()).get('key') ?? '');
		if (!isAssetKey(key)) return fail(400, { error: 'That file is not deletable here.' });

		// Content-addressed keys are shared, so a delete is a live-reference
		// check first: the avatar, or any image still in the document.
		if (await isReferenced(env, key)) {
			return fail(409, { error: 'That file is still in use on the page.' });
		}

		await removeAsset(env, key);

		// Keep the editor's draft in sync with the live reference set.
		await syncDraft(env);
		return { deleted: key };
	}
};

const isAssetKey = (v: unknown): v is string => typeof v === 'string' && v.startsWith('img/');

/**
 * Whether an asset key is still referenced by the page — the avatar or any
 * image inside the Markdown body. Content-addressed keys are shared, so a
 * delete must never remove something the page still draws.
 */
async function isReferenced(env: App.Platform['env'], key: string): Promise<boolean> {
	const row = await env.DB.prepare(
		`SELECT 1 FROM profile WHERE id = 1 AND (content LIKE ?1 OR avatar = ?2) LIMIT 1`
	)
		.bind(`%${key}%`, key)
		.first();
	return Boolean(row);
}

async function removeAsset(env: App.Platform['env'], key: string): Promise<void> {
	await env.BUCKET.delete(key).catch(() => {});
	await env.DB.prepare(`DELETE FROM assets WHERE key = ?`).bind(key).run();
}

/**
 * Deletes any R2 object in `keys` that nothing references any more (§5). No
 * scheduled cleanup: the object goes when its last reference does, checked in
 * the same handler that removed the reference.
 *
 * Call this *after* the write that dropped the reference, never before — the
 * check is a live query, so running it first would find the row being replaced
 * and conclude the image is still in use.
 */
async function releaseAssets(env: App.Platform['env'], keys: string[]) {
	for (const key of keys) {
		if (await isReferenced(env, key)) continue;
		await removeAsset(env, key);
	}
}
