import { z } from 'zod';
import type { Span } from '$lib/types';
import type { Field } from './fields';

/**
 * The widget catalog (§7), sorted by what a widget *costs* — because that is
 * the real constraint. `/` ships zero framework JS and renders inside the CPU
 * budget, so the overwhelming majority of the page should be `static` kinds.
 *
 * This module holds no components, so server code (form actions, publish) can
 * import the schemas without pulling the renderer into its bundle.
 */

export type Tier = 'static' | 'live' | 'embed';

export type WidgetDef = {
	label: string;
	tier: Tier;
	/** Allowed spans. The editor derives its options from this, so an invalid
	 * combination is not expressible in the UI. */
	spans: Span[];
	schema: z.ZodType;
	fields: Field[];
	defaults: Record<string, unknown>;
	/** How long live data may go stale before the next render triggers a
	 * background refresh. Static and embed kinds have none. */
	ttl?: number;
	/** Kinds whose behaviour needs the 1KB inline script budget (§7). */
	needsScript?: boolean;
	/**
	 * Content-driven kinds grow past their span's ratio instead of clipping.
	 * The ratio lock exists to stop *images* shifting layout as they load;
	 * server-rendered rows are in the HTML already and never shift, so a
	 * six-row list is allowed to be taller than 4:1.
	 */
	flexible?: boolean;
	description: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const url = z.url();
const shortText = z.string().trim().min(1).max(120);
const optionalText = z.string().trim().max(240).optional().or(z.literal('')).transform((v) => v || undefined);

const listItem = z.object({
	label: z.string().trim().min(1).max(80),
	href: z.string().trim().max(500).optional(),
	meta: z.string().trim().max(40).optional()
});

export const SOCIAL_PLATFORMS = [
	{ value: 'github', label: 'GitHub' },
	{ value: 'x', label: 'X' },
	{ value: 'linkedin', label: 'LinkedIn' },
	{ value: 'instagram', label: 'Instagram' },
	{ value: 'youtube', label: 'YouTube' },
	{ value: 'mail', label: 'Email' },
	{ value: 'rss', label: 'RSS' },
	{ value: 'globe', label: 'Website' }
] as const;

export const widgets = {
	// ------------------------------------------------------------------ static
	link: {
		label: 'Link',
		tier: 'static',
		description: 'Favicon, title, host. A cover image turns it into a full-bleed card.',
		spans: ['1x1', '2x1'],
		schema: z.object({
			title: shortText,
			url,
			subtitle: optionalText,
			image: z.string().trim().optional()
		}),
		fields: [
			{ name: 'title', label: 'Title', type: 'text', placeholder: 'Read the piece' },
			{ name: 'url', label: 'Destination', type: 'url', placeholder: 'https://' },
			{
				name: 'subtitle',
				label: 'Subtitle',
				type: 'text',
				optional: true,
				hint: 'Defaults to the hostname.'
			},
			{
				name: 'image',
				label: 'Cover',
				type: 'asset',
				optional: true,
				hint: 'Fills the whole widget. Text moves onto a scrim.'
			}
		],
		defaults: { title: '', url: '' }
	},

	cta: {
		label: 'Call to action',
		tier: 'static',
		description: 'The prominent one. Filled surface, one action, no competition.',
		spans: ['2x1', 'full'],
		schema: z.object({
			label: shortText,
			url,
			description: optionalText
		}),
		fields: [
			{ name: 'label', label: 'Label', type: 'text', placeholder: 'Work with me' },
			{ name: 'url', label: 'Destination', type: 'url', placeholder: 'https://' },
			{ name: 'description', label: 'Supporting line', type: 'text', optional: true }
		],
		defaults: { label: '', url: '' }
	},

	text: {
		label: 'Text',
		tier: 'static',
		description: 'A short note. Never a paragraph in a 1x1.',
		flexible: true,
		spans: ['1x1', '2x1', '2x2'],
		schema: z.object({
			title: optionalText,
			body: z.string().trim().min(1).max(600)
		}),
		fields: [
			{ name: 'title', label: 'Title', type: 'text', optional: true },
			{ name: 'body', label: 'Body', type: 'textarea', placeholder: 'A sentence or two.' }
		],
		defaults: { body: '' }
	},

	heading: {
		label: 'Section heading',
		tier: 'static',
		description: 'Breaks the grid into labelled sections. Type only — no card, no border.',
		spans: ['full'],
		schema: z.object({
			text: shortText,
			note: optionalText
		}),
		fields: [
			{ name: 'text', label: 'Heading', type: 'text', placeholder: 'Writing' },
			{ name: 'note', label: 'Note', type: 'text', optional: true }
		],
		defaults: { text: '' }
	},

	image: {
		label: 'Image',
		tier: 'static',
		description: 'Full-bleed, edge to edge. Caption sits on a scrim, never in a bar below.',
		spans: ['1x1', '2x1', '2x2', 'full'],
		schema: z.object({
			src: z.string().trim().min(1),
			alt: z.string().trim().max(200),
			caption: optionalText,
			href: z.string().trim().optional()
		}),
		fields: [
			{ name: 'src', label: 'Image', type: 'asset' },
			{
				name: 'alt',
				label: 'Alt text',
				type: 'text',
				hint: 'What someone would miss if the image never loaded.'
			},
			{ name: 'caption', label: 'Caption', type: 'text', optional: true },
			{ name: 'href', label: 'Links to', type: 'url', optional: true }
		],
		defaults: { src: '', alt: '' }
	},

	social: {
		label: 'Social',
		tier: 'static',
		description: 'Platform mark, handle, follow action.',
		spans: ['1x1'],
		schema: z.object({
			platform: z.enum(SOCIAL_PLATFORMS.map((p) => p.value) as [string, ...string[]]),
			handle: shortText,
			url,
			count: optionalText
		}),
		fields: [
			{
				name: 'platform',
				label: 'Platform',
				type: 'select',
				options: SOCIAL_PLATFORMS.map((p) => ({ ...p }))
			},
			{ name: 'handle', label: 'Handle', type: 'text', placeholder: '@you' },
			{ name: 'url', label: 'Profile', type: 'url', placeholder: 'https://' },
			{ name: 'count', label: 'Count', type: 'text', optional: true, hint: 'Static. Live counts belong to a live widget.' }
		],
		defaults: { platform: 'github', handle: '', url: '' }
	},

	stat: {
		label: 'Stat',
		tier: 'static',
		description: 'One number, one label. Tabular figures.',
		spans: ['1x1'],
		schema: z.object({
			value: z.string().trim().min(1).max(12),
			label: shortText,
			note: optionalText
		}),
		fields: [
			{ name: 'value', label: 'Value', type: 'text', placeholder: '12' },
			{ name: 'label', label: 'Label', type: 'text', placeholder: 'Shipped this year' },
			{ name: 'note', label: 'Note', type: 'text', optional: true }
		],
		defaults: { value: '', label: '' }
	},

	quote: {
		label: 'Quote',
		tier: 'static',
		description: 'Pull quote with attribution.',
		flexible: true,
		spans: ['2x1', '2x2'],
		schema: z.object({
			quote: z.string().trim().min(1).max(400),
			author: shortText,
			role: optionalText
		}),
		fields: [
			{ name: 'quote', label: 'Quote', type: 'textarea' },
			{ name: 'author', label: 'Author', type: 'text' },
			{ name: 'role', label: 'Role', type: 'text', optional: true }
		],
		defaults: { quote: '', author: '' }
	},

	list: {
		label: 'List',
		tier: 'static',
		description: 'Three to six compact rows. Denser than the same links as separate blocks.',
		flexible: true,
		spans: ['2x2', 'full'],
		schema: z.object({
			title: optionalText,
			items: z.array(listItem).min(1).max(8)
		}),
		fields: [
			{ name: 'title', label: 'Title', type: 'text', optional: true },
			{
				name: 'items',
				label: 'Rows',
				type: 'lines',
				keys: ['label', 'href', 'meta'],
				placeholder: 'Label | https://example.com | 2024',
				hint: 'One row per line: label, destination, trailing note.'
			}
		],
		defaults: { items: [] }
	},

	stack: {
		label: 'Stack',
		tier: 'static',
		description: 'Tools and technologies as a compact row.',
		flexible: true,
		spans: ['2x1', 'full'],
		schema: z.object({
			title: optionalText,
			items: z.array(listItem).min(1).max(16)
		}),
		fields: [
			{ name: 'title', label: 'Title', type: 'text', optional: true },
			{
				name: 'items',
				label: 'Items',
				type: 'lines',
				keys: ['label'],
				placeholder: 'TypeScript',
				hint: 'One per line.'
			}
		],
		defaults: { items: [] }
	},

	timeline: {
		label: 'Timeline',
		tier: 'static',
		description: 'Roles or milestones, dated rows.',
		flexible: true,
		spans: ['2x2', 'full'],
		schema: z.object({
			title: optionalText,
			items: z.array(listItem).min(1).max(8)
		}),
		fields: [
			{ name: 'title', label: 'Title', type: 'text', optional: true },
			{
				name: 'items',
				label: 'Entries',
				type: 'lines',
				keys: ['label', 'href', 'meta'],
				placeholder: 'Staff engineer, Acme | https://acme.com | 2022–now',
				hint: 'One entry per line: what, link, when.'
			}
		],
		defaults: { items: [] }
	},

	contact: {
		label: 'Contact',
		tier: 'static',
		description: 'A mailto link that can also copy the address.',
		spans: ['1x1', '2x1'],
		schema: z.object({
			email: z.email(),
			label: optionalText
		}),
		fields: [
			{ name: 'email', label: 'Email', type: 'text', placeholder: 'you@ij5.dev' },
			{ name: 'label', label: 'Label', type: 'text', optional: true }
		],
		defaults: { email: '' },
		needsScript: true
	},

	map: {
		label: 'Map',
		tier: 'static',
		description: 'A static map image with a capsule label. Never an interactive map.',
		spans: ['1x1', '2x1'],
		schema: z.object({
			src: z.string().trim().min(1),
			label: shortText,
			alt: z.string().trim().max(200).optional()
		}),
		fields: [
			{ name: 'src', label: 'Map image', type: 'asset', hint: 'Export a static tile. An embed would cost hundreds of KB.' },
			{ name: 'label', label: 'Place', type: 'text', placeholder: 'Seoul' },
			{ name: 'alt', label: 'Alt text', type: 'text', optional: true }
		],
		defaults: { src: '', label: '' }
	},

	spacer: {
		label: 'Spacer',
		tier: 'static',
		description: 'Deliberate emptiness. Yes, this is a real widget.',
		spans: ['1x1', '2x1', '2x2', 'full'],
		schema: z.object({}),
		fields: [],
		defaults: {}
	},

	// -------------------------------------------------------------------- live
	clock: {
		label: 'Clock',
		tier: 'static',
		description: 'Renders the offset, not the time. A ticking clock needs JS and goes wrong in caches.',
		spans: ['1x1'],
		schema: z.object({
			place: shortText,
			offset: z.string().trim().min(1).max(12)
		}),
		fields: [
			{ name: 'place', label: 'Place', type: 'text', placeholder: 'Seoul' },
			{ name: 'offset', label: 'Offset', type: 'text', placeholder: 'UTC+9' }
		],
		defaults: { place: '', offset: '' }
	},

	github: {
		label: 'GitHub',
		tier: 'live',
		description: 'Stars and language for one repo. Refreshed behind the response, never in front of it.',
		spans: ['1x1', '2x1'],
		ttl: 6 * HOUR,
		schema: z.object({
			owner: z.string().trim().min(1).max(60),
			repo: z.string().trim().min(1).max(100),
			fallbackValue: z.string().trim().max(20).optional(),
			fallbackLabel: z.string().trim().max(60).optional()
		}),
		fields: [
			{ name: 'owner', label: 'Owner', type: 'text', placeholder: 'sveltejs' },
			{ name: 'repo', label: 'Repository', type: 'text', placeholder: 'kit' },
			{
				name: 'fallbackValue',
				label: 'Fallback value',
				type: 'text',
				optional: true,
				hint: 'Shown if the API is down or the token expired. A live widget never breaks the page.'
			},
			{ name: 'fallbackLabel', label: 'Fallback label', type: 'text', optional: true }
		],
		defaults: { owner: '', repo: '' }
	},

	grass: {
		label: 'GitHub activity',
		tier: 'live',
		description:
			'The contribution graph, drawn as grid cells in the page accent. 13 weeks at 1x1, 26 at 2x2.',
		spans: ['1x1', '2x2'],
		// Seven rows of square cells: the graph's height follows from the card's
		// width, not from the span. Held to the two rows a `2x2` reserves it sat
		// in the bottom fifth of a very tall card.
		flexible: true,
		// Contributions land at most once a day and nobody watches this widget
		// for news, so the cheapest TTL that still looks current wins: four
		// refreshes a day against a 1000/day KV write budget (§10).
		ttl: 6 * HOUR,
		schema: z.object({
			user: z.string().trim().min(1).max(39),
			fallbackValue: z.string().trim().max(20).optional(),
			fallbackLabel: z.string().trim().max(60).optional()
		}),
		fields: [
			{ name: 'user', label: 'Username', type: 'text', placeholder: 'injoon5' },
			{
				name: 'fallbackValue',
				label: 'Fallback total',
				type: 'text',
				optional: true,
				hint: 'The calendar needs GITHUB_TOKEN. Without one the widget stays off and draws an empty graph — no request is made and nothing errors.'
			},
			{ name: 'fallbackLabel', label: 'Fallback label', type: 'text', optional: true }
		],
		defaults: { user: '' }
	},

	weather: {
		label: 'Weather',
		tier: 'live',
		description: 'Current conditions from Open-Meteo. No API key — this one is always on.',
		spans: ['1x1'],
		ttl: 30 * MINUTE,
		schema: z.object({
			place: shortText,
			lat: z.coerce.number().min(-90).max(90),
			lon: z.coerce.number().min(-180).max(180),
			fallbackValue: z.string().trim().max(12).optional(),
			fallbackLabel: z.string().trim().max(40).optional()
		}),
		fields: [
			{ name: 'place', label: 'Place', type: 'text', placeholder: 'Seoul' },
			{ name: 'lat', label: 'Latitude', type: 'number', placeholder: '37.5665' },
			{ name: 'lon', label: 'Longitude', type: 'number', placeholder: '126.978' },
			{ name: 'fallbackValue', label: 'Fallback reading', type: 'text', optional: true },
			{ name: 'fallbackLabel', label: 'Fallback condition', type: 'text', optional: true }
		],
		defaults: { place: '', lat: 0, lon: 0 }
	},

	post: {
		label: 'Latest post',
		tier: 'live',
		description: 'Newest entry from an RSS or Atom feed. A feed is a public URL, so no key.',
		spans: ['1x1', '2x1'],
		flexible: true,
		ttl: HOUR,
		schema: z.object({
			feed: z.url(),
			url: z.string().trim().optional(),
			label: z.string().trim().max(40).optional(),
			fallbackTitle: z.string().trim().max(120).optional()
		}),
		fields: [
			{ name: 'feed', label: 'Feed URL', type: 'url', placeholder: 'https://example.com/rss.xml' },
			{ name: 'url', label: 'Fallback link', type: 'url', optional: true },
			{ name: 'label', label: 'Label', type: 'text', optional: true, hint: 'Defaults to "Latest post".' },
			{ name: 'fallbackTitle', label: 'Fallback title', type: 'text', optional: true }
		],
		defaults: { feed: '' }
	},

	// ------------------------------------------------------------------- embed
	video: {
		label: 'Video',
		tier: 'embed',
		description: 'A poster and a play glyph. The iframe is injected only on click.',
		spans: ['2x2', 'full'],
		schema: z.object({
			url,
			poster: z.string().trim().min(1),
			title: shortText
		}),
		fields: [
			{ name: 'url', label: 'Video URL', type: 'url', placeholder: 'https://www.youtube.com/watch?v=' },
			{ name: 'poster', label: 'Poster', type: 'asset' },
			{ name: 'title', label: 'Title', type: 'text' }
		],
		defaults: { url: '', poster: '', title: '' },
		needsScript: true
	}
} satisfies Record<string, WidgetDef>;

export type WidgetKind = keyof typeof widgets;

export const KINDS = Object.keys(widgets) as WidgetKind[];

export const isKind = (k: string): k is WidgetKind => k in widgets;

/**
 * `satisfies` keeps the literal key types — which is what makes `WidgetKind` a
 * union of names rather than `string` — at the cost of also keeping each
 * entry's literal shape. These two accessors widen back to the declared type,
 * so consumers see `Field[]` and a full `WidgetDef` instead of a union of
 * forty object literals.
 */
export const defFor = (kind: WidgetKind): WidgetDef => widgets[kind];

export const fieldsFor = (kind: WidgetKind): Field[] => widgets[kind].fields;

/**
 * Kinds that render an R2 image, and so want `/w.js`'s error handler: a
 * missing object collapses to the widget surface instead of a broken-image
 * glyph. Separate from `needsScript`, which marks a kind whose *behaviour*
 * needs the script — a `link` with a cover image needs the handler but has no
 * behaviour of its own.
 */
const IMAGE_KINDS = new Set<WidgetKind>(['image', 'map', 'link', 'video']);

/**
 * Whether a page containing this block has to load `/w.js` at all. Kept beside
 * the registry rather than in the page load, so adding a kind that needs
 * behaviour cannot quietly ship a page whose widget does nothing.
 */
export function needsScriptFor(kind: string): boolean {
	if (!isKind(kind)) return false;
	return Boolean(defFor(kind).needsScript) || IMAGE_KINDS.has(kind);
}

/**
 * Whether any block on the page is a live widget — one that refreshes behind
 * the response and rewrites the shared `live` KV without bumping the document
 * version (§7). The `/` hook uses this to keep such a page out of the
 * version-keyed HTML cache, which is built on a version change being the only
 * thing that can make the rendered HTML stale — true for static content, false
 * the moment live data can change underneath a fixed version.
 */
export function hasLiveBlock(blocks: Array<{ kind: string }>): boolean {
	return blocks.some((b) => isKind(b.kind) && defFor(b.kind).tier === 'live');
}

/**
 * One discriminated union over every kind, derived from the registry rather
 * than maintained beside it. A malformed block cannot be saved, so the
 * renderer never has to defend against bad data.
 */
export const blockSchema = z.discriminatedUnion(
	'kind',
	KINDS.map((kind) =>
		z.object({
			id: z.string().min(1).max(40),
			ord: z.number().int().min(0),
			kind: z.literal(kind),
			span: z.enum(widgets[kind].spans as [Span, ...Span[]]),
			data: widgets[kind].schema
		})
	) as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]]
);

export const profileSchema = z.object({
	name: z.string().trim().min(1).max(80),
	bio: z.string().trim().max(1200).nullable(),
	tagline: z.string().trim().max(160).nullable(),
	avatar: z.string().trim().nullable(),
	links: z
		.array(
			z.object({
				label: z.string().trim().min(1).max(40),
				href: z.string().trim().min(1).max(500),
				icon: z.string().trim().min(1).max(40)
			})
		)
		.max(8)
});
