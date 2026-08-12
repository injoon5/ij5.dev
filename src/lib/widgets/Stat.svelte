<script lang="ts">
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();
</script>

<Surface {span}>
	<div class="mt-auto">
		<!-- Tabular figures on anything that is a number, so a grid of stats
		     aligns down the column rather than nearly aligning. -->
		<p class="tnum text-3xl font-semibold">{data.value}</p>
		<p class="mt-1 text-xs text-text-muted">{data.label}</p>
		{#if data.note}
			<p class="mt-0.5 text-2xs text-text-subtle">{data.note}</p>
		{/if}
	</div>
</Surface>
