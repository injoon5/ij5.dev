<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Every admin screen opens with this. Tailored twice:
	 *
	 *   - a phone gets a large title on the canvas, the way a native app's
	 *     root screens open — the name is the landmark, and actions are round
	 *     icon buttons in the corner a thumb reaches;
	 *   - from `md`, a compact bar with a hairline that sticks to the top of
	 *     the panel, so the primary action never scrolls out of reach.
	 */
	let {
		title,
		meta,
		actions
	}: {
		title: string;
		/** Something that qualifies the title — a status, a filter. */
		meta?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<header
	class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-3 md:sticky md:top-0 md:z-10 md:min-h-14 md:border-b md:border-border-subtle md:bg-surface/90 md:px-6 md:py-2.5 md:backdrop-blur-md"
>
	<h1
		class="min-w-0 truncate text-[1.75rem] leading-tight font-bold tracking-[-0.022em] md:text-[0.9375rem] md:font-semibold md:tracking-[-0.01em]"
	>
		{title}
	</h1>
	{#if meta}
		<!-- Under the title on a phone, the way a native subtitle sits; beside
		     it from `md`. -->
		<div class="flex min-w-0 items-center max-md:order-last max-md:w-full">{@render meta()}</div>
	{/if}
	{#if actions}
		<div class="ms-auto flex items-center gap-2">{@render actions()}</div>
	{/if}
</header>
