<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		id: string;
		label: string;
		hint?: string;
		error?: string;
		optional?: boolean;
		children: Snippet<[{ id: string; describedBy: string | undefined; invalid: boolean }]>;
	};

	let { id, label, hint, error, optional = false, children }: Props = $props();

	let hintId = $derived(hint ? `${id}-hint` : undefined);
	let errorId = $derived(error ? `${id}-error` : undefined);
	let describedBy = $derived([errorId, hintId].filter(Boolean).join(' ') || undefined);
</script>

<div class="flex flex-col gap-1.5">
	<label for={id} class="flex items-baseline gap-2 text-sm font-medium">
		{label}
		{#if optional}
			<span class="text-xs font-normal text-text-subtle">Optional</span>
		{/if}
	</label>

	{@render children({ id, describedBy, invalid: Boolean(error) })}

	{#if error}
		<p id={errorId} class="text-xs text-danger">{error}</p>
	{:else if hint}
		<p id={hintId} class="text-xs text-text-subtle">{hint}</p>
	{/if}
</div>
