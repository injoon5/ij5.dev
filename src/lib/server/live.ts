import type { Block, LiveDoc } from '$lib/types';
import { widgets, isKind } from '$lib/widgets/catalog';

/**
 * Live widgets (§7) without a cron job.
 *
 * There is no scheduler in this design, so refresh happens the same way the
 * bento HTML does — lazily, behind the response. The first visitor after a
 * TTL expires sees slightly stale data and triggers the refresh; everyone
 * after sees fresh. No visitor ever waits on a third-party API.
 *
 * All live data lives under a single `live` key. Per-widget keys would cost
 * one KV read per widget on every render. The price of sharing is
 * last-write-wins when two refreshes overlap, which at this scale means a
 * widget occasionally waits one more TTL.
 */

type Env = App.Platform['env'];

const KEY = 'live';

type Fetcher = (data: Record<string, unknown>, env: Env) => Promise<unknown>;

const fetchers: Record<string, Fetcher> = {
	async github(data, env) {
		const headers: Record<string, string> = {
			accept: 'application/vnd.github+json',
			// GitHub rejects requests without one.
			'user-agent': 'ij5.dev'
		};
		// Optional by design: a missing credential makes the widget render its
		// fallback, never an error.
		if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;

		const res = await fetch(`https://api.github.com/repos/${data.owner}/${data.repo}`, {
			headers
		});
		if (!res.ok) throw new Error(`github ${res.status}`);

		const json = (await res.json()) as {
			stargazers_count?: number;
			language?: string;
			description?: string;
		};
		return {
			stars: json.stargazers_count,
			language: json.language,
			description: json.description
		};
	}
};

export const readLive = (env: Env) => env.KV.get<LiveDoc>(KEY, { type: 'json', cacheTtl: 60 });

const isStale = (entry: LiveDoc[string] | undefined, ttl: number) =>
	!entry || entry.at < Date.now() - ttl;

/**
 * Returns the data to render now and, separately, the work to do afterwards.
 * The caller hands the promise to `waitUntil` so nothing blocks this render.
 */
export function planRefresh(blocks: Block[], live: LiveDoc | null, env: Env) {
	const stale = blocks.filter((b) => {
		if (!isKind(b.kind)) return false;
		const def = widgets[b.kind];
		return def.tier === 'live' && def.ttl !== undefined && isStale(live?.[b.id], def.ttl);
	});

	if (!stale.length) return null;

	return async () => {
		const current = (await readLive(env)) ?? {};
		const next: LiveDoc = { ...current };
		let changed = false;

		for (const block of stale) {
			const fetcher = fetchers[block.kind];
			if (!fetcher) continue;
			try {
				next[block.id] = { at: Date.now(), data: await fetcher(block.data, env) };
				changed = true;
			} catch {
				// Leave the previous entry in place. A stale value beats an
				// empty one, and the widget's declared fallback covers the case
				// where there has never been a value at all.
			}
		}

		// KV writes are the tightest free-tier limit (§10), so skip the write
		// entirely when every fetch failed.
		if (changed) await env.KV.put(KEY, JSON.stringify(next));
	};
}
