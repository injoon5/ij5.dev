import { ImageResponse } from '@ethercorps/sveltekit-og';
import { GoogleFont, resolveFonts } from '@ethercorps/sveltekit-og/fonts';
import type { RequestHandler } from '@sveltejs/kit';
import HomeCard from '$lib/components/og/home.svelte';
import { loadFromD1, readPublished } from '$lib/server/home';
import type { Profile } from '$lib/types';

/**
 * The Open Graph image for `/`, rendered on demand from the published profile
 * so the card always matches the masthead. Like the homepage hook it is
 * version-keyed — `og/v${v}` in the edge cache — and the page references it as
 * `/og.png?v=${v}`, which is what busts Twitter and Facebook's own image caches
 * on publish. Everything here is importable, so the card is one generation per
 * version per colo, never one per crawler.
 */

const DEV = import.meta.env.DEV;

const ogCacheKey = (v: number) => new Request(`https://cache.internal/og/v${v}`);

/** Module-level so the instances' internal font cache survives across requests. */
const fonts = [
	new GoogleFont('Inter', { weight: 400 }),
	new GoogleFont('Inter', { weight: 500 }),
	new GoogleFont('Inter', { weight: 700 }),
	new GoogleFont('Geist Mono', { weight: 400 })
];

const FALLBACK: Profile = {
	name: 'ij5',
	bio: null,
	tagline: null,
	avatar: null,
	links: [],
	content: null
};

export const GET: RequestHandler = async ({ platform, url }) => {
	const env = platform?.env;
	const cache = platform?.caches?.default;

	let profile: Profile = FALLBACK;
	let v = 0;
	if (env) {
		try {
			// Published profile when there is one, the D1 source of truth
			// otherwise — the same order the page load itself uses.
			const published = await readPublished(env);
			if (published) {
				profile = published.profile;
				v = published.v;
			} else {
				const { profile: fromD1 } = await loadFromD1(env);
				profile = fromD1;
			}
		} catch {
			// Storage down: a card with the last known profile is better than
			// a broken card. The version is 0, so nothing shares an edge entry.
		}
	}

	const key = ogCacheKey(v);
	if (!DEV && cache) {
		const cached = await cache.match(key);
		if (cached) {
			// An entry out of the edge cache carries immutable headers, which
			// the hook's `harden()` would choke on — rebuild into a fresh,
			// mutable response with the same browser-facing headers a fresh
			// render would have (the move the homepage hook makes).
			return new Response(cached.body, {
				status: 200,
				headers: {
					'Content-Type': 'image/png',
					ETag: `"og-v${v}"`,
					'Cache-Control': 'public, max-age=0, must-revalidate'
				}
			});
		}
	}

	const domain = new URL(env?.PUBLIC_ORIGIN || url.origin).hostname;
	const tagline = profile.tagline ?? `${profile.name} — writing, links and work.`;
	const links = linkLabels(profile.links);

	let res: Response;
	try {
		// Buffered before returning so a generation failure is a real 500, not
		// a 200 whose body errors mid-stream — a broken card must never look
		// like a healthy one to a crawler.
		const image = new ImageResponse(
			HomeCard,
			{
				width: 1200,
				height: 630,
				fonts: await resolveFonts(fonts)
			},
			{ name: profile.name, tagline, links, domain }
		);
		res = new Response(await image.arrayBuffer(), {
			status: 200,
			headers: {
				'Content-Type': 'image/png',
				ETag: `"og-v${v}"`,
				// The version-keyed URL busts platform caches on publish; the
				// browser and CDN revalidate so the raw `/og.png` can never go
				// stale behind a TTL.
				'Cache-Control': 'public, max-age=0, must-revalidate'
			}
		});
	} catch (err) {
		console.error('og.png generation failed:', rootCause(err)?.message ?? err);
		return new Response('Failed to generate the Open Graph image', { status: 500 });
	}

	if (!DEV && cache) {
		const store = res.clone();
		store.headers.set('Cache-Control', 'public, s-maxage=31536000');
		platform?.context?.waitUntil?.(cache.put(key, store));
	}

	return res;
};

/** The library wraps every failure a level deep; log the message that matters. */
function rootCause(err: unknown): { message?: string } | null {
	let e: unknown = err;
	while (e && (e as { originalError?: unknown }).originalError) {
		e = (e as { originalError?: unknown }).originalError;
	}
	return (e as { message?: string } | null) ?? null;
}

/** A row of labels stays a row: four fit comfortably, anything after that
 *  collapses into "+N" rather than wrapping or truncating mid-label. */
function linkLabels(links: Profile['links']): string[] {
	const labels = links.map((l) => l.label);
	if (labels.length <= 4) return labels;
	return [...labels.slice(0, 3), `+${labels.length - 3}`];
}
