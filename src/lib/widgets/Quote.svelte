<script lang="ts">
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();
</script>

<Surface {span} flexible>
	<figure>
		<blockquote class="text-md leading-snug text-pretty">
			<!-- Curly quotes in prose. Straight quotes are for code. -->
			&ldquo;{data.quote}&rdquo;
		</blockquote>
		<!--
			Directly under the quote, not pushed to the floor of the card. A
			content-driven widget takes its height from a neighbour as often as
			from itself, so anything anchored to its bottom edge sits at a
			distance nobody chose — and an attribution floating away from its
			quote stops reading as an attribution.
		-->
		<figcaption class="mt-4 text-xs text-text-muted">
			{data.author}{#if data.role}<span class="text-text-subtle"> · {data.role}</span>{/if}
		</figcaption>
	</figure>
</Surface>
