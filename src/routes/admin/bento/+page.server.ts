import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { hasPrevious, publish, readDraft, readPublished, revert, syncDraft } from '$lib/server/bento';
import { isKind, widgets, type WidgetKind } from '$lib/widgets/catalog';
import { parseBlockData } from '$lib/widgets/form';
import { parseLines } from '$lib/widgets/fields';
import type { Span } from '$lib/types';

const noEnv = () => fail(500, { error: 'No platform bindings.' });

const newId = () => crypto.randomUUID().slice(0, 12);

const profileForm = z.object({
	name: z.string().trim().min(1, 'A name is required.').max(80),
	tagline: z.string().trim().max(160),
	bio: z.string().trim().max(1200),
	avatar: z.string().trim().max(200)
});

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = platform?.env;
	if (!env) {
		return {
			draft: { v: 0, profile: { name: '', bio: null, tagline: null, avatar: null, links: [] }, blocks: [] },
			publishedVersion: 0,
			dirty: false,
			canRevert: false,
			assetsOrigin: ''
		};
	}

	const [draft, published, canRevert] = await Promise.all([
		readDraft(env),
		readPublished(env),
		hasPrevious(env)
	]);

	return {
		draft,
		publishedVersion: published?.v ?? 0,
		// Comparing serialised documents is exact and cheap at this size, and
		// it means the publish button is honest about whether it would change
		// anything.
		dirty: JSON.stringify(draft.blocks) !== JSON.stringify(published?.blocks ?? null)
			|| JSON.stringify(draft.profile) !== JSON.stringify(published?.profile ?? null),
		canRevert,
		assetsOrigin: env.ASSETS_ORIGIN ?? '',
		selected: url.searchParams.get('b')
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
			bio: String(form.get('bio') ?? ''),
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

		await env.DB.prepare(
			`UPDATE profile SET name = ?, bio = ?, tagline = ?, avatar = ?, links = ? WHERE id = 1`
		)
			.bind(
				parsed.data.name,
				parsed.data.bio || null,
				parsed.data.tagline || null,
				parsed.data.avatar || null,
				JSON.stringify(links.map((l) => ({ ...l, icon: l.icon || 'globe' })))
			)
			.run();

		await syncDraft(env);
		return { saved: 'profile' };
	},

	addBlock: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const form = await request.formData();
		const kind = String(form.get('kind') ?? '');
		if (!isKind(kind)) return fail(400, { error: 'Unknown widget kind.' });

		const def = widgets[kind];
		const id = newId();
		const next = await env.DB.prepare(`SELECT COALESCE(MAX(ord), -1) + 1 AS ord FROM blocks`).first<{
			ord: number;
		}>();

		await env.DB.prepare(`INSERT INTO blocks (id, ord, kind, span, data) VALUES (?, ?, ?, ?, ?)`)
			.bind(id, next?.ord ?? 0, kind, def.spans[0], JSON.stringify(def.defaults))
			.run();

		await syncDraft(env);
		return { added: id };
	},

	updateBlock: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const kind = String(form.get('kind') ?? '');
		const span = String(form.get('span') ?? '') as Span;

		if (!id || !isKind(kind)) return fail(400, { error: 'Unknown block.' });
		// Spans come from the registry, so an invalid combination is not
		// expressible in the UI — this rejects a hand-crafted POST.
		if (!(widgets[kind].spans as Span[]).includes(span)) {
			return fail(400, { intent: 'block', id, error: 'That size is not available for this widget.' });
		}

		const parsed = parseBlockData(kind as WidgetKind, form);
		if (!parsed.ok) {
			return fail(400, { intent: 'block', id, errors: parsed.errors, raw: parsed.raw });
		}

		await env.DB.prepare(`UPDATE blocks SET span = ?, data = ? WHERE id = ?`)
			.bind(span, JSON.stringify(parsed.data), id)
			.run();

		await syncDraft(env);
		return { saved: id };
	},

	deleteBlock: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'No block given.' });

		const row = await env.DB.prepare(`SELECT kind, data FROM blocks WHERE id = ?`)
			.bind(id)
			.first<{ kind: string; data: string }>();

		await env.DB.prepare(`DELETE FROM blocks WHERE id = ?`).bind(id).run();

		// §5 — no scheduled cleanup. The object goes when its last reference
		// does, checked in the same handler that removed the reference.
		if (row) await releaseAssets(env, row.data);

		await syncDraft(env);
		return { deleted: id };
	},

	reorder: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return noEnv();

		const ids = String((await request.formData()).get('ids') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		if (!ids.length) return fail(400, { error: 'Nothing to reorder.' });

		await env.DB.batch(
			ids.map((id, index) =>
				env.DB.prepare(`UPDATE blocks SET ord = ? WHERE id = ?`).bind(index, id)
			)
		);

		await syncDraft(env);
		return { reordered: true };
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
	}
};

/**
 * Deletes any R2 object this block referenced that no other block still uses.
 * Content-addressed keys make the check a straight string comparison.
 */
async function releaseAssets(env: App.Platform['env'], rawData: string) {
	let keys: string[] = [];
	try {
		const data = JSON.parse(rawData) as Record<string, unknown>;
		keys = ['src', 'image', 'poster', 'avatar']
			.map((k) => data[k])
			.filter((v): v is string => typeof v === 'string' && v.startsWith('img/'));
	} catch {
		return;
	}
	if (!keys.length) return;

	for (const key of keys) {
		const stillUsed = await env.DB.prepare(
			`SELECT 1 FROM blocks WHERE data LIKE ?1
			 UNION ALL SELECT 1 FROM profile WHERE avatar = ?2 LIMIT 1`
		)
			.bind(`%${key}%`, key)
			.first();

		if (stillUsed) continue;

		await env.BUCKET.delete(key).catch(() => {});
		await env.DB.prepare(`DELETE FROM assets WHERE key = ?`).bind(key).run();
	}
}
