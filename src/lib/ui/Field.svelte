<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		id: string;
		label: string;
		/** Shown under the field only when it changes what someone would do. */
		hint?: string;
		error?: string;
		children: Snippet<[{ id: string; describedBy: string | undefined; invalid: boolean }]>;
	};

	let { id, label, hint, error, children }: Props = $props();

	let hintId = $derived(hint ? `${id}-hint` : undefined);
	let errorId = $derived(error ? `${id}-error` : undefined);
	let describedBy = $derived([errorId, hintId].filter(Boolean).join(' ') || undefined);
</script>

<div class="flex min-w-0 flex-col gap-1.5">
	<label for={id} class="text-sm font-medium">{label}</label>

	{@render children({ id, describedBy, invalid: Boolean(error) })}

	{#if error}
		<p id={errorId} class="text-xs text-danger">{error}</p>
	{:else if hint}
		<p id={hintId} class="text-xs text-text-muted">{hint}</p>
	{/if}
</div>
