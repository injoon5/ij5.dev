<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Every list has an empty state with a real next action — "no data" is a
	 * dead end, and empty is the state a new install spends its first day in.
	 * It sits on the canvas itself rather than in a box of its own.
	 */
	let { title, body, action }: { title: string; body?: string; action?: Snippet } = $props();
</script>

<div class="flex flex-col items-center justify-center px-6 py-16 text-center">
	<p class="text-sm font-semibold">{title}</p>
	{#if body}
		<p class="mt-1 max-w-[42ch] text-sm text-pretty text-text-muted">{body}</p>
	{/if}
	{#if action}
		<div class="mt-4">{@render action()}</div>
	{/if}
</div>
