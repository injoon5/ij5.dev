<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The Links, Pastes and Files screens: a list, and beside it a side panel
	 * for whichever row is open. From `lg` both are always up — the panel is a
	 * column with a hairline edge that holds still while the list scrolls.
	 * Below `lg` it is a drill-down: the panel replaces the list while open.
	 */
	let {
		open,
		label,
		list,
		detail
	}: {
		/** Whether a row (or the create form) is open. */
		open: boolean;
		/** The side panel's accessible name. */
		label: string;
		list: Snippet;
		detail: Snippet;
	} = $props();
</script>

<div class="lg:grid lg:min-h-full lg:grid-cols-[minmax(0,1fr)_26rem]">
	<section class="min-w-0 {open ? 'max-lg:hidden' : ''}">
		{@render list()}
	</section>

	<!-- `max-lg:animate-pane-rise` replays each time the panel is displayed,
	     which on a phone is every time a row opens. -->
	<aside
		aria-label={label}
		class="{open
			? 'max-lg:animate-pane-rise'
			: 'max-lg:hidden'} min-w-0 lg:sticky lg:top-0 lg:h-[calc(100dvh-1rem-2px)] lg:overflow-y-auto lg:border-s lg:border-border-subtle"
	>
		{@render detail()}
	</aside>
</div>
