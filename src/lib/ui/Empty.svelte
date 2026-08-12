<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Every list has a designed empty state with a real next action. "No data"
	 * is not an empty state — it is a dead end, and empty is the state a new
	 * install spends its first day in.
	 *
	 * Built as the same surface panel the public page's empty state is.
	 */
	let {
		title,
		body,
		action
	}: { title: string; body: string; action?: Snippet } = $props();
</script>

<div
	class="flex flex-col items-center justify-center rounded-[var(--radius-ui-lg)] bg-surface px-6 py-14 text-center"
>
	<p class="text-md font-semibold">{title}</p>
	<p class="mt-1.5 max-w-[42ch] text-sm text-pretty text-text-muted">{body}</p>
	{#if action}
		<div class="mt-5">{@render action()}</div>
	{/if}
</div>
