import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFull } from '$lib/server/guard';
import { SLUG_PATTERN } from '$lib/reserved';
import {
	appContent,
	deleteApp,
	getApp,
	getAppMeta,
	listApps,
	listVersions,
	putApp,
	revertApp,
	utf8Bytes
} from '$lib/server/apps';
import { DATA_LIMITS, KEY_RULE, isDataKey, listEntries, readOne, writeData } from '$lib/server/appData';
import { MAX_APP_BYTES } from '$lib/types';

/**
 * Shelf's apps in the admin (plan §1.4, §8.2, §9.3): a master–detail list, an
 * editor per app with its history and its data, and New App, which fills
 * itself from a pasted chat reply. It writes through the same `apps.ts` and
 * `appData.ts` as the API, so a save here is exactly a `PUT` with the admin
 * token — same version hash, same history row.
 */

const FIELDS = ['slug', 'name', 'icon', 'tint', 'source'] as const;

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = platform?.env;
	if (!env) return { apps: [], selected: null, versions: [], entries: [], value: null };

	const wanted = url.searchParams.get('s');
	const key = url.searchParams.get('k');
	const apps = await listApps(env);
	const selected = wanted && wanted !== 'new' ? await getApp(env, wanted) : null;

	// Data belongs to a slug, not to an app row, so the tab works for data
	// whose app was deleted with "keep data" too — but only via an app here.
	const [versions, entries, value] = selected
		? await Promise.all([
				listVersions(env, selected.slug),
				listEntries(env, selected.slug),
				key ? readOne(env, selected.slug, key) : null
			])
		: [[], [], null];

	return { apps, selected, versions, entries, value: key && value !== null ? { key, json: value } : null };
};

type Values = Partial<Record<(typeof FIELDS)[number], string>>;

export const actions: Actions = {
	save: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { intent: 'save', error: 'No platform bindings.' });

		const data = await request.formData();
		const values: Values = Object.fromEntries(FIELDS.map((k) => [k, String(data.get(k) ?? '')]));
		const creating = data.get('mode') === 'create';
		const fields: Record<string, string> = {};

		const slug = (values.slug ?? '').trim();
		if (!SLUG_PATTERN.test(slug)) fields.slug = 'Use letters, numbers, hyphens and underscores.';

		// The textarea posts CRLF line endings; the stored source, like the
		// parser's, has "\n" only, so the version does not depend on the browser.
		const source = (values.source ?? '').replace(/\r\n?/g, '\n');
		if (utf8Bytes(source) > MAX_APP_BYTES) {
			fields.source = `Keep the source under ${MAX_APP_BYTES / 1024} KB.`;
		}

		const parsed = appContent.safeParse({ ...values, source });
		if (!parsed.success) {
			for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
		}
		if (!parsed.success || Object.keys(fields).length) {
			return fail(400, { intent: 'save', fields, values });
		}

		// New App never overwrites: a taken slug is almost always a reply for
		// an app that already exists, which belongs in that app's editor.
		if (creating && (await getAppMeta(env, slug))) {
			return fail(409, { intent: 'save', fields: { slug: 'That slug is taken.' }, values });
		}

		const result = await putApp(env, slug, parsed.data, { origin: 'admin' });
		if (!result.ok) return fail(500, { intent: 'save', error: 'The app could not be saved.', values });
		return { saved: slug, created: result.created };
	},

	revert: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { intent: 'revert', error: 'No platform bindings.' });

		const slug = String((await request.formData()).get('slug') ?? '');
		const result = await revertApp(env, slug);
		if (!result.ok) {
			return fail(404, {
				intent: 'revert',
				error: result.reason === 'no-app' ? 'That app no longer exists.' : 'Nothing to revert to.'
			});
		}
		return { reverted: slug };
	},

	delete: async ({ request, platform, locals }) => {
		const denied = requireFull(locals);
		if (denied) return denied;
		const env = platform?.env;
		if (!env) return fail(500, { intent: 'delete', error: 'No platform bindings.' });

		const data = await request.formData();
		const slug = String(data.get('slug') ?? '');
		if (!slug) return fail(400, { intent: 'delete', error: 'No app given.' });

		await deleteApp(env, slug, data.get('data') === 'delete');
		return { deleted: slug };
	},

	setData: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { intent: 'data', error: 'No platform bindings.' });

		const data = await request.formData();
		const slug = String(data.get('slug') ?? '');
		const key = String(data.get('key') ?? '');
		const json = String(data.get('value') ?? '');
		const echo = { key, value: json };

		if (!isDataKey(key)) return fail(400, { intent: 'data', fields: { key: KEY_RULE }, ...echo });

		let value: unknown;
		try {
			value = JSON.parse(json);
		} catch {
			return fail(400, { intent: 'data', fields: { value: 'That is not valid JSON.' }, ...echo });
		}

		// Stored compact, exactly as the API stores it, so sizes agree.
		const result = await writeData(env, slug, { [key]: JSON.stringify(value) }, []);
		if (!result.ok) return fail(413, { intent: 'data', fields: { value: result.error }, ...echo });
		return { dataSaved: key };
	},

	deleteData: async ({ request, platform, locals }) => {
		const denied = requireFull(locals);
		if (denied) return denied;
		const env = platform?.env;
		if (!env) return fail(500, { intent: 'data', error: 'No platform bindings.' });

		const data = await request.formData();
		const slug = String(data.get('slug') ?? '');
		const key = String(data.get('key') ?? '');
		if (!isDataKey(key)) return fail(400, { intent: 'data', error: KEY_RULE });

		const result = await writeData(env, slug, {}, [key]);
		if (!result.ok) return fail(500, { intent: 'data', error: DATA_LIMITS.app });
		return { dataDeleted: key };
	}
};
