<script module lang="ts">
	/** Module-scoped so two lists on one page never share a title id. */
	let seq = 0;
</script>

<script lang="ts">
	import X from 'lucide-svelte/icons/x';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import { card } from './styles';

	/**
	 * A ranked list where the bar is the row background rather than a separate
	 * element. One less thing to align, and the label stays readable at any
	 * width because it never shares the row with a chart.
	 *
	 * Bars are a sunken surface, not the accent: length and order already carry
	 * rank, and the accent is spoken for by actions and the focus ring.
	 *
	 * The card shows the first `limit` rows and folds the rest into a `<dialog>`
	 * — a long list is a wall to scroll past on the way to the next panel, and
	 * the dialog is where the full strings are actually readable.
	 */

	type Row = { label: string; value: number; href?: string };

	let {
		title,
		rows,
		empty,
		/**
		 * Heading level. These panels sit directly under the page title on the
		 * dashboard, but nested inside a per-slug section on the detail view —
		 * where an `h2` would claim to be a peer of the section containing it.
		 */
		level = 2,
		/** Rows shown in the card before the remainder moves into the dialog. */
		limit = 7
	}: { title: string; rows: Row[]; empty: string; level?: 2 | 3; limit?: number } = $props();

	let dialog = $state<HTMLDialogElement | null>(null);

	let max = $derived(Math.max(1, ...rows.map((r) => r.value)));
	let shown = $derived(rows.slice(0, limit));
	let more = $derived(rows.length - shown.length);

	const titleId = `barlist-${++seq}`;

	function open() {
		if (dialog && !dialog.open) dialog.showModal();
	}

	function close() {
		dialog?.close();
	}

	/** A click outside the panel is a click on the backdrop. The coordinates
	 *  are checked rather than `event.target` because browsers disagree about
	 *  what the target of a backdrop click is. */
	function onbackdrop(event: MouseEvent) {
		const rect = dialog?.getBoundingClientRect();
		const inside =
			!!rect &&
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom;
		if (!inside) close();
	}
</script>

<section class={card}>
	<svelte:element this={`h${level}`} class="text-sm font-semibold">{title}</svelte:element>

	{#if rows.length}
		<!-- Cards sit side by side in a grid, so the body reserves a fixed height:
		     `--rows` rows plus their 1px gaps. A short list keeps the space rather
		     than shrinking, so a card with no "View all" still matches one with. -->
		<ul
			class="mt-3 flex min-h-[calc(var(--rows)*2.25rem+(var(--rows)-1)*1px)] flex-col gap-px pointer-coarse:min-h-[calc(var(--rows)*2.75rem+(var(--rows)-1)*1px)]"
			style="--rows: {limit}"
		>
			{#each shown as row (row.label)}
				{@render rowItem(row, false)}
			{/each}
		</ul>

		<div class="mt-1 min-h-11 pointer-fine:min-h-9">
			{#if more > 0}
				<button
					class="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[var(--radius-ui-sm)] text-sm font-medium text-text-muted transition-colors duration-150 ease-out hover:bg-surface-sunken hover:text-text pointer-fine:min-h-9"
					onclick={open}
					aria-haspopup="dialog"
				>
					View all {rows.length}
					<ChevronDown size={15} aria-hidden="true" />
				</button>
			{/if}
		</div>
	{:else}
		<p class="mt-3 text-sm text-pretty text-text-muted">{empty}</p>
	{/if}
</section>

<!--
	A bottom sheet on a phone, a centred card at `sm` and up. The UA centres a
	modal with `margin: auto`; dropping the bottom margin pins it to the viewport
	edge. `display`/`overlay` transition with `transition-discrete` so the box and
	its top-layer slot hold through the closing animation, and `starting:` seeds
	the enter from the closed state — no JS, no keyframes.
-->
<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	onclick={onbackdrop}
	class="fixed inset-0 m-auto mb-0 max-h-[min(85dvh,40rem)] w-full max-w-none translate-y-4 rounded-t-[var(--radius-ui-lg)] border-0 bg-surface p-0 text-text opacity-0 shadow-[var(--shadow-pop)] transition-[opacity,transform,display,overlay] duration-200 ease-out transition-discrete open:flex open:translate-y-0 open:flex-col open:overflow-hidden open:opacity-100 backdrop:bg-black/40 backdrop:opacity-0 backdrop:transition-[opacity,display,overlay] backdrop:duration-200 backdrop:ease-out backdrop:transition-discrete open:backdrop:opacity-100 starting:open:translate-y-4 starting:open:opacity-0 starting:open:backdrop:opacity-0 sm:m-auto sm:max-h-[min(32rem,calc(100dvh-4rem))] sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-[var(--radius-ui-lg)]"
>
	<header class="flex items-center justify-between gap-4 px-[1.125rem] pt-4 pb-2.5">
		<div class="min-w-0">
			<svelte:element this={`h${level}`} id={titleId} class="truncate text-sm font-semibold">
				{title}
			</svelte:element>
			<p class="mt-0.5 text-xs text-text-subtle">Showing all {rows.length}</p>
		</div>
		<button
			type="button"
			onclick={close}
			aria-label="Close"
			class="grid size-11 shrink-0 place-items-center rounded-[var(--radius-ui-sm)] text-text-muted transition-colors duration-150 ease-out hover:bg-surface-sunken hover:text-text pointer-fine:size-9"
		>
			<X size={17} aria-hidden="true" />
		</button>
	</header>

	<ul
		class="flex flex-auto flex-col gap-px overflow-y-auto overscroll-contain px-2.5 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))] [min-height:0]"
	>
		{#each rows as row (row.label)}
			{@render rowItem(row, true)}
		{/each}
	</ul>
</dialog>

{#snippet rowItem(r: Row, full: boolean)}
	<li class="relative">
		<svelte:element
			this={r.href ? 'a' : 'div'}
			href={r.href}
			class="relative flex min-h-9 items-center justify-between gap-3 rounded-[var(--radius-ui-sm)] px-2 pointer-coarse:min-h-11"
			class:group={Boolean(r.href)}
		>
			<!-- The bar deepens on a link-row hover rather than the row filling
			     behind it, which would land on the bar's own surface. -->
			<span
				class="absolute inset-y-0 left-0 rounded-[var(--radius-ui-sm)] bg-surface-sunken transition-colors duration-150 ease-out group-hover:bg-border-subtle"
				style="width: {Math.max(2, (r.value / max) * 100)}%"
				aria-hidden="true"
			></span>
			<!-- The card truncates to stay short; the full string is exactly what
			     the dialog exists to show, so there it wraps. -->
			<span
				class="relative min-w-0 text-sm {full ? 'py-1' : 'truncate'}"
				title={full ? undefined : r.label}
			>
				{r.label}
			</span>
			<span class="tnum relative shrink-0 text-sm text-text-muted">{r.value}</span>
		</svelte:element>
	</li>
{/snippet}

