<script lang="ts">
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	type Live = { temp?: number; unit?: string; code?: number };

	let {
		span,
		data,
		live
	}: { span: Span; data: Record<string, string>; live?: Live } = $props();

	/**
	 * WMO weather codes, collapsed to the six conditions worth naming. The full
	 * table has 28 entries that mostly differ by intensity, and "moderate
	 * drizzle" is not a distinction a widget this size can carry.
	 */
	function describe(code: number | undefined): string {
		if (code === undefined) return '';
		if (code === 0) return 'Clear';
		if (code <= 3) return 'Cloudy';
		if (code <= 48) return 'Fog';
		if (code <= 67) return 'Rain';
		if (code <= 77) return 'Snow';
		if (code <= 82) return 'Showers';
		return 'Storm';
	}

	let condition = $derived(describe(live?.code) || data.fallbackLabel || '');
	let reading = $derived(
		live?.temp !== undefined ? `${live.temp}${live.unit ?? '°C'}` : data.fallbackValue
	);
</script>

<Surface {span}>
	<span class="text-2xs font-semibold text-text-subtle">{data.place}</span>

	<div class="mt-auto">
		{#if reading}
			<!-- Tabular figures: this number changes on its own, and a proportional
			     `1` would shift the label under it every time it did. -->
			<p class="tnum text-xl font-semibold">{reading}</p>
		{/if}
		{#if condition}
			<p class="mt-0.5 text-xs text-text-muted">{condition}</p>
		{/if}
	</div>
</Surface>
