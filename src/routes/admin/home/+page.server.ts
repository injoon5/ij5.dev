import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireFull } from '$lib/auth/guard.server';
import {
	clearCache,
	hasPrevious,
	publish,
	readDraft,
	readPrevious,
	readPublished,
	restoreToD1,
	revert,
	saveContent,
	saveProfile,
	syncDraft
} from '$lib/home/home.server';
import { docKeys, isReferenced, listAssets, releaseAssets, removeAsset } from '$lib/home/assets.server';
import { imageKeysIn, isAssetKey } from '$lib/home/assetKeys';
import { parseLines } from '$lib/home/lines';
import { bindings } from '$lib/server/bindings';
import { fieldErrors } from '$lib/forms';


const MAX_CONTENT = 50_000;

const profileForm = z.object({
	name: z.string().trim().min(1, 'A name is required.').max(80),
	tagline: z.string().trim().max(160),
	avatar: z.string().trim().max(200)
});

export const load: PageServerLoad = async ({ platform }) => {
	const env = bindings(platform);

	const [draft, published, canRevert, files] = await Promise.all([
		readDraft(env),
		readPublished(env),
		hasPrevious(env),
		listAssets(env)
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
		files
	};
};

export const actions: Actions = {
	profile: async ({ request, platform }) => {
		const env = bindings(platform);

		const form = await request.formData();
		const parsed = profileForm.safeParse({
			name: String(form.get('name') ?? ''),
			tagline: String(form.get('tagline') ?? ''),
			avatar: String(form.get('avatar') ?? '')
		});

		if (!parsed.success) {
			return fail(400, {
				intent: 'profile',
				fields: fieldErrors(parsed.error)
			});
		}

		const links = parseLines(String(form.get('links') ?? ''), ['label', 'href', 'icon']).filter(
			(l) => l.label && l.href
		);

		const avatar = parsed.data.avatar || null;
		const { previousAvatar } = await saveProfile(env, {
			name: parsed.data.name,
			tagline: parsed.data.tagline || null,
			avatar,
			links: links.map((l) => ({ label: l.label, href: l.href, icon: l.icon || 'globe' }))
		});
		if (previousAvatar !== avatar) await releaseAssets(env, [previousAvatar].filter(isAssetKey));

		await syncDraft(env);
		return { saved: 'profile' };
	},

	save: async ({ request, platform }) => {
		const env = bindings(platform);

		const result = await saveBody(env, String((await request.formData()).get('content') ?? ''));
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
		const env = bindings(platform);

		const content = (await request.formData()).get('content');
		if (typeof content === 'string') {
			const result = await saveBody(env, content);
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
		const env = bindings(platform);
		const doc = await revert(env);
		if (!doc) return fail(400, { error: 'Nothing to revert to yet.' });
		await restoreToD1(env, doc);
		return { reverted: doc.v };
	},

	clear: async ({ platform, locals }) => {
		const denied = requireFull(locals);
		if (denied) return denied;
		const env = bindings(platform);
		const doc = await clearCache(env);
		if (!doc) {
			return fail(400, { error: 'Nothing is published yet, so there is no cache to clear.' });
		}
		return { cleared: doc.v };
	},

	deleteFile: async ({ request, platform, locals }) => {
		const denied = requireFull(locals);
		if (denied) return denied;
		const env = bindings(platform);

		const key = String((await request.formData()).get('key') ?? '');
		if (!isAssetKey(key)) return fail(400, { error: 'That image cannot be deleted here.' });

		if (await isReferenced(env, key)) {
			return fail(409, {
				error: 'That image is still in use — on the page, the live site, or the previous version.'
			});
		}

		await removeAsset(env, key);
		return { deleted: key };
	}
};

async function saveBody(env: App.Platform['env'], content: string) {
	if (content.length > MAX_CONTENT) {
		return fail(400, {
			intent: 'content',
			error: `The page is longer than the editor supports (${MAX_CONTENT.toLocaleString('en')} characters).`
		});
	}

	const { previous } = await saveContent(env, content);
	const kept = new Set(imageKeysIn(content));
	await releaseAssets(env, imageKeysIn(previous).filter((key) => !kept.has(key)));
}
