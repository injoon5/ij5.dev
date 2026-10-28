<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import X from 'lucide-svelte/icons/x';
	import { iconButton } from './styles';

	/**
	 * The side panel's own bar. Below `lg` the panel is a screen pushed over
	 * the list, so this is a navigation bar: a back button named after where it
	 * goes, the title centred, actions on the right. Beside the list it is the
	 * same height as the page header so the two hairlines meet, with a close
	 * button instead of a way back.
	 */
	let {
		title,
		close,
		backLabel,
		actions
	}: {
		title: string;
		/** Where back and close go — the list URL. */
		close: string;
		/** The list's name: "Links". */
		backLabel: string;
		actions?: Snippet;
	} = $props();
</script>

<header
	class="sticky top-0 z-10 grid min-h-11 grid-cols-[minmax(5.5rem,1fr)_minmax(0,auto)_minmax(5.5rem,1fr)] items-center gap-1 border-b border-border-subtle bg-bg/85 px-1 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 md:bg-surface/90 lg:flex lg:min-h-14 lg:px-3 lg:ps-5 lg:pt-0"
>
	<a
		href={close}
		data-sveltekit-noscroll
		class="flex h-10 items-center justify-self-start pe-2 text-[1.0625rem] text-accent transition-opacity duration-150 ease-out active:opacity-50 lg:hidden"
	>
		<ChevronLeft size={26} strokeWidth={2} aria-hidden="true" class="-me-0.5" />
		{backLabel}
	</a>

	<h2
		class="truncate text-center text-[1.0625rem] font-semibold tracking-[-0.012em] lg:flex-1 lg:text-left lg:text-[0.9375rem] lg:tracking-[-0.01em]"
		{title}
	>
		{title}
	</h2>

	<div class="flex items-center justify-self-end gap-0.5 lg:contents">
		{@render actions?.()}
		<a
			href={close}
			data-sveltekit-noscroll
			class="{iconButton} max-lg:hidden"
			aria-label="Close"
			title="Close"
		>
			<X size={16} aria-hidden="true" />
		</a>
	</div>
</header>
