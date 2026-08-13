import type { PageServerLoad } from './$types';
import { RANGES, isRange, type RangeKey } from './ranges';

/**
 * Every query on this page runs in one `DB.batch()`. Five sequential awaits
 * would be five round trips to D1 for a page that renders once.
 */

export const load: PageServerLoad = async ({ platform, url }) => {
	const env = platform?.env;
	const requested = url.searchParams.get('r');
	const range: RangeKey = isRange(requested) ? requested : '30d';
	const slug = url.searchParams.get('s');

	if (!env) {
		return {
			range,
			slug,
			traffic: [],
			links: [],
			referrers: [],
			countries: [],
			devices: [],
			notFound: [],
			totals: { hits: 0, visitors: 0, home: 0 },
			detail: null
		};
	}

	const offset = RANGES[range];

	const [traffic, links, referrers, countries, devices, notFound, totals, uniques] =
		await env.DB.batch([
			env.DB.prepare(
				`SELECT day, SUM(n) AS hits FROM hits
				 WHERE day >= date('now', ?1) AND device != 'bot'
				 GROUP BY day ORDER BY day`
			).bind(offset),

			// LEFT JOIN against a pre-grouped set, not a correlated subquery:
			// the subquery form re-runs once per output row.
			env.DB.prepare(
				`WITH v AS (
				   SELECT slug, COUNT(*) AS visitors FROM visitors
				   WHERE day >= date('now', ?1) GROUP BY slug
				 )
				 SELECT h.slug, SUM(h.n) AS hits, COALESCE(v.visitors, 0) AS visitors
				 FROM hits h LEFT JOIN v ON v.slug = h.slug
				 WHERE h.day >= date('now', ?1) AND h.device != 'bot' AND h.kind = 'redirect'
				 GROUP BY h.slug ORDER BY hits DESC LIMIT 20`
			).bind(offset),

			env.DB.prepare(
				`SELECT referrer, SUM(n) AS hits FROM hits
				 WHERE day >= date('now', ?1) AND device != 'bot'
				 GROUP BY referrer ORDER BY hits DESC LIMIT 15`
			).bind(offset),

			env.DB.prepare(
				`SELECT country, SUM(n) AS hits FROM hits
				 WHERE day >= date('now', ?1) AND device != 'bot'
				 GROUP BY country ORDER BY hits DESC LIMIT 12`
			).bind(offset),

			env.DB.prepare(
				`SELECT device, SUM(n) AS hits FROM hits
				 WHERE day >= date('now', ?1)
				 GROUP BY device ORDER BY hits DESC`
			).bind(offset),

			// The query that earns its keep: paths people expected to exist.
			env.DB.prepare(
				`SELECT slug AS path, SUM(n) AS hits FROM hits
				 WHERE kind = '404' AND day >= date('now', ?1) AND device != 'bot'
				 GROUP BY path ORDER BY hits DESC LIMIT 20`
			).bind(offset),

			env.DB.prepare(
				`SELECT
				   SUM(CASE WHEN kind = 'redirect' THEN n ELSE 0 END) AS redirects,
				   SUM(CASE WHEN kind = 'home' THEN n ELSE 0 END) AS home
				 FROM hits WHERE day >= date('now', ?1) AND device != 'bot'`
			).bind(offset),

			env.DB.prepare(
				`SELECT COUNT(*) AS visitors FROM (
				   SELECT DISTINCT day, vh FROM visitors WHERE day >= date('now', ?1)
				 )`
			).bind(offset)
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

	const totalRow = (totals.results as Array<{ redirects: number | null; home: number | null }>)[0];
	const uniqueRow = (uniques.results as Array<{ visitors: number }>)[0];

	return {
		range,
		slug,
		traffic: traffic.results as Array<{ day: string; hits: number }>,
		links: links.results as Array<{ slug: string; hits: number; visitors: number }>,
		referrers: referrers.results as Array<{ referrer: string; hits: number }>,
		countries: countries.results as Array<{ country: string; hits: number }>,
		devices: devices.results as Array<{ device: string; hits: number }>,
		notFound: notFound.results as Array<{ path: string; hits: number }>,
		totals: {
			hits: totalRow?.redirects ?? 0,
			home: totalRow?.home ?? 0,
			visitors: uniqueRow?.visitors ?? 0
		},
		// Streamed: the shell and every panel above paint immediately while
		// this one resolves.
		detail: slug ? loadDetail(env, slug, offset) : null
	};
};

async function loadDetail(env: App.Platform['env'], slug: string, offset: string) {
	const [referrers, countries, devices] = await env.DB.batch([
		env.DB.prepare(
			`SELECT referrer, SUM(n) AS hits FROM hits
			 WHERE slug = ?1 AND day >= date('now', ?2) AND device != 'bot'
			 GROUP BY referrer ORDER BY hits DESC LIMIT 15`
		).bind(slug, offset),
		env.DB.prepare(
			`SELECT country, SUM(n) AS hits FROM hits
			 WHERE slug = ?1 AND day >= date('now', ?2) AND device != 'bot'
			 GROUP BY country ORDER BY hits DESC LIMIT 12`
		).bind(slug, offset),
		env.DB.prepare(
			`SELECT device, SUM(n) AS hits FROM hits
			 WHERE slug = ?1 AND day >= date('now', ?2)
			 GROUP BY device ORDER BY hits DESC`
		).bind(slug, offset)
	]);

	return {
		slug,
		referrers: referrers.results as Array<{ referrer: string; hits: number }>,
		countries: countries.results as Array<{ country: string; hits: number }>,
		devices: devices.results as Array<{ device: string; hits: number }>
	};
}
