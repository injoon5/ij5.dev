<script lang="ts">
	import type { Span } from '$lib/types';

	// The grid sizes the cell; the spacer only has to occupy it. An aspect ratio
	// here would size it from its own width instead and fall short of the row,
	// the same way it did on every other widget — so `span` is accepted to match
	// the shape every kind is rendered with, and deliberately unused.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { span, data }: { span?: Span; data?: Record<string, unknown> } = $props();
</script>

<!-- Deliberate emptiness. No surface, no shadow — it holds a gap in the grid
     and nothing else, which is the entire point. -->
<div class="h-full" aria-hidden="true"></div>
