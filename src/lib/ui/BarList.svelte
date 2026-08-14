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
		<ul class="rows mt-3 flex flex-col gap-px" style="--rows: {limit}">
			{#each shown as row (row.label)}
				{@render rowItem(row, false)}
			{/each}
		</ul>

		<div class="foot">
			{#if more > 0}
				<button class="more" onclick={open} aria-haspopup="dialog">
					View all {rows.length}
					<ChevronDown size={15} aria-hidden="true" />
				</button>
			{/if}
		</div>
	{:else}
		<p class="mt-3 text-sm text-pretty text-text-muted">{empty}</p>
	{/if}
</section>

<dialog bind:this={dialog} class="dialog" aria-labelledby={titleId} onclick={onbackdrop}>
	<header class="head">
		<div class="min-w-0">
			<svelte:element this={`h${level}`} id={titleId} class="truncate text-sm font-semibold">
				{title}
			</svelte:element>
			<p class="mt-0.5 text-xs text-text-subtle">Showing all {rows.length}</p>
		</div>
		<button type="button" class="close" onclick={close} aria-label="Close">
			<X size={17} aria-hidden="true" />
		</button>
	</header>

	<ul class="list">
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
			class="row relative flex min-h-9 items-center justify-between gap-3 rounded-[var(--radius-ui-sm)] px-2 pointer-coarse:min-h-11"
			class:is-link={Boolean(r.href)}
		>
			<span
				class="bar absolute inset-y-0 left-0 rounded-[var(--radius-ui-sm)] bg-surface-sunken"
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

<style>
	/* The bar deepens rather than the row filling behind it, which would land on
	   the same surface the bar is painted in. Inverts correctly in dark. */
	@media (hover: hover) and (pointer: fine) {
		.row.is-link:hover .bar {
			background-color: var(--border-subtle);
		}
	}

	.bar {
		transition: background-color 150ms var(--ease-out);
	}

	/* Cards sit side by side in a grid, so they reserve a fixed body: `--rows`
	   rows of list plus a footer slot. A list shorter than the limit leaves the
	   empty space inside the card instead of shrinking it, and a card with no
	   "View all" still matches one that has it. */
	.rows {
		--row: 2.25rem;
		min-height: calc(var(--rows) * var(--row) + (var(--rows) - 1) * 1px);
	}

	@media (pointer: coarse) {
		.rows {
			--row: 2.75rem;
		}
	}

	.foot {
		min-height: 2.75rem;
		margin-top: 0.5rem;
	}

	@media (pointer: fine) {
		.foot {
			min-height: 2.25rem;
		}
	}

	.more {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		width: 100%;
		min-height: 2.75rem;
		border-radius: var(--radius-ui-sm);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		transition:
			background-color 150ms var(--ease-out),
			color 150ms var(--ease-out);
	}

	@media (pointer: fine) {
		.more {
			min-height: 2.25rem;
		}
	}

	@media (hover: hover) and (pointer: fine) {
		.more:hover {
			background-color: var(--surface-sunken);
			color: var(--text);
		}
	}

	/* A bottom sheet on narrow screens, a centred card at `sm` and up. The UA
	   centres a modal with `margin: auto`; dropping the bottom margin pins it to
	   the viewport edge instead. Everything box-shaped lives on the base rule,
	   but `display` must only be set while open — otherwise it overrides the
	   UA's `dialog:not([open]) { display: none }` and the closed dialog shows. */
	.dialog {
		position: fixed;
		inset: 0;
		margin: auto 0 0;
		width: 100%;
		max-width: none;
		max-height: min(85dvh, 40rem);
		padding: 0;
		border: 0;
		border-radius: var(--radius-ui-lg) var(--radius-ui-lg) 0 0;
		background-color: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-pop);
		opacity: 0;
		transform: translateY(1rem);
		/* `display` and `overlay` take `allow-discrete` so the box and its
		   top-layer slot hold through the closing transition. */
		transition:
			opacity 200ms var(--ease-out),
			transform 240ms var(--ease-out),
			display 240ms allow-discrete,
			overlay 240ms allow-discrete;
	}

	.dialog[open] {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		opacity: 1;
		transform: none;
	}

	@starting-style {
		.dialog[open] {
			opacity: 0;
			transform: translateY(1rem);
		}
	}

	.dialog::backdrop {
		background-color: oklch(0 0 0 / 0.4);
		opacity: 0;
		transition:
			opacity 240ms var(--ease-out),
			display 240ms allow-discrete,
			overlay 240ms allow-discrete;
	}

	.dialog[open]::backdrop {
		opacity: 1;
	}

	@starting-style {
		.dialog[open]::backdrop {
			opacity: 0;
		}
	}

	@media (min-width: 640px) {
		.dialog {
			margin: auto;
			width: min(30rem, calc(100vw - 2rem));
			max-height: min(32rem, calc(100dvh - 4rem));
			border-radius: var(--radius-ui-lg);
		}
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.125rem 0.625rem;
	}

	.close {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-ui-sm);
		color: var(--text-muted);
		transition:
			background-color 150ms var(--ease-out),
			color 150ms var(--ease-out);
	}

	@media (pointer: fine) {
		.close {
			width: 2.25rem;
			height: 2.25rem;
		}
	}

	@media (hover: hover) and (pointer: fine) {
		.close:hover {
			background-color: var(--surface-sunken);
			color: var(--text);
		}
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		/* A flex child of a max-height dialog: without `min-height: 0` it grows
		   to content and pushes the dialog past its cap instead of scrolling. */
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.5rem 0.625rem calc(1.25rem + env(safe-area-inset-bottom));
	}
</style>
