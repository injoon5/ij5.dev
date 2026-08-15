<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Button from '$lib/ui/Button.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { fmtBytes, fmtDay } from '$lib/format';
	import { inputClass } from '$lib/ui/styles';
	import PasteForm from './PasteForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);

	let selection = $derived(page.url.searchParams.get('s'));
	let creating = $derived(selection === 'new');
	let detail = $derived(creating || Boolean(data.selected));

	/** The first ~80 characters, collapsed to one line — enough to identify. */
	const snippet = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 80);

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.pastes;
		return data.pastes.filter(
			(p) =>
				p.slug.toLowerCase().includes(q) ||
				snippet(p.body).toLowerCase().includes(q) ||
				(p.note ?? '').toLowerCase().includes(q)
		);
	});

	function onKeydown(event: KeyboardEvent) {
		// `Cmd+N`, `Ctrl+/` and friends belong to the browser.
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const el = event.target as HTMLElement | null;
		if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;

		if (event.key === 'Escape' && detail) {
			event.preventDefault();
			goto('/admin/pastes', { noScroll: true });
		} else if (event.key === 'n') {
			event.preventDefault();
			goto('/admin/pastes?s=new', { noScroll: true });
		} else if (event.key === '/') {
			event.preventDefault();
			searchEl?.focus();
		}
	}
</script>

<svelte:head><title>Pastes</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<div class="layout" data-detail={detail || undefined}>
	<section class="list" aria-label="Pastes">
		<header class="mb-6 flex items-center justify-between gap-4">
			<h1 class="text-xl font-semibold">Pastes</h1>
			<Button href="/admin/pastes?s=new" variant="primary" size="sm" data-sveltekit-noscroll>
				<Plus size={15} aria-hidden="true" />
				New
			</Button>
		</header>

		{#if data.pastes.length}
			<div class="relative mb-3">
				<Search
					size={15}
					class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
					aria-hidden="true"
				/>
				<input
					bind:this={searchEl}
					bind:value={query}
					type="search"
					placeholder="Search pastes"
					aria-label="Search pastes"
					class="{inputClass()} pl-9"
				/>
			</div>

			<p class="sr-only" role="status">
				{#if query.trim()}
					{visible.length}
					{visible.length === 1 ? 'paste' : 'pastes'} match “{query.trim()}”
				{/if}
			</p>
		{/if}

		{#if form?.created}
			<p
				role="status"
				class="mb-3 rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent"
			>
				ij5.dev/p/{form.created} is live — paste it anywhere.
			</p>
		{/if}

		{#if !data.pastes.length}
			<Empty
				title="No pastes yet"
				body="A paste is plaintext served at ij5.dev/p/… — configs, notes, logs, anything you want to share as text. Viewers get a clean page; curl gets the raw body."
			>
				{#snippet action()}
					<Button href="/admin/pastes?s=new" variant="primary" size="sm">Create the first one</Button>
				{/snippet}
			</Empty>
		{:else if !visible.length}
			<Empty title="Nothing matches" body="No paste contains “{query}”. Try a shorter search." />
		{:else}
			<ul class="rows">
				{#each visible as row (row.slug)}
					<li>
						<a
							href="/admin/pastes?s={row.slug}"
							data-sveltekit-noscroll
							aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
							class="row"
						>
							<span class="row-slug">
								/p/{row.slug}
								{#if row.expired}
									<span class="badge">Expired</span>
								{:else if !row.cache}
									<span class="badge" title="Every view reads KV fresh — edits win immediately.">
										No cache
									</span>
								{/if}
							</span>

							<span class="row-body">{snippet(row.body) || '\u200b'}</span>

							{#if row.note}
								<span class="row-note">{row.note}</span>
							{/if}

							<span class="row-size tnum" title="Size of the body">
								{fmtBytes(new TextEncoder().encode(row.body).length)}
							</span>

							<span class="row-hits tnum" title="Views in the last 7 days">
								{data.recent[row.slug] ?? 0}
							</span>

							<span class="row-date tnum">{fmtDay(row.created_at)}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<aside class="detail" aria-label="Paste details">
		<a href="/admin/pastes" data-sveltekit-noscroll class="back">
			<ChevronLeft size={16} aria-hidden="true" />
			All pastes
		</a>

		<div class="detail-pane">
			{#if creating}
				<h2 class="mb-5 text-lg font-semibold">New paste</h2>
				<PasteForm
					row={null}
					fields={form?.intent === 'create' ? form.fields : undefined}
					values={form?.intent === 'create' ? form.values : undefined}
					error={form?.error}
					onDone={() => goto('/admin/pastes', { noScroll: true })}
				/>
			{:else if data.selected}
				<h2 class="mb-1 text-lg font-semibold">/p/{data.selected.slug}</h2>
				<p class="mb-5 truncate text-sm text-text-muted">{snippet(data.selected.body)}</p>
				<PasteForm
					row={data.selected}
					fields={form?.intent === 'update' ? form.fields : undefined}
					values={form?.intent === 'update' ? form.values : undefined}
					error={form?.error}
					onDone={() => goto('/admin/pastes', { noScroll: true })}
				/>
			{:else}
				<p class="text-sm text-text-muted">
					Select a paste to edit it, or press <kbd class="kbd">n</kbd> for a new one.
				</p>
			{/if}
		</div>
	</aside>
</div>

<style>
	.layout {
		display: grid;
		gap: 2rem;
	}

	/* Below `lg` this is a drill-down: one of the two panes is showing. */
	.layout[data-detail] .list {
		display: none;
	}

	.layout:not([data-detail]) .detail {
		display: none;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 2.75rem;
		margin-block: -0.5rem 0.25rem;
		margin-inline-start: -0.25rem;
		padding-inline: 0.25rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		transition: color 150ms var(--ease-out);
	}

	.back:hover {
		color: var(--text);
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.125rem 0.75rem;
		padding: 0.875rem 1rem;
		border-radius: var(--radius-ui-lg);
		background-color: var(--surface);
		transition:
			background-color 150ms var(--ease-out),
			scale 150ms var(--ease-out);
	}

	.row:active {
		scale: 0.99;
	}

	.row-slug {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.row-body,
	.row-note {
		grid-column: 1;
		font-size: var(--text-xs);
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-body {
		font-family: var(--font-mono);
	}

	.row-size,
	.row-hits {
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		text-align: right;
	}

	.row-date {
		font-size: var(--text-xs);
		color: var(--text-muted);
		text-align: right;
	}

	.badge {
		border-radius: var(--radius-pill);
		background-color: var(--surface-sunken);
		padding: 0.0625rem 0.4375rem;
		font-size: var(--text-2xs);
		font-weight: 500;
		color: var(--text-muted);
	}

	.kbd {
		border-radius: 4px;
		background-color: var(--surface-sunken);
		padding: 0.0625rem 0.3125rem;
		font-family: var(--font-mono);
		font-size: var(--text-2xs);
	}

	@media (min-width: 768px) {
		.row {
			grid-template-columns: minmax(7rem, 12rem) minmax(0, 1fr) minmax(0, 1fr) 3.5rem 3.5rem 4rem;
			align-items: center;
			gap: 1rem;
			min-height: 2.5rem;
			padding-block: 0.625rem;
		}

		/* Every cell placed explicitly — auto-placement would scatter the
		   slug across the row (see the links list for the full story). */
		.row-slug {
			grid-area: 1 / 1;
		}
		.row-body {
			grid-area: 1 / 2;
		}
		.row-note {
			grid-area: 1 / 3;
		}
		.row-size {
			grid-area: 1 / 4;
		}
		.row-hits {
			grid-area: 1 / 5;
		}
		.row-date {
			grid-area: 1 / 6;
		}
	}

	@media (min-width: 1024px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 24rem;
			align-items: start;
		}

		.layout[data-detail] .list,
		.layout:not([data-detail]) .detail {
			display: block;
		}

		.back {
			display: none;
		}

		.detail {
			position: sticky;
			top: 2.5rem;
			border-radius: var(--radius-ui-lg);
			background-color: var(--surface);
			padding: 1.25rem;
		}
	}

	/* The drill-down entrance — same treatment as the links list. */
	@media (max-width: 1023px) {
		.detail-pane {
			animation: pane-rise 180ms var(--ease-out);
		}
	}
	@keyframes pane-rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (hover: hover) and (pointer: fine) {
		.row:hover {
			background-color: var(--surface-hover);
		}
	}

	.row[aria-current='true'] {
		box-shadow: inset 0 0 0 1px var(--accent);
	}
</style>
