<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import X from 'lucide-svelte/icons/x';
	import { iconButton } from './styles';

	/**
	 * The side panel's own bar, the same height as the page header beside it
	 * so the two hairlines meet in one line. Below `lg` the panel replaces the
	 * list, so the bar leads with a way back; beside the list it ends with a
	 * close button instead.
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
		/** The list's name, for the back button's accessible label. */
		backLabel: string;
		actions?: Snippet;
	} = $props();
</script>

<header
	class="sticky top-0 z-10 flex min-h-12 items-center gap-1 border-b border-border-subtle bg-surface ps-1.5 pe-2 pt-[env(safe-area-inset-top)] md:min-h-14 lg:ps-5 lg:pe-3 lg:pt-0"
>
	<a
		href={close}
		data-sveltekit-noscroll
		class="{iconButton} lg:hidden"
		aria-label="Back to {backLabel}"
	>
		<ChevronLeft size={18} aria-hidden="true" />
	</a>
	<h2 class="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold tracking-[-0.01em]" {title}>
		{title}
	</h2>
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
</header>
