<script lang="ts">
	import type { Span } from '$lib/types';

	let { span }: { span: Span } = $props();

	const RATIO: Record<Span, string> = {
		'1x1': 'aspect-square',
		'2x1': 'aspect-[2/1]',
		'2x2': 'aspect-square',
		full: 'aspect-[4/1]'
	};
</script>

<!-- Deliberate emptiness. No surface, no shadow — it holds a gap in the grid
     and nothing else, which is the entire point. -->
<div class={RATIO[span]} aria-hidden="true"></div>
