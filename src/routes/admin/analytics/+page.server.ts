import type { PageServerLoad } from './$types';
import { dashboard, pruneVisitors } from '$lib/analytics/stats.server';
import { isRange, type RangeKey } from '$lib/analytics/ranges';
import { HOME_SLUG } from '$lib/analytics/visit';
import { afterResponse, bindings } from '$lib/server/bindings';

/** `?r=` picks the range; `?s=` narrows the page to one path (`/` is the homepage). */
export const load: PageServerLoad = async ({ platform, url }) => {
	const env = bindings(platform);
	const requested = url.searchParams.get('r');
	const range: RangeKey = isRange(requested) ? requested : '30d';
	const rawSlug = url.searchParams.get('s');
	const slug = rawSlug === '/' ? HOME_SLUG : rawSlug || null;

	if (Math.random() < 0.05) afterResponse(platform, pruneVisitors(env));

	return { range, slug, ...(await dashboard(env, range, slug)) };
};
