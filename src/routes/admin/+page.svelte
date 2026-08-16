<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Button from '$lib/ui/Button.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { fmtDay } from '$lib/format';
	import {
		inputClass,
		masterLayout,
		listPane,
		detailAside,
		backLink,
		dataRow,
		badge,
		kbd
	} from '$lib/ui/styles';
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

<!-- Master–detail. Below `lg` it is a drill-down: `data-detail` on the layout
     hides whichever pane is not showing. At `lg` both panes are always up. -->
<div class={masterLayout} data-detail={detail || undefined}>
	<section class={listPane} aria-label="Links">
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
			<!-- A five-column row at `md` and up, a two-column card below it. The
			     mobile card is not a narrower table: the columns that do not fit
			     are the ones a phone does not need. Every cell is placed
			     explicitly at `md` so the DOM order (what a screen reader follows)
			     and the visual order stay identical — slug first, never last. -->
			<ul class="flex flex-col gap-2">
				{#each visible as row (row.slug)}
					<li>
						<a
							href="/admin?s={row.slug}"
							data-sveltekit-noscroll
							aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
							class="{dataRow} md:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)_minmax(0,1fr)_3.5rem_4rem]"
						>
							<span class="flex items-center gap-2 text-sm font-semibold md:[grid-area:1/1]">
								/{row.slug}
								{#if row.expired}
									<span class={badge}>Expired</span>
								{:else if row.status === 301}
									<span class={badge}>301</span>
								{/if}
							</span>

							<span class="col-start-1 truncate text-xs text-text-muted md:[grid-area:1/2]">
								{host(row.target_url)}
							</span>

							{#if row.note}
								<span class="col-start-1 truncate text-xs text-text-muted md:[grid-area:1/3]">
									{row.note}
								</span>
							{/if}

							<span
								class="tnum col-start-2 row-start-1 text-sm text-text-muted md:[grid-area:1/4] md:text-right"
								title="Clicks in the last 7 days"
							>
								{data.recent[row.slug] ?? 0}
							</span>

							<span
								class="tnum col-start-2 row-start-2 text-right text-xs text-text-muted md:[grid-area:1/5]"
							>
								{fmtDay(row.created_at)}
							</span>
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
	<aside class={detailAside} aria-label="Link details">
		<!-- Below `lg` the list is hidden while this pane is up, so this back link
		     is the only way to it. Creating a link had no way back at all. -->
		<a href="/admin" data-sveltekit-noscroll class={backLink}>
			<ChevronLeft size={16} aria-hidden="true" />
			All links
		</a>

		<div class="max-lg:animate-pane-rise">
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
						Select a link to edit it, or press <kbd class={kbd}>n</kbd> for a new one.
					</p>
				{/if}
			</div>
		</aside>
</div>

