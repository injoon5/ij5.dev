import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireFull } from '$lib/auth/guard.server';
import { endOfDay, isExpired } from '$lib/expiry';
import { fieldErrors } from '$lib/forms';
import { linkFields } from '$lib/links/input';
import type { LinkInput } from '$lib/links/link';
import { createLink, deleteLink, getLink, listLinks, updateLink } from '$lib/links/links.server';
import { recentHits } from '$lib/analytics/stats.server';
import { slugProblem } from '$lib/slugs/slugs.server';
import { bindings } from '$lib/server/bindings';

const form = z.object({
	slug: linkFields.slug,
	target_url: linkFields.url,
	status: z.coerce.number().pipe(linkFields.status),
	note: linkFields.note.transform((v) => v || null),
	expires: z.string().transform(endOfDay)
});

const FIELDS = ['slug', 'target_url', 'status', 'note', 'expires'] as const;

function parse(data: FormData) {
	const values = Object.fromEntries(FIELDS.map((k) => [k, String(data.get(k) ?? '')]));
	const result = form.safeParse(values);
	if (!result.success) return { ok: false as const, fields: fieldErrors(result.error), values };
	const { expires, ...rest } = result.data;
	return { ok: true as const, values, row: { ...rest, expires_at: expires } satisfies LinkInput };
}

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = bindings(platform);

	const [links, recent] = await Promise.all([listLinks(env), recentHits(env, 'redirect')]);

	// Judged on the server, never the visitor's clock.
	const slugs = links.map((row) => ({ ...row, expired: isExpired(row.expires_at) }));
	const wanted = url.searchParams.get('s');

	return {
		slugs,
		recent,
		selected: wanted ? (slugs.find((s) => s.slug === wanted) ?? null) : null
	};
};

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const env = bindings(platform);
		const parsed = parse(await request.formData());
		if (!parsed.ok) return fail(400, { intent: 'create', ...parsed });

		const problem = await slugProblem(env, parsed.row.slug);
		if (problem) return fail(409, { intent: 'create', fields: { slug: problem }, values: parsed.values });

		await createLink(env, parsed.row);
		return { created: parsed.row.slug };
	},

	update: async ({ request, platform }) => {
		const env = bindings(platform);
		const parsed = parse(await request.formData());
		if (!parsed.ok) return fail(400, { intent: 'update', ...parsed });

		const current = await getLink(env, parsed.row.slug);
		if (!current) return fail(404, { intent: 'update', error: 'That link no longer exists.' });

		await updateLink(env, current, parsed.row);
		return { updated: parsed.row.slug };
	},

	delete: async ({ request, platform, locals }) => {
		const denied = requireFull(locals, 'delete');
		if (denied) return denied;
		const env = bindings(platform);

		const current = await getLink(env, String((await request.formData()).get('slug') ?? ''));
		if (!current) return fail(404, { intent: 'delete', error: 'That link no longer exists.' });

		await deleteLink(env, current);
		return { deleted: current.slug };
	}
};
