import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import {
	clearCache,
	hasPrevious,
	publish,
	readDraft,
	readPrevious,
	readPublished,
	restoreToD1,
	revert,
	syncDraft
} from '$lib/server/home';
import { docKeys, isAssetKey, isReferenced, releaseAssets, removeAsset } from '$lib/server/assets';
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

		// `Label | https://…` per line — a repeater with add and remove buttons
		// would need JavaScript, and this form has to work without it.
		const links = parseLines(String(form.get('links') ?? ''), ['label', 'href', 'icon']).filter(
			(l) => l.label && l.href
		);

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

		// The avatar is an asset like any other, so a replaced one is released on
		// the same terms as a replaced image in the body.
		if (before?.avatar !== avatar) {
			await releaseAssets(env, [before?.avatar].filter(isAssetKey));
		}

		await syncDraft(env);
		return { saved: 'profile' };
	},

	save: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const result = await saveContent(env, String((await request.formData()).get('content') ?? ''));
		if (result) return result;

		await syncDraft(env);
		return { saved: 'content' };
	},

	/**
	 * Publishing what is on screen, not what was last saved. The editor sends
	 * its buffer along, so "Publish" after an edit can never ship the previous
	 * draft while the new text sits unsaved in the textarea.
	 */
	publish: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const content = (await request.formData()).get('content');
		if (typeof content === 'string') {
			const result = await saveContent(env, content);
			if (result) return result;
			await syncDraft(env);
		}

		// The document about to fall out of `home:prev` may hold the last
		// reference to an image; once it is gone, so is the image.
		const dropped = await readPrevious(env);
		const doc = await publish(env);
		await releaseAssets(env, docKeys(dropped));
		return { published: doc.v };
	},

	revert: async ({ platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();
		const doc = await revert(env);
		if (!doc) return fail(400, { error: 'Nothing to revert to yet.' });
		await restoreToD1(env, doc);
		return { reverted: doc.v };
	},

	clear: async ({ platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();
		const doc = await clearCache(env);
		if (!doc) {
			return fail(400, { error: 'Nothing is published yet, so there is no cache to clear.' });
		}
		return { cleared: doc.v };
	},

	deleteFile: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const key = String((await request.formData()).get('key') ?? '');
		if (!isAssetKey(key)) return fail(400, { error: 'That image cannot be deleted here.' });

		// Content-addressed keys are shared, so a delete is a live-reference
		// check first: the draft, the live page, and the version a revert
		// would restore.
		if (await isReferenced(env, key)) {
			return fail(409, {
				error: 'That image is still in use — on the page, the live site, or the previous version.'
			});
		}

		await removeAsset(env, key);
		return { deleted: key };
	}
};

/**
 * Writes the Markdown body to D1 and releases any image it stopped drawing.
 * Returns a failure to hand straight back to the form, or nothing on success.
 */
async function saveContent(env: App.Platform['env'], content: string) {
	if (content.length > MAX_CONTENT) {
		return fail(400, {
			intent: 'content',
			error: `The page is longer than the editor supports (${MAX_CONTENT.toLocaleString('en')} characters).`
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
}
