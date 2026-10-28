<script lang="ts">
	import Search from 'lucide-svelte/icons/search';
	import { inputClass, kbd } from './styles';

	/**
	 * The filter above a table. Pressing `/` anywhere on the page focuses it
	 * (wired by the page), so the keycap is shown where a keyboard exists.
	 */
	let {
		value = $bindable(),
		el = $bindable(),
		label
	}: { value: string; el?: HTMLInputElement | null; label: string } = $props();
</script>

<div class="relative">
	<Search
		size={15}
		class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
		aria-hidden="true"
	/>
	<input
		bind:this={el}
		bind:value
		type="search"
		placeholder={label}
		aria-label={label}
		autocomplete="off"
		spellcheck="false"
		class="{inputClass()} ps-9 pe-9 max-md:bg-surface-sunken max-md:not-focus:shadow-none [&::-webkit-search-cancel-button]:hidden"
	/>
	<kbd
		class="{kbd} pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 pointer-coarse:hidden"
		aria-hidden="true">/</kbd
	>
</div>
