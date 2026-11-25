import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { DATA_LIMITS, KEY_RULE, isDataKey, readAll, readSince, writeData } from '$lib/apps/appData.server';
import { MAX_DATA_APP_BYTES } from '$lib/apps/app';
import { bindings } from '$lib/server/bindings';

/**
 * An app's data (Shelf plan §8.2): all of it, everything since a rev, or a
 * batch of sets and deletes in one transaction. Admin token only — an install
 * key never reaches data.
 */

// A batch carries at most the app's whole store plus the JSON around it.
const MAX_BATCH_BODY = MAX_DATA_APP_BYTES + 1024 * 1024;

export const GET: RequestHandler = async ({ request, params, url, platform }) => {
	const env = bindings(platform);

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const since = url.searchParams.get('since');
	if (since === null) return apiJson(await readAll(env, params.slug));

	if (!/^\d{1,15}$/.test(since)) return apiError(400, 'since must be a whole number, 0 or more.');
	return apiJson(await readSince(env, params.slug, Number(since)));
};

export const POST: RequestHandler = async ({ request, params, platform }) => {
	const env = bindings(platform);

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	if (Number(request.headers.get('content-length') ?? 0) > MAX_BATCH_BODY) {
		return apiError(413, DATA_LIMITS.app);
	}

	let body: unknown;
	try {
		body = JSON.parse(await request.text());
	} catch {
		return apiError(400, 'Body must be JSON.');
	}

	const invalid = (error: string, extra?: Record<string, unknown>) => apiError(422, error, extra);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return invalid('Send { "set": { key: value }, "delete": [key] }.');
	}

	const { set = {}, delete: del = [] } = body as { set?: unknown; delete?: unknown };
	if (!set || typeof set !== 'object' || Array.isArray(set)) {
		return invalid('"set" must be an object of keys to values.');
	}
	if (!Array.isArray(del) || del.some((k) => typeof k !== 'string')) {
		return invalid('"delete" must be a list of keys.');
	}

	const keys = [...Object.keys(set), ...(del as string[])];
	if (!keys.length) return invalid('Send at least one key to set or delete.');
	for (const key of keys) {
		if (!isDataKey(key)) return invalid(KEY_RULE, { key });
	}
	// One key both set and deleted has no single meaning; refuse rather than pick.
	if (new Set(keys).size !== keys.length) return invalid('Send each key once.');

	const json = Object.fromEntries(
		Object.entries(set as Record<string, unknown>).map(([k, v]) => [k, JSON.stringify(v)])
	);
	const result = await writeData(env, params.slug, json, del as string[]);
	if (!result.ok) return apiError(413, result.error, result.key ? { key: result.key } : undefined);

	return apiJson({ rev: result.rev });
};
