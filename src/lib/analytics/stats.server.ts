import { RANGES, fillDays, type RangeKey } from './ranges';
import { OTHER_PATH, type Kind } from './visit';

type Env = App.Platform['env'];

/**
 * Every number for the analytics page, in one `DB.batch()` — one round trip
 * to D1, not ten. `slug` narrows everything to one path (the homepage is
 * `HOME_SLUG`). Every number excludes bots and 404s, so any two can be
 * compared; the 404 list is the one deliberate exception.
 */
export async function dashboard(env: Env, range: RangeKey, slug: string | null) {
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
				 WHERE kind = '404' AND day >= date('now', ?1) AND device != 'bot' AND slug != '${OTHER_PATH}'
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

	const totalRow = (totals.results as Array<{ clicks: number | null; views: number | null }>)[0];
	const uniqueRow = (uniques.results as Array<{ visitors: number }>)[0];

	return {
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
}

/** `visitors` grows by a row per visitor per path per day, so unlike the aggregates it is pruned — now and then instead of on a schedule. */
export const pruneVisitors = (env: Env) =>
	env.DB.prepare(`DELETE FROM visitors WHERE day < date('now','-180 day')`).run();

/** Human hits per slug over the last 7 days, for the admin lists. */
export async function recentHits(env: Env, kind: Kind): Promise<Record<string, number>> {
	const { results } = await env.DB.prepare(
		`SELECT slug, SUM(n) AS hits FROM hits
		 WHERE kind = ?1 AND device != 'bot' AND day >= date('now', ?2)
		 GROUP BY slug`
	)
		.bind(kind, RANGES['7d'])
		.all<{ slug: string; hits: number }>();
	return Object.fromEntries(results.map((r: { slug: string; hits: number }) => [r.slug, r.hits]));
}
