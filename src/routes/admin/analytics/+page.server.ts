import type { PageServerLoad } from './$types';
import { RANGES, fillDays, isRange, type RangeKey } from './ranges';

/**
 * Every query on this page runs in one `DB.batch()` — one round trip to D1,
 * not ten.
 *
 * `?s=` narrows the whole page to one path: the totals, the chart and every
 * breakdown answer for that slug alone (`/` is the homepage, whose slug is
 * the empty string). Every number excludes bots and 404s, so any two numbers
 * on the page can be compared; the 404 list is the one deliberate exception.
 */

type Row<T> = Array<T>;

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = platform?.env;
	const requested = url.searchParams.get('r');
	const range: RangeKey = isRange(requested) ? requested : '30d';
	const rawSlug = url.searchParams.get('s');
	const slug = rawSlug === '/' ? '' : rawSlug || null;

	const empty = {
		range,
		slug,
		traffic: [] as Row<{ day: string; hits: number }>,
		top: [] as Row<{ slug: string; kind: string; hits: number }>,
		referrers: [] as Row<{ referrer: string; hits: number }>,
		countries: [] as Row<{ country: string; hits: number }>,
		devices: [] as Row<{ device: string; hits: number }>,
		os: [] as Row<{ os: string; hits: number }>,
		browsers: [] as Row<{ browser: string; hits: number }>,
		notFound: [] as Row<{ path: string; hits: number }>,
		totals: { clicks: 0, views: 0, visitors: 0 }
	};
	if (!env) return empty;

	const offset = RANGES[range];
	const only = slug !== null ? ' AND slug = ?2' : '';
	const q = (sql: string) => {
		const stmt = env.DB.prepare(sql);
		return slug !== null ? stmt.bind(offset, slug) : stmt.bind(offset);
	};
	const real = `day >= date('now', ?1) AND device != 'bot' AND kind != '404'${only}`;

	const [traffic, top, referrers, countries, devices, os, browsers, notFound, totals, uniques] =
		await env.DB.batch([
			q(`SELECT day, SUM(n) AS hits FROM hits WHERE ${real} GROUP BY day ORDER BY day`),
			q(
				`SELECT slug, kind, SUM(n) AS hits FROM hits WHERE ${real}
				 GROUP BY slug, kind ORDER BY hits DESC LIMIT 20`
			),
			q(`SELECT referrer, SUM(n) AS hits FROM hits WHERE ${real} GROUP BY referrer ORDER BY hits DESC LIMIT 15`),
			q(`SELECT country, SUM(n) AS hits FROM hits WHERE ${real} GROUP BY country ORDER BY hits DESC LIMIT 12`),
			q(`SELECT device, SUM(n) AS hits FROM hits WHERE ${real} GROUP BY device ORDER BY hits DESC`),
			// `hits_device` holds no bots, so only the 404 rows need leaving out.
			q(
				`SELECT os, SUM(n) AS hits FROM hits_device
				 WHERE day >= date('now', ?1) AND kind != '404'${only}
				 GROUP BY os ORDER BY hits DESC LIMIT 12`
			),
			q(
				`SELECT browser, SUM(n) AS hits FROM hits_device
				 WHERE day >= date('now', ?1) AND kind != '404'${only}
				 GROUP BY browser ORDER BY hits DESC LIMIT 12`
			),
			// The paths people expected to exist, each asked for at least twice.
			// A single 404 is usually one person's typo; two or more is a link
			// worth creating.
			env.DB.prepare(
				`SELECT slug AS path, SUM(n) AS hits FROM hits
				 WHERE kind = '404' AND day >= date('now', ?1) AND device != 'bot' AND slug != '*'
				 GROUP BY path HAVING SUM(n) > 1 ORDER BY hits DESC LIMIT 10`
			).bind(offset),
			q(
				`SELECT
				   SUM(CASE WHEN kind = 'redirect' THEN n ELSE 0 END) AS clicks,
				   SUM(CASE WHEN kind IN ('home', 'paste') THEN n ELSE 0 END) AS views
				 FROM hits WHERE ${real}`
			),
			q(
				`SELECT COUNT(*) AS visitors FROM (
				   SELECT DISTINCT day, vh FROM visitors WHERE day >= date('now', ?1)${only}
				 )`
			)
		]);

	// §6 — `visitors` is the only table that grows, so prune it opportunistically
	// rather than running a scheduled job for it.
	if (Math.random() < 0.05) {
		platform?.context?.waitUntil?.(
			env.DB.prepare(`DELETE FROM visitors WHERE day < date('now','-180 day')`)
				.run()
				.catch(() => {})
		);
	}

	const totalRow = (totals.results as Array<{ clicks: number | null; views: number | null }>)[0];
	const uniqueRow = (uniques.results as Array<{ visitors: number }>)[0];

	return {
		...empty,
		traffic: fillDays(traffic.results as Array<{ day: string; hits: number }>, offset),
		top: top.results as Array<{ slug: string; kind: string; hits: number }>,
		referrers: referrers.results as Array<{ referrer: string; hits: number }>,
		countries: countries.results as Array<{ country: string; hits: number }>,
		devices: devices.results as Array<{ device: string; hits: number }>,
		os: os.results as Array<{ os: string; hits: number }>,
		browsers: browsers.results as Array<{ browser: string; hits: number }>,
		notFound: slug === null ? (notFound.results as Array<{ path: string; hits: number }>) : [],
		totals: {
			clicks: totalRow?.clicks ?? 0,
			views: totalRow?.views ?? 0,
			visitors: uniqueRow?.visitors ?? 0
		}
	};
};
