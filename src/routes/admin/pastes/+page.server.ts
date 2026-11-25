import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireFull } from '$lib/auth/guard.server';
import { recentHits } from '$lib/analytics/stats.server';
import { endOfDay, isExpired } from '$lib/expiry';
import { fieldErrors } from '$lib/forms';
import { linkFields } from '$lib/links/input';
import { MAX_PASTE_CHARS, type PasteInput } from '$lib/pastes/paste';
import { createPaste, deletePaste, getPaste, listPastes, updatePaste } from '$lib/pastes/pastes.server';
import { slugProblem } from '$lib/slugs/slugs.server';
import { bindings } from '$lib/server/bindings';

const form = z.object({
	slug: linkFields.slug,
	body: z
		.string()
		.min(1, 'Write something to share.')
		.max(MAX_PASTE_CHARS, `Keep it under ${MAX_PASTE_CHARS.toLocaleString('en')} characters.`),
	note: linkFields.note.transform((v) => v || null),
	expires: z.string().transform(endOfDay),
	cache: z.string().transform((v) => v === 'on')
});

const FIELDS = ['slug', 'body', 'note', 'expires', 'cache'] as const;

function parse(data: FormData) {
	const values = Object.fromEntries(FIELDS.map((k) => [k, String(data.get(k) ?? '')]));
	const result = form.safeParse(values);
	if (!result.success) return { ok: false as const, fields: fieldErrors(result.error), values };
	const { expires, ...rest } = result.data;
	return { ok: true as const, values, row: { ...rest, expires_at: expires } satisfies PasteInput };
}

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = bindings(platform);
	const [rows, recent] = await Promise.all([listPastes(env), recentHits(env, 'paste')]);

	// Judged on the server, never the visitor's clock.
	const pastes = rows.map((row) => ({ ...row, expired: isExpired(row.expires_at) }));
	const wanted = url.searchParams.get('s');

	return {
		pastes,
		recent,
		selected: wanted ? (pastes.find((p) => p.slug === wanted) ?? null) : null
	};
};

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const env = bindings(platform);
		const parsed = parse(await request.formData());
		if (!parsed.ok) return fail(400, { intent: 'create', ...parsed });

		const problem = await slugProblem(env, parsed.row.slug);
		if (problem) return fail(409, { intent: 'create', fields: { slug: problem }, values: parsed.values });

		await createPaste(env, parsed.row);
		return { created: parsed.row.slug };
	},

	update: async ({ request, platform, url }) => {
		const env = bindings(platform);
		const parsed = parse(await request.formData());
		if (!parsed.ok) return fail(400, { intent: 'update', ...parsed });

		if (!(await getPaste(env, parsed.row.slug))) {
			return fail(404, { intent: 'update', error: 'That paste no longer exists.' });
		}

		await updatePaste(env, parsed.row, url.origin);
		return { updated: parsed.row.slug };
	},

	delete: async ({ request, platform, locals, url }) => {
		const denied = requireFull(locals);
		if (denied) return denied;

		const slug = String((await request.formData()).get('slug') ?? '');
		if (!slug) return fail(400, { intent: 'delete', error: 'No paste given.' });

		await deletePaste(bindings(platform), slug, url.origin);
		return { deleted: slug };
	}
};
