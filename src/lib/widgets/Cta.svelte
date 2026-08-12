<script lang="ts">
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();
</script>

<!-- The one filled surface on the page. Several coloured control backgrounds
     in one view is how an accent stops meaning anything, so `cta` is the only
     kind that gets the accent and there should rarely be two of them. -->
<Surface {span} href={data.url} class="cta-widget">
	<div class="mt-auto flex items-end justify-between gap-4">
		<div class="min-w-0">
			<p class="text-lg font-semibold text-balance">{data.label}</p>
			{#if data.description}
				<p class="mt-1 text-sm text-pretty opacity-75">{data.description}</p>
			{/if}
		</div>
		<span
			class="widget-inner grid size-10 shrink-0 place-items-center bg-white/15 transition-transform duration-200 ease-out"
		>
			<ArrowRight size={18} aria-hidden="true" />
		</span>
	</div>
</Surface>

<style>
	:global(.cta-widget) {
		background-color: var(--accent);
		color: var(--accent-contrast);
	}

	@media (hover: hover) and (pointer: fine) {
		:global(.cta-widget:hover) {
			background-color: var(--accent-hover);
		}

		:global(.cta-widget:hover .widget-inner) {
			transform: translateX(2px);
		}
	}
</style>
