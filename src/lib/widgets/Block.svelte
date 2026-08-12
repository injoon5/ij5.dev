<script lang="ts">
	import type { Block, Span } from '$lib/types';
	import { components, isKind } from './index';

	let {
		block,
		live,
		eager = false
	}: { block: Block; live?: unknown; eager?: boolean } = $props();

	// Grid placement. Four columns at `lg`, two below — a `2x1` is therefore
	// the full width of a phone, which is the point: mobile is a different
	// layout, not the same one scaled.
	const SPAN_CLASS: Record<Span, string> = {
		'1x1': 'col-span-1',
		'2x1': 'col-span-2',
		'2x2': 'col-span-2 row-span-2',
		full: 'col-span-2 lg:col-span-4'
	};

	let Widget = $derived(isKind(block.kind) ? components[block.kind] : null);
</script>

{#if Widget}
	{#if block.kind === 'heading'}
		<!-- `heading` places itself: it is a section rule, not a grid cell. -->
		<Widget data={block.data} />
	{:else}
		<div class={SPAN_CLASS[block.span]}>
			<Widget span={block.span} data={block.data} {live} {eager} />
		</div>
	{/if}
{/if}
