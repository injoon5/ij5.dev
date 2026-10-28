<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Plus from 'lucide-svelte/icons/plus';
	import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
	import Button from '$lib/ui/Button.svelte';
	import CopyButton from '$lib/ui/CopyButton.svelte';
	import DetailHeader from '$lib/ui/DetailHeader.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import MasterDetail from '$lib/ui/MasterDetail.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import SearchField from '$lib/ui/SearchField.svelte';
	import { fmtBytes, fmtDay } from '$lib/format';
	import { listShortcuts } from '$lib/ui/shortcuts';
	import { badge, iconButton, kbd, rowTitle, table, tableHead, tableRow } from '$lib/ui/styles';
	import PasteForm from './PasteForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);

	let creating = $derived(page.url.searchParams.get('s') === 'new');
	let open = $derived(creating || Boolean(data.selected));

	/** The opening of the body, collapsed to one line — enough to recognise. */
	const snippet = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 120);

	const encoder = new TextEncoder();

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.pastes;
		return data.pastes.filter(
			(p) =>
				p.slug.toLowerCase().includes(q) ||
				p.body.toLowerCase().includes(q) ||
				(p.note ?? '').toLowerCase().includes(q)
		);
	});

	// Name, opening, note, views, size, created — shared by the header row and
	// every row so the columns can only line up.
	const cols =
		'md:grid-cols-[minmax(7rem,12rem)_minmax(0,1.4fr)_minmax(0,1fr)_3.5rem_4.5rem_4.5rem]';

	const onkeydown = listShortcuts('/admin/pastes', () => ({ open, search: searchEl }));
</script>
<svelte:head><title>Pastes</title></svelte:head>
<svelte:window {onkeydown} />

<MasterDetail {open} label="Paste">
	{#snippet list()}
		<PageHeader title="Pastes">
			{#snippet actions()}
				<Button href="/admin/pastes?s=new" variant="primary" size="sm" data-sveltekit-noscroll>
					<Plus size={15} aria-hidden="true" />
					New paste
				</Button>
			{/snippet}
		</PageHeader>

		{#if !data.pastes.length}
			<Empty title="No pastes yet">
				{#snippet action()}
					<Button href="/admin/pastes?s=new" variant="primary" size="sm">Create a paste</Button>
				{/snippet}
			</Empty>
		{:else}
			<div class="px-4 py-3 md:px-6">
				<SearchField bind:value={query} bind:el={searchEl} label="Search pastes" />
			</div>

			<p class="sr-only" role="status">
				{#if query.trim()}
					{visible.length}
					{visible.length === 1 ? 'paste matches' : 'pastes match'} “{query.trim()}”
				{/if}
			</p>

			{#if !visible.length}
				<Empty title="No pastes match “{query.trim()}”" />
			{:else}
				<div class={table}>
					<div class="{tableHead} {cols}" aria-hidden="true">
						<span>Paste</span>
						<span>Text</span>
						<span>Note</span>
						<span class="text-right" title="Views in the last 7 days">Views</span>
						<span class="text-right">Size</span>
						<span class="text-right">Created</span>
					</div>
					<ul>
						{#each visible as row (row.slug)}
							{@const views = data.recent[row.slug] ?? 0}
							<li>
								<a
									href="/admin/pastes?s={encodeURIComponent(row.slug)}"
									data-sveltekit-noscroll
									aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
									class="{tableRow} {cols}"
								>
									<span class="flex min-w-0 items-center gap-2 {rowTitle}">
										<span class="truncate">/p/{row.slug}</span>
										{#if row.expired}
											<span class={badge}>Expired</span>
										{:else if !row.cache}
											<span class={badge} title="Served fresh on every view">Uncached</span>
										{/if}
									</span>

									<span
										class="col-start-1 truncate font-mono text-xs text-text-muted md:col-start-auto"
									>
										{snippet(row.body) || '​'}
									</span>

									<span class="hidden truncate text-sm text-text-muted md:block">{row.note ?? ''}</span>

									<span
										class="col-start-2 row-start-2 text-right text-xs text-text-muted md:col-start-auto md:row-start-auto md:text-sm"
									>
										{views}<span class="md:sr-only">&nbsp;{views === 1 ? 'view' : 'views'}</span>
									</span>

									<span class="hidden text-right text-sm text-text-muted md:block">
										{fmtBytes(encoder.encode(row.body).length)}
									</span>

									<span
										class="col-start-2 row-start-1 text-right text-xs text-text-subtle md:col-start-auto md:row-start-auto md:text-sm md:text-text-muted"
									>
										{fmtDay(row.created_at)}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}
	{/snippet}

	{#snippet detail()}
		{#if creating}
			<DetailHeader title="New paste" close="/admin/pastes" backLabel="Pastes" />
			<div class="p-4 md:p-5">
				<PasteForm
					row={null}
					fields={form?.intent === 'create' ? form.fields : undefined}
					values={form?.intent === 'create' ? form.values : undefined}
					error={form?.intent === 'create' ? form.error : undefined}
					onDone={(slug) =>
						goto(slug ? `/admin/pastes?s=${encodeURIComponent(slug)}` : '/admin/pastes', {
							noScroll: true
						})}
				/>
			</div>
		{:else if data.selected}
			{@const href = `/p/${data.selected.slug}`}
			<DetailHeader title="/p/{data.selected.slug}" close="/admin/pastes" backLabel="Pastes">
				{#snippet actions()}
					<CopyButton text="{page.url.origin}{href}" label="Copy link" />
					<a
						{href}
						target="_blank"
						rel="noopener"
						class={iconButton}
						aria-label="Open paste"
						title="Open paste"
					>
						<ArrowUpRight size={16} aria-hidden="true" />
					</a>
				{/snippet}
			</DetailHeader>
			<div class="p-4 md:p-5">
				{#key data.selected.slug}
					<PasteForm
						row={data.selected}
						fields={form?.intent === 'update' ? form.fields : undefined}
						values={form?.intent === 'update' ? form.values : undefined}
						error={form?.intent === 'update' || form?.intent === 'delete' ? form.error : undefined}
						onDone={() => goto('/admin/pastes', { noScroll: true })}
					/>
				{/key}
			</div>
		{:else}
			<div class="grid h-full min-h-40 place-items-center p-8 text-center max-lg:hidden">
				<p class="text-sm text-text-muted">
					Select a paste, or press <kbd class={kbd}>N</kbd> to create one.
				</p>
			</div>
		{/if}
	{/snippet}
</MasterDetail>
