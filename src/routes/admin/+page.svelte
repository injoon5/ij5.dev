<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Button from '$lib/ui/Button.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { fmtDay } from '$lib/format';
	import { inputClass } from '$lib/ui/styles';
	import LinkForm from './LinkForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);

	let selection = $derived(page.url.searchParams.get('s'));
	let creating = $derived(selection === 'new');
	let detail = $derived(creating || Boolean(data.selected));

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.slugs;
		return data.slugs.filter(
			(s) =>
				s.slug.toLowerCase().includes(q) ||
				s.target_url.toLowerCase().includes(q) ||
				(s.note ?? '').toLowerCase().includes(q)
		);
	});

	// A mailto: or tel: destination has no hostname; show the whole thing
	// rather than a blank cell where the host would be.
	const host = (url: string) => {
		try {
			const parsed = new URL(url);
			if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
				return parsed.hostname.replace(/^www\./, '');
			}
			return url;
		} catch {
			return url;
		}
	};

	const isExpired = (row: { expires_at: number | null }) =>
		row.expires_at !== null && row.expires_at < Date.now();

	function onKeydown(event: KeyboardEvent) {
		// `Cmd+N`, `Ctrl+/` and friends belong to the browser.
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const el = event.target as HTMLElement | null;
		if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;

		if (event.key === 'Escape' && detail) {
			event.preventDefault();
			goto('/admin', { noScroll: true });
		} else if (event.key === 'n') {
			event.preventDefault();
			goto('/admin?s=new', { noScroll: true });
		} else if (event.key === '/') {
			event.preventDefault();
			searchEl?.focus();
		}
	}
</script>

<svelte:head><title>Links</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<div class="layout" data-detail={detail || undefined}>
	<section class="list" aria-label="Links">
		<header class="mb-6 flex items-center justify-between gap-4">
			<h1 class="text-xl font-semibold">Links</h1>
			<Button href="/admin?s=new" variant="primary" size="sm" data-sveltekit-noscroll>
				<Plus size={15} aria-hidden="true" />
				New
			</Button>
		</header>

		{#if data.slugs.length}
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
					placeholder="Search links"
					aria-label="Search links"
					class="{inputClass()} pl-9"
				/>
			</div>

			<!-- The list rewrites itself as you type; without this nothing says so. -->
			<p class="sr-only" role="status">
				{#if query.trim()}
					{visible.length}
					{visible.length === 1 ? 'link' : 'links'} match “{query.trim()}”
				{/if}
			</p>
		{/if}

		{#if form?.created}
			<p
				role="status"
				class="mb-3 rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent"
			>
				ij5.dev/{form.created} is live.
			</p>
		{/if}

		{#if !data.slugs.length}
			<Empty
				title="No links yet"
				body="A link is a short slug pointing somewhere longer. Redirects resolve at the edge without touching the database."
			>
				{#snippet action()}
					<Button href="/admin?s=new" variant="primary" size="sm">Create the first one</Button>
				{/snippet}
			</Empty>
		{:else if !visible.length}
			<Empty title="Nothing matches" body="No link contains “{query}”. Try a shorter search." />
		{:else}
			<!-- A table at `md` and up, cards below it. The mobile card list is
			     not a narrower table: the columns that do not fit are the ones a
			     phone does not need. -->
			<ul class="rows">
				{#each visible as row (row.slug)}
					<li>
						<a
							href="/admin?s={row.slug}"
							data-sveltekit-noscroll
							aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
							class="row"
						>
							<span class="row-slug">
								/{row.slug}
								{#if isExpired(row)}
									<span class="badge">Expired</span>
								{:else if row.status === 301}
									<span class="badge">301</span>
								{/if}
							</span>

							<span class="row-target">{host(row.target_url)}</span>

							{#if row.note}
								<span class="row-note">{row.note}</span>
							{/if}

							<span class="row-hits tnum" title="Clicks in the last 7 days">
								{data.recent[row.slug] ?? 0}
							</span>

							<span class="row-date tnum">{fmtDay(row.created_at)}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!--
		Master–detail, not drill-down: on a wide screen the list stays put and
		the form renders beside it. On a phone the same URL shows the form on
		its own, which is the behaviour a phone actually wants.
	-->
	<aside class="detail" aria-label="Link details">
		<!--
			Below `lg` the list is hidden while this pane is up, so this is the only
			way back to it. Creating a link had no way back at all.
		-->
		<a href="/admin" data-sveltekit-noscroll class="back">
			<ChevronLeft size={16} aria-hidden="true" />
			All links
		</a>

		<div class="detail-pane">
			{#if creating}
					<h2 class="mb-5 text-lg font-semibold">New link</h2>
					<LinkForm
						row={null}
						fields={form?.intent === 'create' ? form.fields : undefined}
						values={form?.intent === 'create' ? form.values : undefined}
						error={form?.error}
						onDone={() => goto('/admin', { noScroll: true })}
					/>
				{:else if data.selected}
					<h2 class="mb-1 text-lg font-semibold">/{data.selected.slug}</h2>
					<p class="mb-5 truncate text-sm text-text-muted">{data.selected.target_url}</p>
					<LinkForm
						row={data.selected}
						fields={form?.intent === 'update' ? form.fields : undefined}
						values={form?.intent === 'update' ? form.values : undefined}
						error={form?.error}
						onDone={() => goto('/admin', { noScroll: true })}
					/>
				{:else}
					<p class="text-sm text-text-muted">
						Select a link to edit it, or press <kbd class="kbd">n</kbd> for a new one.
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
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.row-target,
	.row-note {
		grid-column: 1;
		font-size: var(--text-xs);
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-hits {
		grid-row: 1;
		grid-column: 2;
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
	}

	.row-date {
		grid-row: 2;
		grid-column: 2;
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

	/* Sunken: this sits inside a `--surface` panel. */
	.kbd {
		border-radius: 4px;
		background-color: var(--surface-sunken);
		padding: 0.0625rem 0.3125rem;
		font-family: var(--font-mono);
		font-size: var(--text-2xs);
	}

	@media (min-width: 768px) {
		/* The columns that did not fit on a phone: destination, note, clicks
		   and created, all on one 40px row. */
		.row {
			grid-template-columns: minmax(7rem, 12rem) minmax(0, 1fr) minmax(0, 1fr) 3.5rem 4rem;
			align-items: center;
			gap: 1rem;
			min-height: 2.5rem;
			padding-block: 0.625rem;
		}

		/*
		   Every cell is placed explicitly. Naming only some of them left the
		   slug as the one item with no definite row, so auto-placement filled
		   the row with the positioned cells first and dropped the slug into
		   whatever was left — the last column. The row then read
		   host · note · clicks · date · slug, putting the identifier you
		   actually scan for at the far right, and putting visual order at odds
		   with the DOM order screen readers follow.
		*/
		.row-slug {
			grid-area: 1 / 1;
		}
		.row-target {
			grid-area: 1 / 2;
		}
		.row-note {
			grid-area: 1 / 3;
		}

		.row-hits {
			grid-area: 1 / 4;
			text-align: right;
		}

		.row-date {
			grid-area: 1 / 5;
			text-align: right;
		}
	}

	@media (min-width: 1024px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 24rem;
			align-items: start;
		}

		/* Both panes are always present on a wide screen. */
		.layout[data-detail] .list,
		.layout:not([data-detail]) .detail {
			display: block;
		}

		/* The list never leaves, so there is nothing to go back to. */
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

	/*
	 * The drill-down entrance. Below `lg` the pane is a new screen that the
	 * router hides with `display: none` when no link is selected — and a CSS
	 * animation restarts the moment an element becomes rendered, so this plays
	 * every time a row opens, with no JavaScript. On a wide screen the pane is
	 * always present and the animation is gated off entirely.
	 *
	 * Transform and opacity only, 180ms, the same ease the surfaces press with.
	 * `prefers-reduced-motion` zeroes the duration globally (app.css), so the
	 * pane simply appears there.
	 */
	/* The drill-down entrance. Below `lg` the pane is a new screen that the
	   router hides with `display: none` when no link is selected — and a CSS
	   animation restarts the moment an element becomes rendered, so this plays
	   every time a row opens, with no JavaScript. On a wide screen the pane is
	   always present, so the animation is gated off entirely.

	   Transform and opacity only, 180ms, the same ease the surfaces press
	   with. `prefers-reduced-motion` zeroes the duration globally (app.css),
	   so the pane simply appears there. */
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
