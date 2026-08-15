import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { RESERVED, SLUG_PATTERN } from '$lib/reserved';
import { getFile } from '$lib/server/files';
import {
	createPaste,
	deletePaste,
	getPaste,
	listPastes,
	purgePasteCache,
	updatePaste
} from '$lib/server/pastes';
import { getSlug } from '$lib/server/slugs';
import { MAX_PASTE_CHARS, type PasteRow } from '$lib/types';

/**
 * The admin's pastes screen: a master–detail list like the links screen, with
 * the body edited in a textarea. D1 stays the source of truth; every write
 * mirrors into KV through `pastes.ts`, and the hook picks the change up on
 * the next request.
 */

const form = z.object({
	slug: z
		.string()
		.trim()
		.regex(SLUG_PATTERN, 'Letters, numbers, hyphens and underscores. No dots or slashes.'),
	body: z
		.string()
		.min(1, 'A paste needs at least one character.')
		.max(MAX_PASTE_CHARS, `Keep it under ${MAX_PASTE_CHARS.toLocaleString('en')} characters.`),
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
		.transform((v) => (v ? Date.parse(`${v}T23:59:59Z`) || null : null)),
	// A checkbox sends "on" or nothing. Default is cached — the flag is the
	// opt-out, so an unchecked box must mean "cache on", never the reverse.
	cache: z
		.enum(['on', ''])
		.optional()
		.transform((v) => v === 'on')
});

type FormError = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };

function parse(data: FormData): { ok: true; row: Omit<PasteRow, 'created_at'> } | ({ ok: false } & FormError) {
	const values = Object.fromEntries(
		['slug', 'body', 'note', 'expires', 'cache'].map((k) => [k, String(data.get(k) ?? '')])
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
			body: result.data.body,
			note: result.data.note,
			expires_at: result.data.expires,
			cache: result.data.cache
		}
	};
}

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = platform?.env;
	if (!env) return { pastes: [], recent: {}, selected: null };

	const [rows, stats] = await env.DB.batch([
		env.DB.prepare(
			`SELECT slug, body, note, created_at, expires_at, cache
			 FROM pastes ORDER BY created_at DESC`
		),
		env.DB.prepare(
			`SELECT slug, SUM(n) AS hits FROM hits
			 WHERE kind = 'paste' AND device != 'bot' AND day >= date('now','-7 day')
			 GROUP BY slug`
		)
	]);

	const recent: Record<string, number> = {};
	for (const row of stats.results as Array<{ slug: string; hits: number }>) {
		recent[row.slug] = row.hits;
	}

	const pastes = (rows.results as PasteRow[]).map((row) => ({
		...row,
		// Expiry is judged on the server, never the visitor's clock.
		expired: row.expires_at !== null && row.expires_at < Date.now()
	}));
	const wanted = url.searchParams.get('s');

	return {
		pastes,
		recent,
		selected: wanted ? (pastes.find((p) => p.slug === wanted) ?? null) : null
	};
};

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const data = await request.formData();
		const parsed = parse(data);
		if (!parsed.ok) return fail(400, { intent: 'create', ...parsed });

		if (RESERVED.has(parsed.row.slug)) {
			return fail(400, {
				intent: 'create',
				fields: { slug: `"${parsed.row.slug}" is reserved by the site itself.` },
				values: Object.fromEntries(data) as Record<string, string>
			});
		}

		// The hook checks links before pastes, so a paste that shares a name
		// with a link would silently never resolve.
		if (await getSlug(env, parsed.row.slug)) {
			return fail(409, {
				intent: 'create',
				fields: { slug: 'That name is taken by a link.' },
				values: Object.fromEntries(data) as Record<string, string>
			});
		}

		if (await getPaste(env, parsed.row.slug)) {
			return fail(409, {
				intent: 'create',
				fields: { slug: 'That slug is taken.' },
				values: Object.fromEntries(data) as Record<string, string>
			});
		}

		if (await getFile(env, parsed.row.slug)) {
			return fail(409, {
				intent: 'create',
				fields: { slug: 'That name is taken by a file.' },
				values: Object.fromEntries(data) as Record<string, string>
			});
		}

		await createPaste(env, parsed.row);
		return { created: parsed.row.slug };
	},

	update: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const parsed = parse(await request.formData());
		if (!parsed.ok) return fail(400, { intent: 'update', ...parsed });

		if (!(await getPaste(env, parsed.row.slug))) {
			return fail(404, { intent: 'update', error: 'That paste no longer exists.' });
		}

		await updatePaste(env, parsed.row);
		await purgePasteCache(platform, parsed.row.slug, new URL(request.url).origin);
		return { updated: parsed.row.slug };
	},

	delete: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const slug = String((await request.formData()).get('slug') ?? '');
		if (!slug) return fail(400, { error: 'No slug given.' });

		await deletePaste(env, slug);
		await purgePasteCache(platform, slug, new URL(request.url).origin);
		return { deleted: slug };
	}
};
