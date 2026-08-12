<script lang="ts">
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();
</script>

<Surface {span} flexible>
	<figure class="flex h-full flex-col">
		<blockquote class="text-md leading-snug text-pretty">
			<!-- Curly quotes in prose. Straight quotes are for code. -->
			&ldquo;{data.quote}&rdquo;
		</blockquote>
		<figcaption class="mt-auto pt-4 text-xs text-text-muted">
			{data.author}{#if data.role}<span class="text-text-subtle"> · {data.role}</span>{/if}
		</figcaption>
	</figure>
</Surface>
