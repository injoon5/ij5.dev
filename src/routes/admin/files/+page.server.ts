import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFull } from '$lib/auth/guard.server';
import { cleanName, createFile, deleteFile, getFile, listFiles } from '$lib/files/files.server';
import { fmtBytes } from '$lib/format';
import { endOfDay, isExpired } from '$lib/expiry';
import { FILE_EMPTY, fileTooBig, MAX_FORM_FILE_BYTES } from '$lib/files/file';
import { chooseSlug } from '$lib/slugs/slugs.server';
import { uploadLimits } from '$lib/files/uploads';
import { bindings } from '$lib/server/bindings';

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
	const env = bindings(platform);

	// Expiry is judged on the server, never the visitor's clock.
	const files = (await listFiles(env)).map((row) => ({ ...row, expired: isExpired(row.expires_at) }));
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
		const env = bindings(platform);

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
		if (file.size === 0) return fail(400, { intent: 'create', fields: { file: FILE_EMPTY }, values });
		if (file.size > MAX_FORM_FILE_BYTES) {
			return fail(400, { intent: 'create', fields: { file: `Without JavaScript, ${fileTooBig(fmtBytes(MAX_FORM_FILE_BYTES)).toLowerCase()}` }, values });
		}

		const chosen = await chooseSlug(env, values.slug);
		if (!chosen.ok) return fail(400, { intent: 'create', fields: { slug: chosen.problem }, values });

		await createFile(
			env,
			{
				slug: chosen.slug,
				name: cleanName(file.name),
				mime: file.type || 'application/octet-stream',
				bytes: file.size,
				expires_at: endOfDay(values.expires)
			},
			await file.arrayBuffer()
		);
		return { created: chosen.slug };
	},

	delete: async ({ request, platform, locals }) => {
		const denied = requireFull(locals, 'delete');
		if (denied) return denied;
		const env = bindings(platform);

		const current = await getFile(env, String((await request.formData()).get('slug') ?? ''));
		if (!current) return fail(404, { intent: 'delete', error: 'That file no longer exists.' });

		await deleteFile(env, current);
		return { deleted: current.slug };
	}
};
