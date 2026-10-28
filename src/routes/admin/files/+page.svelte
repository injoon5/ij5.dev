<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
	import Plus from 'lucide-svelte/icons/plus';
	import Button from '$lib/ui/Button.svelte';
	import CopyButton from '$lib/ui/CopyButton.svelte';
	import DetailHeader from '$lib/ui/DetailHeader.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import MasterDetail from '$lib/ui/MasterDetail.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import SearchField from '$lib/ui/SearchField.svelte';
	import { fmtBytes, fmtDate, fmtDay } from '$lib/format';
	import { pending } from '$lib/ui/pending.svelte';
	import { listShortcuts } from '$lib/ui/shortcuts';
	import {
		badge,
		card,
		iconButton,
		kbd,
		notice,
		rowSub,
		rowTitle,
		table,
		tableBody,
		tableHead,
		tableRow
	} from '$lib/ui/styles';
	import FileForm from './FileForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);

	let creating = $derived(page.url.searchParams.get('s') === 'new');
	let open = $derived(creating || Boolean(data.selected));

	const deleting = pending({ onSuccess: () => goto('/admin/files', { noScroll: true }) });

	// The bytes go for good, so it asks first.
	const confirmDelete: SubmitFunction = (input) => {
		if (!confirm(`Delete “${data.selected?.name}”? This can’t be undone.`)) {
			input.cancel();
			return;
		}
		return deleting.submit(input);
	};

	let deleteError = $derived(
		form?.intent === 'delete' ? (form as { error?: string }).error : undefined
	);

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.files;
		return data.files.filter(
			(f) => f.name.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q)
		);
	});

	// Name, link, size, downloads, uploaded — shared by the header row and
	// every row so the columns can only line up.
	const cols = 'md:grid-cols-[minmax(0,1.6fr)_minmax(7rem,1fr)_4.5rem_5rem_4.5rem]';

	const onkeydown = listShortcuts('/admin/files', () => ({ open, search: searchEl }));
</script>

<svelte:head><title>Files</title></svelte:head>
<svelte:window {onkeydown} />

<MasterDetail {open} label="File">
	{#snippet list()}
		<PageHeader title="Files">
			{#snippet actions()}
				<Button
					href="/admin/files?s=new"
					variant="primary"
					size="sm"
					data-sveltekit-noscroll
					class="max-md:size-10 max-md:rounded-full max-md:px-0"
				>
					<Plus size={15} aria-hidden="true" class="max-md:size-5" />
					<span class="max-md:sr-only">Upload</span>
				</Button>
			{/snippet}
		</PageHeader>

		{#if !data.files.length}
			<Empty title="No files yet">
				{#snippet action()}
					<Button href="/admin/files?s=new" variant="primary" size="sm">Upload a file</Button>
				{/snippet}
			</Empty>
		{:else}
			<div class="px-4 pb-3 md:px-6 md:pt-3">
				<SearchField bind:value={query} bind:el={searchEl} label="Search files" />
			</div>

			<p class="sr-only" role="status">
				{#if query.trim()}
					{visible.length}
					{visible.length === 1 ? 'file matches' : 'files match'} “{query.trim()}”
				{/if}
			</p>

			{#if !visible.length}
				<Empty title="No files match “{query.trim()}”" />
			{:else}
				<div class={table}>
					<div class="{tableHead} {cols}" aria-hidden="true">
						<span>Name</span>
						<span>Link</span>
						<span class="text-right">Size</span>
						<span class="text-right">Downloads</span>
						<span class="text-right">Uploaded</span>
					</div>
					<ul class={tableBody}>
						{#each visible as row (row.slug)}
							<li>
								<a
									href="/admin/files?s={encodeURIComponent(row.slug)}"
									data-sveltekit-noscroll
									aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
									class="{tableRow} {cols}"
								>
									<span class="flex min-w-0 items-center gap-2 {rowTitle}">
										<span class="truncate" title={row.name}>{row.name}</span>
										{#if row.expired}
											<span class={badge}>Expired</span>
										{/if}
									</span>

									<span class="col-start-1 {rowSub} md:col-start-auto">/d/{row.slug}</span>

									<span
										class="col-start-2 row-start-2 text-right text-xs text-text-muted md:col-start-auto md:row-start-auto md:text-sm"
									>
										{fmtBytes(row.bytes)}
									</span>

									<span class="hidden text-right text-sm text-text-muted md:block">{row.downloads}</span>

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
			<DetailHeader title="Upload" close="/admin/files" backLabel="Files" />
			<div class="p-4 md:p-5">
				<FileForm
					fields={form?.intent === 'create' ? form.fields : undefined}
					values={form?.intent === 'create' ? form.values : undefined}
					error={form?.intent === 'create' ? form.error : undefined}
					onDone={(slug) =>
						goto(slug ? `/admin/files?s=${encodeURIComponent(slug)}` : '/admin/files', {
							noScroll: true
						})}
				/>
			</div>
		{:else if data.selected}
			{@const file = data.selected}
			{@const href = `/d/${file.slug}`}
			<DetailHeader title={file.name} close="/admin/files" backLabel="Files">
				{#snippet actions()}
					<CopyButton text="{page.url.origin}{href}" label="Copy link" />
					<a
						{href}
						target="_blank"
						rel="noopener"
						class={iconButton}
						aria-label="Open download page"
						title="Open download page"
					>
						<ArrowUpRight size={16} aria-hidden="true" />
					</a>
				{/snippet}
			</DetailHeader>

			<div class="flex flex-col gap-5 p-4 md:p-5">
				{#if deleteError}
					<p role="alert" class={notice.error}>{deleteError}</p>
				{/if}

				<dl class="{card} grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5 text-sm md:p-4">
					<dt class="text-text-muted">Link</dt>
					<dd class="truncate text-right">{page.url.host}{href}</dd>
					<dt class="text-text-muted">Size</dt>
					<dd class="text-right">{fmtBytes(file.bytes)}</dd>
					<dt class="text-text-muted">Uploaded</dt>
					<dd class="text-right">{fmtDate(file.created_at)}</dd>
					<dt class="text-text-muted">Expires</dt>
					<dd class="text-right {file.expired ? 'text-danger' : ''}">
						{file.expires_at ? fmtDate(file.expires_at) : 'Never'}
					</dd>
					<dt class="text-text-muted">Downloads</dt>
					<dd class="text-right">{file.downloads}</dd>
				</dl>

				<form
					method="POST"
					action="?/delete"
					class="flex md:border-t md:border-border-subtle md:pt-4"
					use:enhance={confirmDelete}
				>
					<input type="hidden" name="slug" value={file.slug} />
					<Button
						type="submit"
						variant="danger"
						size="form"
						class="md:-ms-3"
						busy={deleting.busy}
						busyLabel="Deleting…"
					>
						Delete
					</Button>
				</form>
			</div>
		{:else}
			<div class="grid h-full min-h-40 place-items-center p-8 text-center max-lg:hidden">
				<p class="text-sm text-text-muted">
					Select a file, or press <kbd class={kbd}>N</kbd> to upload one.
				</p>
			</div>
		{/if}
	{/snippet}
</MasterDetail>
