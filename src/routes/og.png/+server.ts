import { ImageResponse } from '@ethercorps/sveltekit-og';
import { GoogleFont, resolveFonts } from '@ethercorps/sveltekit-og/fonts';
import type { RequestHandler } from '@sveltejs/kit';
import HomeCard from '$lib/home/OgCard.svelte';
import { currentHome } from '$lib/home/home.server';
import type { Profile } from '$lib/home/types';
import { bindings, afterResponse } from '$lib/server/bindings';

/**
 * Rendered on demand from the published profile so the card always matches the
 * masthead. Like the homepage it is version-keyed in the edge cache, so the
 * card is one generation per version per colo, never one per crawler.
 */

const DEV = import.meta.env.DEV;

// The build is part of the key, like the homepage's: a deploy that changes the
// card must not keep serving the old one until the next publish.
const ogCacheKey = (v: number) => new Request(`https://cache.internal/og/v${v}/b${import.meta.env.VITE_BUILD_ID}`);

/** The browser and CDN revalidate, so the bare `/og.png` never goes stale. */
const png = (body: BodyInit | null, v: number) =>
	new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'image/png', ETag: `"og-v${v}"`, 'Cache-Control': 'public, max-age=0, must-revalidate' }
	});

/** Module-level so the instances' internal font cache survives across requests. */
const fonts = [
	new GoogleFont('Inter', { weight: 400 }),
	new GoogleFont('Inter', { weight: 500 }),
	new GoogleFont('Inter', { weight: 700 }),
	new GoogleFont('Geist Mono', { weight: 400 })
];

export const GET: RequestHandler = async ({ platform, url }) => {
	const env = bindings(platform);
	const cache = platform?.caches?.default;

	const { profile, v } = await currentHome(env);

	const key = ogCacheKey(v);
	if (!DEV && cache) {
		const cached = await cache.match(key);
		if (cached) {
			// A cached response's headers are immutable; serve its body afresh.
			return png(cached.body, v);
		}
	}

	const domain = new URL(env.PUBLIC_ORIGIN || url.origin).hostname;
	// No invented fallback: "Name — writing, links and work." under the name
	// it repeats is the card saying the same thing twice.
	const tagline = profile.tagline;
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
		res = png(await image.arrayBuffer(), v);
	} catch (err) {
		console.error('og.png generation failed:', rootCause(err)?.message ?? err);
		return new Response('Failed to generate the Open Graph image', { status: 500 });
	}

	if (!DEV && cache) {
		const store = res.clone();
		store.headers.set('Cache-Control', 'public, s-maxage=31536000');
		afterResponse(platform, cache.put(key, store));
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
