<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The bar every admin screen opens with — the same object at every width:
	 * the screen's name on the left, its actions on the right, a hairline
	 * under both, on a solid surface. It sticks, so the primary action never
	 * scrolls out of reach. A phone gets the desktop's bar, not an imitation of
	 * some platform's: one product, one vocabulary.
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
	class="sticky top-0 z-10 flex min-h-12 items-center gap-x-2.5 border-b border-border-subtle bg-surface px-4 pt-[env(safe-area-inset-top)] md:min-h-14 md:px-6 md:pt-0"
>
	<h1 class="min-w-0 truncate text-[0.9375rem] font-semibold tracking-[-0.01em]">{title}</h1>
	{#if meta}
		<div class="flex min-w-0 items-center">{@render meta()}</div>
	{/if}
	{#if actions}
		<div class="ms-auto flex shrink-0 items-center gap-1.5 md:gap-2">{@render actions()}</div>
	{/if}
</header>
