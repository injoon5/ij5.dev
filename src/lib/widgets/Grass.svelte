<script lang="ts">
	import PlatformIcon from './PlatformIcon.svelte';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	/**
	 * A contribution graph, drawn as CSS grid cells rather than an SVG or an
	 * embedded image.
	 *
	 * The public page ships no framework JavaScript, so this has to be static
	 * markup — which it is: roughly 350 spans, each a `<i>` with one class. That
	 * is smaller over the wire than the equivalent SVG and it inherits the
	 * theme's tokens for free, so the graph follows dark mode with no second
	 * palette to keep in sync.
	 */

	type Live = { days?: Array<{ d: string; c: number; l: number }>; total?: number };

	let {
		span,
		data,
		live
	}: { span: Span; data: Record<string, string>; live?: Live } = $props();

	/**
	 * A `1x1` shows the last ~13 weeks, a `2x2` the last ~26. A full year needs
	 * 53 columns, which at this size renders each day under 3px — below the
	 * point where the graph says anything, and small enough that the gaps stop
	 * resolving on a phone.
	 */
	const WEEKS: Partial<Record<Span, number>> = { '1x1': 13, '2x2': 26 };
	let weeks = $derived(WEEKS[span] ?? 13);

	let days = $derived(live?.days ?? []);

	/** Trailing whole weeks, so every column is a Sunday-to-Saturday run. */
	let cells = $derived(days.slice(-(weeks * 7)));

	let total = $derived(
		live?.total !== undefined
			? new Intl.NumberFormat('en').format(live.total)
			: data.fallbackValue
	);

	// Every live widget declares a fallback, and this one's is the graph itself:
	// with no data it renders its own empty lattice rather than a hole, so a
	// missing token looks like a quiet week instead of a broken widget.
	let placeholder = $derived(
		cells.length ? [] : Array.from({ length: weeks * 7 }, () => ({ l: 0, d: '', c: 0 }))
	);

	let grid = $derived(cells.length ? cells : placeholder);
</script>

<Surface {span} href="https://github.com/{data.user}" label="{data.user} on GitHub">
	<div class="flex items-start justify-between gap-2">
		<PlatformIcon name="github" size={22} class="text-text" />
		{#if total}
			<span class="tnum text-xs text-text-subtle">{total}</span>
		{/if}
	</div>

	<!--
		`aria-hidden`, with the sentence below carrying the meaning. Three hundred
		and fifty cells read out one at a time is not an accessible graph, it is a
		denial of service — the summary is the accessible version.
	-->
	<div
		class="grass mt-auto pt-3"
		style="--weeks: {weeks}"
		aria-hidden="true"
	>
		<!-- Unkeyed on purpose. The cells are positional and interchangeable, and
		     the placeholder lattice has no dates to key on — a fallback key would
		     have to be volatile, which Svelte rightly refuses. -->
		{#each grid as day}
			<i class="cell" data-level={day.l}></i>
		{/each}
	</div>

	<p class="mt-2.5 truncate text-xs text-text-muted">
		{#if live?.total !== undefined}
			contributions in {weeks} weeks
		{:else}
			{data.fallbackLabel || `@${data.user}`}
		{/if}
	</p>
</Surface>

<style>
	.grass {
		display: grid;
		/* Columns are weeks, rows are weekdays — the same orientation GitHub
		   uses, so the shape is legible to anyone who has seen one before. */
		grid-template-columns: repeat(var(--weeks), minmax(0, 1fr));
		grid-template-rows: repeat(7, minmax(0, 1fr));
		grid-auto-flow: column;
		gap: 2px;
	}

	.cell {
		aspect-ratio: 1;
		border-radius: 2px;
		background-color: var(--grass-0);
	}

	.cell[data-level='1'] {
		background-color: var(--grass-1);
	}
	.cell[data-level='2'] {
		background-color: var(--grass-2);
	}
	.cell[data-level='3'] {
		background-color: var(--grass-3);
	}
	.cell[data-level='4'] {
		background-color: var(--grass-4);
	}
</style>
