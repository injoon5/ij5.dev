import { GRASS, type LiveDoc, type LiveRequest } from '$lib/home/types';

/**
 * Live shortcodes without a cron job.
 *
 * There is no scheduler in this design, so refresh happens the same way the
 * HTML does — lazily, behind the response. The first visitor after a TTL
 * expires sees slightly stale data and triggers the refresh; everyone after
 * sees fresh. No visitor ever waits on a third-party API.
 *
 * All live data lives under a single `live` key. Per-source keys would cost one
 * KV read each on every render. The price of sharing is last-write-wins when
 * two refreshes overlap, which at this scale means a source occasionally waits
 * one more TTL.
 */

type Env = App.Platform['env'];

const KEY = 'live';
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

type Fetcher = {
	ttl: number;
	run: (data: Record<string, unknown>, env: Env) => Promise<unknown>;
	/**
	 * A widget whose credential is absent is disabled, not broken: nothing is
	 * scheduled and it renders its own fallback. Asking up front rather than
	 * throwing inside `run` keeps a missing optional secret from costing a
	 * doomed attempt on every render, so the site runs with no third-party
	 * credentials at all.
	 */
	available: (env: Env) => boolean;
};

const LEVELS: Record<string, number> = {
	NONE: 0,
	FIRST_QUARTILE: 1,
	SECOND_QUARTILE: 2,
	THIRD_QUARTILE: 3,
	FOURTH_QUARTILE: 4
};

const fetchers: Record<string, Fetcher> = {
	[GRASS]: {
		ttl: 6 * HOUR,
		/**
		 * The contribution calendar is GraphQL-only, and GitHub's GraphQL API
		 * refuses anonymous requests outright, so with no token the widget is off.
		 */
		available: (env) => Boolean(env.GITHUB_TOKEN),

		async run(data, env) {
			const query = `query($login:String!){
				user(login:$login){
					contributionsCollection{
						contributionCalendar{
							totalContributions
							weeks{ contributionDays{ date contributionCount contributionLevel } }
						}
					}
				}
			}`;

			const res = await fetch('https://api.github.com/graphql', {
				method: 'POST',
				headers: {
					authorization: `Bearer ${env.GITHUB_TOKEN}`,
					'content-type': 'application/json',
					'user-agent': 'ij5.dev'
				},
				body: JSON.stringify({ query, variables: { login: String(data.user ?? '') } })
			});
			if (!res.ok) throw new Error(`grass ${res.status}`);

			const json = (await res.json()) as {
				errors?: unknown[];
				data?: {
					user?: {
						contributionsCollection?: {
							contributionCalendar?: {
								totalContributions?: number;
								weeks?: Array<{
									contributionDays: Array<{
										date: string;
										contributionCount: number;
										contributionLevel: string;
									}>;
								}>;
							};
						};
					};
				};
			};

			// GraphQL answers 200 with an `errors` array, so a bad login or a
			// token missing `read:user` would otherwise store an empty calendar
			// as if it were real and suppress the fallback for a whole TTL.
			if (json.errors?.length) throw new Error('grass query rejected');

			const calendar = json.data?.user?.contributionsCollection?.contributionCalendar;
			const weeks = calendar?.weeks;
			if (!weeks?.length) throw new Error('grass returned no calendar');

			return {
				total: calendar?.totalContributions,
				// One flat array, reduced to the three fields the widget draws. A
				// year of days at full fidelity is a needlessly large KV value for
				// a graph that only needs a level per cell.
				days: weeks.flatMap((week) =>
					week.contributionDays.map((day) => ({
						d: day.date,
						c: day.contributionCount,
						l: LEVELS[day.contributionLevel] ?? 0
					}))
				)
			};
		}
	}
};

export const readLive = (env: Env) => env.KV.get<LiveDoc>(KEY, { type: 'json', cacheTtl: 60 });

const isStale = (entry: LiveDoc[string] | undefined, ttl: number) =>
	!entry || entry.at < Date.now() - ttl;

export function planRefresh(requests: LiveRequest[], live: LiveDoc | null, env: Env) {
	const stale = requests.filter((r) => {
		const fetcher = fetchers[r.kind];
		return fetcher?.available(env) && isStale(live?.[r.id], fetcher.ttl);
	});

	if (!stale.length) return null;

	return async () => {
		const current = (await readLive(env)) ?? {};
		const next: LiveDoc = { ...current };
		let changed = false;

		for (const req of stale) {
			try {
				next[req.id] = { at: Date.now(), data: await fetchers[req.kind].run(req.data, env) };
				changed = true;
			} catch {
				// Leave the previous entry in place. A stale value beats an empty
				// one, and the shortcode's own fallback covers the case where
				// there has never been a value at all.
			}
		}

		// KV writes are the tightest free-tier limit, so skip the write
		// entirely when every fetch failed.
		if (changed) await env.KV.put(KEY, JSON.stringify(next));
	};
}
