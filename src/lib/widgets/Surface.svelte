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

	// §7.11 — one ratio per span, so the grid never reflows as images load.
	const RATIO: Record<Span, string> = {
		'1x1': 'aspect-square',
		'2x1': 'aspect-[2/1]',
		'2x2': 'aspect-square',
		full: 'aspect-[4/1]'
	};

	const MIN: Record<Span, string> = {
		'1x1': 'min-h-[9.5rem]',
		'2x1': 'min-h-[9.5rem]',
		'2x2': 'min-h-[20.5rem]',
		full: 'min-h-[9.5rem]'
	};

	let sizing = $derived(flexible ? MIN[span] : RATIO[span]);
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
