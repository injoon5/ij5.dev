import type { LiveDoc, LiveRequest } from '$lib/types';

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

/**
 * Refresh cadence per kind. Kept here beside the fetchers rather than in a
 * widget catalog, so the live path stands on its own.
 */
const TTL: Record<string, number> = {
	grass: 6 * HOUR
};

type Fetcher = {
	run: (data: Record<string, unknown>, env: Env) => Promise<unknown>;
	/**
	 * Whether this deployment can run the fetcher at all.
	 *
	 * A widget whose credential is absent is *disabled*, not broken: nothing is
	 * scheduled, no request goes out, and the widget renders the fallback it
	 * declares. Asking up front rather than throwing inside `run` is what keeps
	 * a missing optional secret from costing a doomed attempt on every render —
	 * and it is why the whole site runs with no third-party credentials at all.
	 */
	available?: (env: Env) => boolean;
};

const LEVELS: Record<string, number> = {
	NONE: 0,
	FIRST_QUARTILE: 1,
	SECOND_QUARTILE: 2,
	THIRD_QUARTILE: 3,
	FOURTH_QUARTILE: 4
};

const fetchers: Record<string, Fetcher> = {
	grass: {
		/**
		 * The contribution calendar is GraphQL-only, and GitHub's GraphQL API
		 * refuses anonymous requests outright — there is no unauthenticated
		 * version of this data to fall back to. So with no token the widget is
		 * simply off: nothing is scheduled, nothing is fetched, and the card
		 * renders its own empty lattice, which reads as a quiet quarter rather
		 * than a broken widget.
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

/** Whether this deployment is configured to run a given live kind. */
export function isLiveAvailable(kind: string, env: Env): boolean {
	const fetcher = fetchers[kind];
	if (!fetcher) return false;
	return fetcher.available ? fetcher.available(env) : true;
}

export const readLive = (env: Env) => env.KV.get<LiveDoc>(KEY, { type: 'json', cacheTtl: 60 });

const isStale = (entry: LiveDoc[string] | undefined, ttl: number) =>
	!entry || entry.at < Date.now() - ttl;

/**
 * Returns the work to do after this render, or null if there is none. The
 * caller hands the promise to `waitUntil` so nothing blocks the response.
 */
export function planRefresh(requests: LiveRequest[], live: LiveDoc | null, env: Env) {
	const stale = requests.filter((r) => {
		const ttl = TTL[r.kind];
		if (ttl === undefined || !fetchers[r.kind]) return false;
		// A source this deployment cannot fetch for is never scheduled, so a
		// site with no third-party tokens does no background work at all.
		if (!isLiveAvailable(r.kind, env)) return false;
		return isStale(live?.[r.id], ttl);
	});

	if (!stale.length) return null;

	return async () => {
		const current = (await readLive(env)) ?? {};
		const next: LiveDoc = { ...current };
		let changed = false;

		for (const req of stale) {
			const fetcher = fetchers[req.kind];
			if (!fetcher) continue;
			try {
				next[req.id] = { at: Date.now(), data: await fetcher.run(req.data, env) };
				changed = true;
			} catch {
				// Leave the previous entry in place. A stale value beats an empty
				// one, and the shortcode's own fallback covers the case where
				// there has never been a value at all.
			}
		}

		// KV writes are the tightest free-tier limit (§10), so skip the write
		// entirely when every fetch failed.
		if (changed) await env.KV.put(KEY, JSON.stringify(next));
	};
}
