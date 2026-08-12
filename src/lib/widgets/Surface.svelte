<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Span } from '$lib/types';

	type Props = {
		span: Span;
		href?: string;
		/**
		 * Makes the whole widget the target while keeping the root a `div`, so
		 * the widget can also hold its own interactive controls. A `<button>`
		 * inside an `<a>` is invalid HTML and behaves differently across
		 * browsers; a stretched overlay link does not.
		 */
		stretchedHref?: string;
		/** Full-bleed imagery: no padding, text over a scrim. */
		bleed?: boolean;
		/** Content-driven widgets grow instead of clipping. */
		flexible?: boolean;
		label?: string;
		class?: string;
		children: Snippet;
	};

	let {
		span,
		href,
		stretchedHref,
		bleed = false,
		flexible = false,
		label,
		class: extra = '',
		children
	}: Props = $props();

	/**
	 * §7.11 wants a fixed ratio per span so nothing reflows as images load, and
	 * the grid already delivers exactly that: its row unit is one column width,
	 * derived from the container's inline size, so a `1x1` in one row is square
	 * by construction and a `2x2` across two rows is square at twice the size.
	 *
	 * Restating it as `aspect-ratio` on the widget actively broke it. A grid
	 * item with an aspect ratio takes its height from its own width rather than
	 * from its row, so a `2x1` — two columns plus the gap — measured 228px
	 * against a 221px row unit, grew the row to fit, and left every `1x1`
	 * beside it sitting 7px short of the cell it was meant to fill. Invisible
	 * on its own; a visible step along a row.
	 *
	 * So no ratio here. Height comes from the row, which is what makes every
	 * widget in a row exactly as tall as its neighbours.
	 */

	/**
	 * Content-driven widgets get a floor, not a target. Sizing them to their
	 * span's ratio leaves a six-line list sitting in a half-empty card, and
	 * dead space inside a widget is the fastest way for a grid to stop reading
	 * as one system. Rows stretch to their tallest item anyway, so neighbours
	 * still line up.
	 */
	const MIN: Record<Span, string> = {
		'1x1': 'min-h-[8rem]',
		'2x1': 'min-h-[8rem]',
		'2x2': 'min-h-[11rem]',
		full: 'min-h-[7rem]'
	};

	let sizing = $derived(flexible ? MIN[span] : 'h-full');
</script>

{#if href}
	<a
		class="widget {sizing} {bleed ? 'widget-bleed' : ''} {extra}"
		data-span={span}
		{href}
		aria-label={label}
	>
		{@render children()}
	</a>
{:else if stretchedHref}
	<div
		class="widget {sizing} {bleed ? 'widget-bleed' : ''} {extra}"
		data-span={span}
		data-pressable
	>
		<a href={stretchedHref} class="absolute inset-0 z-1" aria-label={label}></a>
		{@render children()}
	</div>
{:else}
	<div class="widget {sizing} {bleed ? 'widget-bleed' : ''} {extra}" data-span={span}>
		{@render children()}
	</div>
{/if}
