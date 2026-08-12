<script lang="ts">
	/**
	 * A ranked list where the bar is the row background rather than a separate
	 * element. One less thing to align, and the label stays readable at any
	 * width because it never shares the row with a chart.
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

<section class="rounded-[var(--radius-ui-lg)] bg-surface p-5">
	<svelte:element this={`h${level}`} class="text-sm font-semibold">{title}</svelte:element>

	{#if rows.length}
		<ul class="mt-3 flex flex-col gap-px">
			{#each rows as row (row.label)}
				<li class="relative">
					<svelte:element
						this={row.href ? 'a' : 'div'}
						href={row.href}
						class="relative flex min-h-9 items-center justify-between gap-3 rounded-[var(--radius-ui-sm)] px-2"
					>
						<span
							class="absolute inset-y-0 left-0 rounded-[var(--radius-ui-sm)] bg-accent-tint"
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
