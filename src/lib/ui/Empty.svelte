<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Every list has a designed empty state with a real next action. "No data"
	 * is not an empty state — it is a dead end, and empty is the state a new
	 * install spends its first day in.
	 */
	let {
		title,
		body,
		action
	}: { title: string; body: string; action?: Snippet } = $props();
</script>

<div
	class="flex flex-col items-center justify-center rounded-[var(--radius-ui-lg)] border border-dashed border-border-subtle px-6 py-12 text-center"
>
	<p class="text-sm font-semibold">{title}</p>
	<p class="mt-1 max-w-[42ch] text-sm text-pretty text-text-muted">{body}</p>
	{#if action}
		<div class="mt-4">{@render action()}</div>
	{/if}
</div>
