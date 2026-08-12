<script lang="ts">
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: { title?: string; items: Array<{ label: string }> } } =
		$props();
</script>

<Surface {span} flexible>
	{#if data.title}
		<p class="text-2xs font-semibold tracking-wide text-text-subtle">{data.title}</p>
	{/if}
	<div class="mt-auto flex flex-wrap gap-1.5 pt-3">
		{#each data.items as item (item.label)}
			<span
				class="widget-inner bg-surface-sunken px-2.5 py-1 text-xs whitespace-nowrap text-text-muted"
				>{item.label}</span
			>
		{/each}
	</div>
</Surface>
