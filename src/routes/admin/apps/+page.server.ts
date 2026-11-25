import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFull } from '$lib/auth/guard.server';
import { fieldErrors } from '$lib/forms';
import { SLUG_MESSAGE, SLUG_PATTERN } from '$lib/slugs/slugs';
import {
	appContent,
	deleteApp,
	getApp,
	getAppMeta,
	listApps,
	listVersions,
	putApp,
	revertApp
} from '$lib/apps/apps.server';
import { DATA_LIMITS, KEY_RULE, isDataKey, listEntries, readOne, writeData } from '$lib/apps/appData.server';
import { bindings } from '$lib/server/bindings';

/**
 * Shelf's apps in the admin: a master–detail list, an
 * editor per app with its history and its data, and New App, which fills
 * itself from a pasted chat reply. It writes through the same `apps.ts` and
 * `appData.ts` as the API, so a save here is exactly a `PUT` with the admin
 * token — same version hash, same history row.
 */

const FIELDS = ['slug', 'name', 'icon', 'tint', 'source'] as const;

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = bindings(platform);

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
		const env = bindings(platform);

		const data = await request.formData();
		const values: Values = Object.fromEntries(FIELDS.map((k) => [k, String(data.get(k) ?? '')]));
		const creating = data.get('mode') === 'create';
		const slug = (values.slug ?? '').trim();
		const parsed = appContent.safeParse(values);
		const fields = {
			...(parsed.success ? {} : fieldErrors(parsed.error)),
			...(SLUG_PATTERN.test(slug) ? {} : { slug: SLUG_MESSAGE })
		};
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
		const env = bindings(platform);

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
		const denied = requireFull(locals, 'delete');
		if (denied) return denied;
		const env = bindings(platform);

		const data = await request.formData();
		const slug = String(data.get('slug') ?? '');
		if (!slug) return fail(400, { intent: 'delete', error: 'No app given.' });

		await deleteApp(env, slug, data.get('data') === 'delete');
		return { deleted: slug };
	},

	setData: async ({ request, platform }) => {
		const env = bindings(platform);

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
		const denied = requireFull(locals, 'data');
		if (denied) return denied;
		const env = bindings(platform);

		const data = await request.formData();
		const slug = String(data.get('slug') ?? '');
		const key = String(data.get('key') ?? '');
		if (!isDataKey(key)) return fail(400, { intent: 'data', error: KEY_RULE });

		const result = await writeData(env, slug, {}, [key]);
		if (!result.ok) return fail(500, { intent: 'data', error: DATA_LIMITS.app });
		return { dataDeleted: key };
	}
};
