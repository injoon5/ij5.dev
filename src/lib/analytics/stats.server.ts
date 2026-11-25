import { RANGES } from './ranges';
import type { Kind } from './track.server';

type Env = App.Platform['env'];

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
