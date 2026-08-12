<script lang="ts">
	import Play from 'lucide-svelte/icons/play';
	import Asset from './Asset.svelte';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();

	/**
	 * Facade is the rule, not the optimization: render a static poster that
	 * looks like the real thing and swap in the iframe on interaction. It is
	 * the only way an embed coexists with the LCP gate, and it is why the CSP
	 * can keep `frame-src 'none'` until someone actually presses play.
	 */
	let embed = $derived.by(() => {
		try {
			const u = new URL(data.url);
			if (u.hostname.endsWith('youtube.com')) {
				const id = u.searchParams.get('v');
				return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` : null;
			}
			if (u.hostname === 'youtu.be') {
				return `https://www.youtube-nocookie.com/embed${u.pathname}?autoplay=1`;
			}
			if (u.hostname.endsWith('vimeo.com')) {
				return `https://player.vimeo.com/video${u.pathname}?autoplay=1`;
			}
		} catch {
			return null;
		}
		return null;
	});
</script>

<Surface {span} bleed>
	<div class="absolute inset-0">
		<Asset src={data.poster} alt="" />
	</div>

	<div class="widget-scrim relative flex h-full flex-col justify-end p-widget">
		<button
			type="button"
			data-embed={embed}
			data-embed-title={data.title}
			class="absolute inset-0 grid place-items-center focus-visible:outline-offset-[-4px]"
		>
			<span class="sr-only">Play {data.title}</span>
			<span
				class="grid size-14 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition-transform duration-200 ease-out group-hover:scale-105"
			>
				<Play size={22} fill="currentColor" aria-hidden="true" />
			</span>
		</button>

		<p class="pointer-events-none relative text-sm font-medium text-white">{data.title}</p>
	</div>
</Surface>
