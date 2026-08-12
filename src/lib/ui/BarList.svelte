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
		unit = ''
	}: { title: string; rows: Row[]; empty: string; unit?: string } = $props();

	let max = $derived(Math.max(1, ...rows.map((r) => r.value)));
</script>

<section class="rounded-[var(--radius-ui-lg)] bg-surface p-5">
	<h2 class="text-sm font-semibold">{title}</h2>

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
						<span class="relative min-w-0 truncate text-sm">{row.label}</span>
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
