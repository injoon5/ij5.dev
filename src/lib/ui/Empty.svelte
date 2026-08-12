<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Every list has a designed empty state with a real next action. "No data"
	 * is not an empty state — it is a dead end, and empty is the state a new
	 * install spends its first day in.
	 *
	 * It is the same object the public page's empty state is, so it is built the
	 * same way: a plain surface panel. It used to be a dashed outline, which is
	 * the one place in the product where a border did a job spacing and a
	 * surface already do — and which made the first thing a new install shows
	 * look like a dropzone waiting for a file.
	 *
	 * Title and body were also both `text-sm`, separated by weight alone. Two
	 * lines of the same size are one block of text no matter what weight they
	 * carry; the title now takes the step above, matching the public page.
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
