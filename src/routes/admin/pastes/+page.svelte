<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Button from '$lib/ui/Button.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { fmtBytes, fmtDay } from '$lib/format';
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

<div class={masterLayout} data-detail={detail || undefined}>
	<section class={listPane} aria-label="Pastes">
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
			<ul class="flex flex-col gap-2">
				{#each visible as row (row.slug)}
					<li>
						<a
							href="/admin/pastes?s={row.slug}"
							data-sveltekit-noscroll
							aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
							class="{dataRow} md:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)_minmax(0,1fr)_3.5rem_3.5rem_4rem]"
						>
							<span class="flex items-center gap-2 font-mono text-sm font-semibold md:[grid-area:1/1]">
								/p/{row.slug}
								{#if row.expired}
									<span class={badge}>Expired</span>
								{:else if !row.cache}
									<span class={badge} title="Every view reads KV fresh — edits win immediately.">
										No cache
									</span>
								{/if}
							</span>

							<span class="col-start-1 truncate font-mono text-xs text-text-muted md:[grid-area:1/2]">{snippet(row.body) || '\u200b'}</span>

							{#if row.note}
								<span class="col-start-1 truncate text-xs text-text-muted md:[grid-area:1/3]">{row.note}</span>
							{/if}

							<span class="tnum text-right text-sm text-text-muted md:[grid-area:1/4]" title="Size of the body">
								{fmtBytes(new TextEncoder().encode(row.body).length)}
							</span>

							<span class="tnum text-right text-sm text-text-muted md:[grid-area:1/5]" title="Views in the last 7 days">
								{data.recent[row.slug] ?? 0}
							</span>

							<span class="tnum text-right text-xs text-text-muted md:[grid-area:1/6]">{fmtDay(row.created_at)}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<aside class={detailAside} aria-label="Paste details">
		<a href="/admin/pastes" data-sveltekit-noscroll class={backLink}>
			<ChevronLeft size={16} aria-hidden="true" />
			All pastes
		</a>

		<div class="max-lg:animate-pane-rise">
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
					Select a paste to edit it, or press <kbd class={kbd}>n</kbd> for a new one.
				</p>
			{/if}
		</div>
	</aside>
</div>

