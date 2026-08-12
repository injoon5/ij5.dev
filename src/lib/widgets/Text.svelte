<script lang="ts">
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();

	let paragraphs = $derived(data.body.split(/\n{2,}/).filter(Boolean));
</script>

<Surface {span} flexible>
	{#if data.title}
		<p class="text-2xs font-semibold tracking-wide text-text-subtle">{data.title}</p>
	{/if}
	<div class="mt-auto space-y-2 pt-3 text-sm text-pretty text-text-muted">
		{#each paragraphs as p (p)}
			<p>{p}</p>
		{/each}
	</div>
</Surface>
