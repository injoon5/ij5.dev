import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { RESERVED, SLUG_PATTERN } from '$lib/reserved';
import { cleanName, createFile, deleteFile, getFile, listFiles, randomFileSlug, slugAvailable } from '$lib/server/files';
import { MAX_FILE_BYTES, type FileRow } from '$lib/types';

/**
 * The admin's file screen. Uploading is the only write that matters: a file's
 * bytes go to R2, its row to D1, and the recipient gets `/d/{slug}`. Editing
 * is out of scope — replace a file by uploading a new one.
 */

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = platform?.env;
	if (!env) return { files: [], selected: null, origin: '' };

	const rows = await listFiles(env);
	const files = rows.map((row) => ({
		...row,
		// Expiry is judged on the server, never the visitor's clock.
		expired: row.expires_at !== null && row.expires_at < Date.now()
	}));
	const wanted = url.searchParams.get('s');

	return {
		files,
		selected: wanted ? (files.find((f) => f.slug === wanted) ?? null) : null,
		origin: url.origin
	};
};

function expiresAt(raw: string): number | null {
	const v = raw.trim();
	return v ? Date.parse(`${v}T23:59:59Z`) || null : null;
}

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const data = await request.formData();
		const file = data.get('file');
		const values = {
			slug: String(data.get('slug') ?? ''),
			expires: String(data.get('expires') ?? '')
		};

		if (!(file instanceof File)) return fail(400, { intent: 'create', error: 'Choose a file to upload.' });
		if (file.size === 0) return fail(400, { intent: 'create', error: 'That file is empty.' });
		if (file.size > MAX_FILE_BYTES) {
			return fail(400, {
				intent: 'create',
				error: `Files are capped at ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB.`
			});
		}

		// An explicit slug must be valid and free; a blank one gets a random
		// slug, which is the "I just want to send this" default.
		let slug = values.slug.trim();
		const fields: Record<string, string> = {};

		if (slug) {
			if (!SLUG_PATTERN.test(slug)) {
				fields.slug = 'Letters, numbers, hyphens and underscores. No dots or slashes.';
			} else if (RESERVED.has(slug)) {
				fields.slug = `"${slug}" is reserved by the site itself.`;
			} else if (!(await slugAvailable(env, slug))) {
				fields.slug = 'That name is taken.';
			}
		} else {
			for (let i = 0; i < 8 && !slug; i++) {
				const candidate = randomFileSlug();
				if (await slugAvailable(env, candidate)) slug = candidate;
			}
			if (!slug) fields.slug = 'Could not find a free slug; try again.';
		}

		if (fields.slug) return fail(400, { intent: 'create', fields, values });

		const row: Omit<FileRow, 'created_at' | 'downloads'> = {
			slug,
			key: `dl/${slug}`,
			name: cleanName(file.name),
			mime: file.type || 'application/octet-stream',
			bytes: file.size,
			expires_at: expiresAt(values.expires)
		};

		await createFile(env, row, await file.arrayBuffer());
		return { created: slug };
	},

	delete: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const slug = String((await request.formData()).get('slug') ?? '');
		if (!slug) return fail(400, { error: 'No slug given.' });

		if (!(await getFile(env, slug))) return fail(404, { error: 'That file no longer exists.' });

		await deleteFile(env, slug);
		return { deleted: slug };
	}
};
