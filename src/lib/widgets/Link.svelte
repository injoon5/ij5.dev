<script lang="ts">
	import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
	import Asset from './Asset.svelte';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();

	let host = $derived.by(() => {
		try {
			return new URL(data.url).hostname.replace(/^www\./, '');
		} catch {
			return '';
		}
	});
</script>

{#if data.image}
	<!-- With a cover the widget becomes a full-bleed card: edge to edge, text
	     on a scrim. A caption bar below the image is the clearest tell of a web
	     card imitating a widget. -->
	<Surface {span} href={data.url} bleed>
		<div class="absolute inset-0">
			<Asset src={data.image} alt="" />
		</div>
		<div class="widget-scrim relative flex h-full flex-col justify-end p-widget">
			<p class="text-md font-semibold text-white">{data.title}</p>
			<p class="mt-0.5 text-xs text-white/70">{data.subtitle || host}</p>
		</div>
	</Surface>
{:else}
	<Surface {span} href={data.url}>
		<div class="flex items-start justify-between gap-3">
			<!-- A monogram, not a favicon service. Fetching one would put a
			     third party on the critical path of the page that matters most,
			     add an `img-src` entry to the CSP, and tell that third party
			     who visits. The host's initial costs nothing and never 404s. -->
			<span
				class="widget-inner flex size-8 items-center justify-center bg-surface-sunken text-sm font-semibold text-text-muted"
				aria-hidden="true">{(host || data.title).charAt(0).toUpperCase()}</span
			>
			<ArrowUpRight size={16} class="text-text-subtle" aria-hidden="true" />
		</div>

		<div class="mt-auto pt-3">
			<p class="text-base leading-snug font-semibold text-balance">{data.title}</p>
			<p class="mt-1 truncate text-xs text-text-muted">{data.subtitle || host}</p>
		</div>
	</Surface>
{/if}
