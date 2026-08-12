import type { PageServerLoad } from './$types';
import { loadFromD1, readPublished } from '$lib/server/bento';
import { planRefresh, readLive } from '$lib/server/live';
import { needsScriptFor } from '$lib/widgets/catalog';
import type { BentoDoc, LiveDoc } from '$lib/types';

const EMPTY: BentoDoc = {
	v: 0,
	profile: { name: 'ij5', bio: null, tagline: null, avatar: null, links: [] },
	blocks: []
};

export const load: PageServerLoad = async ({ platform, locals, url }) => {
	const env = platform?.env;
	if (!env)
		return { ...EMPTY, live: null, assetsOrigin: '', publicOrigin: url.origin, needsScript: false };

	let doc: BentoDoc | null = null;

	try {
		// The hook already read this to build the cache key; reuse it rather
		// than paying a second KV read on the page that matters most.
		doc = locals.bento ?? (await readPublished(env));
	} catch {
		doc = null;
	}

	if (!doc) {
		// §13 — KV is unavailable or nothing has been published yet. Fall back
		// to the source of truth rather than serving an error.
		try {
			const { profile, blocks } = await loadFromD1(env);
			doc = { v: 0, profile, blocks };
		} catch {
			doc = EMPTY;
		}
	}

	let live: LiveDoc | null = null;
	try {
		live = await readLive(env);
		// Refresh happens behind the response. The first visitor after a TTL
		// expires sees slightly stale data; nobody waits on a third party.
		const refresh = planRefresh(doc.blocks, live, env);
		if (refresh) platform.context?.waitUntil?.(refresh().catch(() => {}));
	} catch {
		live = null;
	}

	return {
		v: doc.v,
		profile: doc.profile,
		blocks: doc.blocks,
		live,
		assetsOrigin: env.ASSETS_ORIGIN ?? '',
		// Absolute URLs are not optional in a share card — a preview is fetched
		// by a crawler with no page to resolve a relative path against. The
		// configured origin wins over the request's so that a preview link or a
		// workers.dev URL still points share traffic at the canonical host.
		publicOrigin: env.PUBLIC_ORIGIN || url.origin,
		// `/w.js` is only requested when something on the page needs it, so a
		// bento of static blocks makes zero script requests.
		needsScript: doc.blocks.some((b) => needsScriptFor(b.kind))
	};
};
