<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Button from '$lib/ui/Button.svelte';
	import Empty from '$lib/ui/Empty.svelte';
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

	const fmtDate = (ms: number) =>
		new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(ms);

	const host = (url: string) => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	};

	const isExpired = (row: { expires_at: number | null }) =>
		row.expires_at !== null && row.expires_at < Date.now();

	function onKeydown(event: KeyboardEvent) {
		const el = event.target as HTMLElement | null;
		const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

		if (event.key === 'Escape' && detail) {
			goto('/admin', { noScroll: true });
			return;
		}
		if (typing) return;

		if (event.key === 'n') {
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
		<!-- `mb-6` under a page title, the same as Bento, Analytics and API. -->
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
					class="{inputClass} pl-9"
				/>
			</div>
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

							<span class="row-date tnum">{fmtDate(row.created_at)}</span>
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
		color: var(--text-subtle);
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

	/* Sunken, not `--surface`: this keycap lives inside a `--surface` panel, so
	   painting it the same colour as its container left the `n` as bare
	   monospace text with no key around it at all. A key is also a thing you
	   press in, which is the treatment it should have had anyway. */
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

		/* 1.25rem, like every other panel in the product. This one was 1.5rem —
		   the kind of difference nobody can name and everybody can feel when the
		   detail pane sits beside a list of rows padded to the other value. */
		.detail {
			position: sticky;
			top: 2.5rem;
			border-radius: var(--radius-ui-lg);
			background-color: var(--surface);
			padding: 1.25rem;
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
