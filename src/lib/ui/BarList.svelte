<script module lang="ts">
	/** Module-scoped so two lists on one page never share a title id. */
	let seq = 0;
</script>

<script lang="ts">
	import X from 'lucide-svelte/icons/x';
	import { card, cardTitle, iconButton } from './styles';

	/**
	 * A ranked list where the bar is the row's own background rather than a
	 * separate element — the label stays readable at any width because it
	 * never shares the row with a chart. Bars are a faint fill, not the
	 * accent: length and order already carry rank.
	 *
	 * The card shows the first `limit` rows and folds the rest into a sheet —
	 * a long list is a wall to scroll past on the way to the next panel. The
	 * card is as tall as its rows; cards side by side in a grid row stretch to
	 * the tallest, and a lone card is never padded out to an empty box.
	 */

	type Row = { label: string; value: number; href?: string };
	type View = { title: string; rows: Row[] };

	let {
		title,
		rows = [],
		views,
		empty = 'Nothing in this range.',
		level = 2,
		limit = 6,
		class: extra = ''
	}: {
		title: string;
		rows?: Row[];
		/** Several related lists in one card, switched by tabs in its header —
		 *  three cards of devices, systems and browsers become one. */
		views?: View[];
		empty?: string;
		/** Heading level, so a nested list never claims to be a peer of its section. */
		level?: 2 | 3;
		/** Rows shown in the card before the remainder moves into the sheet. */
		limit?: number;
		class?: string;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let tab = $state(0);

	let current = $derived(views ? views[Math.min(tab, views.length - 1)] : { title, rows });
	let list = $derived(current.rows);
	let max = $derived(Math.max(1, ...list.map((r) => r.value)));
	let shown = $derived(list.slice(0, limit));
	let more = $derived(list.length - shown.length);

	const titleId = `barlist-${++seq}`;

	/** A click outside the panel is a click on the backdrop. Coordinates, not
	 *  `event.target`, because browsers disagree about a backdrop's target. */
	function onbackdrop(event: MouseEvent) {
		const r = dialog?.getBoundingClientRect();
		if (!r) return;
		const inside =
			event.clientX >= r.left &&
			event.clientX <= r.right &&
			event.clientY >= r.top &&
			event.clientY <= r.bottom;
		if (!inside) dialog?.close();
	}
</script>

<section class="{card} flex flex-col {extra}">
	<div class="flex min-h-6 items-center justify-between gap-3">
		{#if views}
			<svelte:element this={`h${level}`} class="sr-only">{title}</svelte:element>
			<div class="-ms-1.5 flex gap-0.5" role="tablist" aria-label={title}>
				{#each views as view, i (view.title)}
					<button
						type="button"
						role="tab"
						aria-selected={i === tab}
						class="rounded-[var(--radius-ui-sm)] px-1.5 py-0.5 text-sm font-semibold text-text-subtle transition-colors duration-150 ease-out hover:text-text aria-selected:text-text"
						onclick={() => (tab = i)}
					>
						{view.title}
					</button>
				{/each}
			</div>
		{:else}
			<svelte:element this={`h${level}`} class={cardTitle}>{title}</svelte:element>
		{/if}
		{#if more > 0}
			<button
				type="button"
				class="-me-1.5 rounded-[var(--radius-ui-sm)] px-1.5 py-0.5 text-xs font-medium text-text-muted transition-colors duration-150 ease-out hover:bg-row-active hover:text-text pointer-coarse:py-2"
				onclick={() => dialog?.showModal()}
				aria-haspopup="dialog"
			>
				View all
			</button>
		{/if}
	</div>

	{#if list.length}
		<ul class="mt-3 flex flex-col gap-1">
			{#each shown as row (row.label)}
				{@render rowItem(row, false)}
			{/each}
		</ul>
	{:else}
		<p class="mt-3 text-sm text-text-muted">{empty}</p>
	{/if}
</section>

<!--
	A bottom sheet on a phone, a centred card from `sm`. `display`/`overlay`
	transition with `transition-discrete` so the box holds through the close,
	and `starting:` seeds the enter — no JS, no keyframes.
-->
<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	onclick={onbackdrop}
	class="fixed inset-0 m-auto mb-0 max-h-[min(85dvh,40rem)] w-full max-w-none translate-y-4 rounded-t-[var(--radius-widget)] border-0 bg-surface p-0 text-text opacity-0 shadow-[var(--shadow-pop)] transition-[opacity,translate,display,overlay] duration-200 ease-out transition-discrete open:flex open:translate-y-0 open:flex-col open:overflow-hidden open:opacity-100 backdrop:bg-black/35 backdrop:opacity-0 backdrop:transition-[opacity,display,overlay] backdrop:duration-200 backdrop:transition-discrete open:backdrop:opacity-100 starting:open:translate-y-4 starting:open:opacity-0 starting:open:backdrop:opacity-0 sm:m-auto sm:max-h-[min(32rem,calc(100dvh-4rem))] sm:w-[min(28rem,calc(100vw-2rem))] sm:translate-y-0 sm:scale-[0.98] sm:rounded-[var(--radius-ui-lg)] sm:transition-[opacity,scale,display,overlay] sm:open:scale-100 sm:starting:open:scale-[0.98]"
>
	<!-- The grabber says "sheet" before anything else does. -->
	<span class="mx-auto mt-2 block h-1 w-9 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden="true"></span>
	<header class="flex items-center justify-between gap-4 ps-5 pe-3 pt-2 pb-1 sm:pt-3">
		<svelte:element this={`h${level}`} id={titleId} class="truncate text-[0.9375rem] font-semibold">
			{current.title}
		</svelte:element>
		<button type="button" onclick={() => dialog?.close()} aria-label="Close" class={iconButton}>
			<X size={16} aria-hidden="true" />
		</button>
	</header>

	<ul
		class="flex min-h-0 flex-auto flex-col gap-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
	>
		{#each list as row (row.label)}
			{@render rowItem(row, true)}
		{/each}
	</ul>
</dialog>

{#snippet rowItem(r: Row, full: boolean)}
	<li>
		<svelte:element
			this={r.href ? 'a' : 'div'}
			href={r.href}
			class="group relative flex min-h-8 items-center justify-between gap-3 rounded-[var(--radius-ui-sm)] px-2 pointer-coarse:min-h-9"
		>
			<!-- The bar deepens under a pointer on a link row, rather than the row
			     filling behind it and landing on the bar's own colour. -->
			<span
				class="absolute inset-y-0 left-0 rounded-[var(--radius-ui-sm)] bg-row-active transition-colors duration-150 ease-out {r.href
					? 'group-hover:bg-surface-sunken'
					: ''}"
				style="width: {Math.max(1.5, (r.value / max) * 100)}%"
				aria-hidden="true"
			></span>
			<!-- The card truncates to stay short; the sheet exists to show the
			     whole string, so there it wraps. -->
			<span class="relative min-w-0 text-sm {full ? 'py-1.5 [overflow-wrap:anywhere]' : 'truncate'}" title={full ? undefined : r.label}>
				{r.label}
			</span>
			<span class="relative shrink-0 text-sm text-text-muted">{r.value.toLocaleString('en')}</span>
		</svelte:element>
	</li>
{/snippet}
