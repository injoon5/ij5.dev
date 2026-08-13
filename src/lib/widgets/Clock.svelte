<script lang="ts">
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();

	/**
	 * The stored offset is free text — "UTC+9", "GMT-8", "UTC+5:30", "+9:30".
	 * Parsed to signed minutes so `/w.js` can render the wall-clock time without
	 * shipping the timezone database. Anything that does not parse (a bare "UTC",
	 * an abbreviation like "PST") returns null: the offset string then stands as
	 * written, which is the honest fallback rather than a wrong time.
	 */
	function offsetMinutes(raw: string): number | null {
		const m = raw.match(/([+-])\s*(\d{1,2})(?::?(\d{2}))?/);
		if (!m) return null;
		const hours = Number(m[2]);
		const mins = m[3] ? Number(m[3]) : 0;
		if (hours > 14 || mins > 59) return null;
		return (m[1] === '-' ? -1 : 1) * (hours * 60 + mins);
	}

	let mins = $derived(offsetMinutes(data.offset));
</script>

<!--
	Progressive enhancement, not a rendered instant. SSR prints the offset, which
	is correct however long the version-keyed edge cache holds this response.
	`/w.js` then replaces the text with the live local time and keeps it on the
	minute. With JavaScript off, the offset stays — never a stale clock.
-->
<Surface {span}>
	<span class="text-2xs font-semibold text-text-subtle">Local time</span>
	<div class="mt-auto">
		<p class="text-xl font-semibold">{data.place}</p>
		<!-- Tabular figures: the two digit pairs must not reflow as the minute
		     rolls over. -->
		<time
			class="tnum mt-0.5 block text-xs text-text-muted"
			data-clock={mins !== null ? '' : undefined}
			data-tz-offset={mins ?? undefined}>{data.offset}</time
		>
	</div>
</Surface>
