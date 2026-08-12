<script lang="ts">
	import { card } from './styles';

	/**
	 * A ranked list where the bar is the row background rather than a separate
	 * element. One less thing to align, and the label stays readable at any
	 * width because it never shares the row with a chart.
	 *
	 * The bars are a sunken surface, not the accent. The stylesheet's rule is
	 * "one accent, one meaning: the primary action and the focus ring", and the
	 * analytics page had four of these panels painting accent behind roughly
	 * forty rows — on the same screen as an accent chart line and an accent
	 * Publish button. At that density the colour stops pointing at anything.
	 * Rank is already carried by the bar's length and the list's order; it does
	 * not also need a hue.
	 */

	type Row = { label: string; value: number; href?: string };

	let {
		title,
		rows,
		empty,
		unit = '',
		/**
		 * Heading level. These panels sit directly under the page title on the
		 * dashboard, but nested inside a per-slug section on the detail view —
		 * where an `h2` would claim to be a peer of the section containing it.
		 */
		level = 2
	}: { title: string; rows: Row[]; empty: string; unit?: string; level?: 2 | 3 } = $props();

	let max = $derived(Math.max(1, ...rows.map((r) => r.value)));
</script>

<section class={card}>
	<svelte:element this={`h${level}`} class="text-sm font-semibold">{title}</svelte:element>

	{#if rows.length}
		<ul class="mt-3 flex flex-col gap-px">
			{#each rows as row (row.label)}
				<li class="relative">
					<svelte:element
						this={row.href ? 'a' : 'div'}
						href={row.href}
						class="row relative flex min-h-9 items-center justify-between gap-3 rounded-[var(--radius-ui-sm)] px-2"
						class:is-link={Boolean(row.href)}
					>
						<span
							class="bar absolute inset-y-0 left-0 rounded-[var(--radius-ui-sm)] bg-surface-sunken"
							style="width: {Math.max(2, (row.value / max) * 100)}%"
							aria-hidden="true"
						></span>
						<!-- The full value stays reachable: a truncated referrer or
						     404 path is exactly the thing you opened this list to
						     read, and the list is where you decide whether to turn
						     it into a real slug. -->
						<span class="relative min-w-0 truncate text-sm" title={row.label}>{row.label}</span>
						<span class="tnum relative shrink-0 text-sm text-text-muted"
							>{row.value}{unit}</span
						>
					</svelte:element>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-3 text-sm text-pretty text-text-muted">{empty}</p>
	{/if}
</section>

<style>
	/*
	 * Half the rows in this list are links — "Top links" drills into a slug —
	 * and none of them said so. Every other clickable row in the product
	 * answers a pointer; these sat inert under one.
	 *
	 * The bar deepens rather than the row filling behind it: a background on
	 * the row would land on the same surface the bar is painted in and swallow
	 * the one mark carrying the data. `--border-subtle` is a step darker than
	 * `--surface-sunken` in light and a step lighter in dark, so the response
	 * reads the same way in both.
	 */
	@media (hover: hover) and (pointer: fine) {
		.row.is-link:hover .bar {
			background-color: var(--border-subtle);
		}
	}

	.bar {
		transition: background-color 150ms var(--ease-out);
	}
</style>
