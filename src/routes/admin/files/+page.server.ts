import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	cleanName,
	createFile,
	deleteFile,
	freeRandomSlug,
	getFile,
	listFiles,
	parseExpiry,
	slugProblem
} from '$lib/server/files';
import { fmtBytes } from '$lib/format';
import { MAX_FORM_FILE_BYTES, type FileRow } from '$lib/types';
import { uploadLimits } from '$lib/uploads';

/**
 * The admin's file screen. Uploading is the only write that matters: a file's
 * bytes go to R2, its row to D1, and the recipient gets `/d/{slug}`. Editing
 * is out of scope — replace a file by uploading a new one.
 *
 * With JavaScript the form streams the file to R2 in parts through
 * `/api/files/uploads`, up to `uploadLimits().maxFileBytes`. The `create`
 * action below is the no-JS fallback for small files.
 */

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = platform?.env;
	if (!env) return { files: [], selected: null, origin: '', maxFileBytes: 0 };

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
		origin: url.origin,
		maxFileBytes: uploadLimits(env.UPLOAD_PART_MIB).maxFileBytes
	};
};

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

		// A form posted with nothing picked still carries a nameless, empty File.
		if (!(file instanceof File) || (!file.name && file.size === 0)) {
			return fail(400, { intent: 'create', fields: { file: 'Choose a file.' }, values });
		}
		if (file.size === 0) return fail(400, { intent: 'create', fields: { file: 'That file is empty.' }, values });
		if (file.size > MAX_FORM_FILE_BYTES) {
			return fail(400, {
				intent: 'create',
				fields: {
					file: `Without JavaScript, files can be up to ${fmtBytes(MAX_FORM_FILE_BYTES)}.`
				},
				values
			});
		}

		// An explicit slug must be valid and free; a blank one gets a random
		// slug, which is the "I just want to send this" default.
		let slug = values.slug.trim();
		const fields: Record<string, string> = {};

		if (slug) {
			const problem = await slugProblem(env, slug);
			if (problem) fields.slug = problem;
		} else {
			slug = (await freeRandomSlug(env)) ?? '';
			if (!slug) fields.slug = 'Could not find a free name. Try again.';
		}

		if (fields.slug) return fail(400, { intent: 'create', fields, values });

		const row: Omit<FileRow, 'created_at' | 'downloads'> = {
			slug,
			key: `dl/${slug}`,
			name: cleanName(file.name),
			mime: file.type || 'application/octet-stream',
			bytes: file.size,
			expires_at: parseExpiry(values.expires)
		};

		await createFile(env, row, await file.arrayBuffer());
		return { created: slug };
	},

	delete: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const slug = String((await request.formData()).get('slug') ?? '');
		if (!slug) return fail(400, { intent: 'delete', error: 'No file given.' });

		if (!(await getFile(env, slug))) {
			return fail(404, { intent: 'delete', error: 'That file no longer exists.' });
		}

		await deleteFile(env, slug);
		return { deleted: slug };
	}
};
