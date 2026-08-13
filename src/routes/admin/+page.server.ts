import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { RESERVED, SLUG_PATTERN } from '$lib/reserved';
import {
	createSlug,
	deleteSlug,
	getSlug,
	isTargetUrl,
	listSlugs,
	purgeLocalCache,
	updateSlug
} from '$lib/server/slugs';
import type { SlugRow } from '$lib/types';

const form = z.object({
	slug: z
		.string()
		.trim()
		.regex(SLUG_PATTERN, 'Letters, numbers, hyphens and underscores. No dots or slashes.'),
	target_url: z
		.string()
		.trim()
		.refine(isTargetUrl, 'Needs a full URL — https://, mailto:, tel: or sms:'),
	// 301 is browser-cached forever, so it is opt-in per link rather than the
	// default: you will eventually want to repoint something.
	status: z.coerce.number().int().refine((v) => v === 301 || v === 302, 'Pick 301 or 302'),
	note: z
		.string()
		.trim()
		.max(200)
		.optional()
		.transform((v) => v || null),
	expires: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? Date.parse(`${v}T23:59:59Z`) || null : null))
});

type FormError = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };

function parse(data: FormData): { ok: true; row: Omit<SlugRow, 'created_at'> } | { ok: false } & FormError {
	const values = Object.fromEntries(
		['slug', 'target_url', 'status', 'note', 'expires'].map((k) => [k, String(data.get(k) ?? '')])
	);

	const result = form.safeParse(values);
	if (!result.success) {
		const fields: Record<string, string> = {};
		for (const issue of result.error.issues) {
			const key = String(issue.path[0]);
			if (!fields[key]) fields[key] = issue.message;
		}
		return { ok: false, fields, values };
	}

	return {
		ok: true,
		row: {
			slug: result.data.slug,
			target_url: result.data.target_url,
			status: result.data.status,
			note: result.data.note,
			expires_at: result.data.expires
		}
	};
}

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = platform?.env;
	if (!env) return { slugs: [], recent: {}, selected: null };

	// One round trip, not two. The same rule holds on every admin screen.
	const [links, stats] = await env.DB.batch([
		env.DB.prepare(
			`SELECT slug, target_url, status, note, created_at, expires_at
			 FROM slugs ORDER BY created_at DESC`
		),
		env.DB.prepare(
			`SELECT slug, SUM(n) AS hits FROM hits
			 WHERE kind = 'redirect' AND device != 'bot' AND day >= date('now','-7 day')
			 GROUP BY slug`
		)
	]);

	const recent: Record<string, number> = {};
	for (const row of stats.results as Array<{ slug: string; hits: number }>) {
		recent[row.slug] = row.hits;
	}

	const slugs = links.results as SlugRow[];
	const wanted = url.searchParams.get('s');

	return {
		slugs,
		recent,
		selected: wanted ? (slugs.find((s) => s.slug === wanted) ?? null) : null
	};
};

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const data = await request.formData();
		const parsed = parse(data);
		if (!parsed.ok) return fail(400, { intent: 'create', ...parsed });

		// The hook skips reserved names, so a slug that shadowed one would
		// simply never resolve. Reject it here instead of creating a link that
		// silently does nothing.
		if (RESERVED.has(parsed.row.slug)) {
			return fail(400, {
				intent: 'create',
				fields: { slug: `"${parsed.row.slug}" is reserved by the site itself.` },
				values: Object.fromEntries(data) as Record<string, string>
			});
		}

		if (await getSlug(env, parsed.row.slug)) {
			return fail(409, {
				intent: 'create',
				fields: { slug: 'That slug is taken.' },
				values: Object.fromEntries(data) as Record<string, string>
			});
		}

		await createSlug(env, parsed.row);
		return { created: parsed.row.slug };
	},

	update: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const parsed = parse(await request.formData());
		if (!parsed.ok) return fail(400, { intent: 'update', ...parsed });

		if (!(await getSlug(env, parsed.row.slug))) {
			return fail(404, { intent: 'update', error: 'That link no longer exists.' });
		}

		await updateSlug(env, parsed.row);
		await purgeLocalCache(platform, parsed.row.slug);
		return { updated: parsed.row.slug };
	},

	delete: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const slug = String((await request.formData()).get('slug') ?? '');
		if (!slug) return fail(400, { error: 'No slug given.' });

		await deleteSlug(env, slug);
		await purgeLocalCache(platform, slug);
		return { deleted: slug };
	}
};
