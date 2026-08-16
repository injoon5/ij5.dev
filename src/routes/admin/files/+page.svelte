<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Button from '$lib/ui/Button.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { fmtBytes, fmtDate, fmtDay } from '$lib/format';
	import { inputClass, masterLayout, listPane, detailAside, backLink, dataRow, badge, kbd } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import FileForm from './FileForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);
	let copied = $state(false);

	const deleting = pending({ onSuccess: () => goto('/admin/files', { noScroll: true }) });

	// Deleting a file removes the bytes from R2 for good, so it asks first — the
	// same confirm the home asset list uses.
	const confirmDelete: import('@sveltejs/kit').SubmitFunction = (input) => {
		if (!confirm(`Delete ${data.selected?.name}? The bytes are removed from R2.`)) {
			input.cancel();
			return;
		}
		return deleting.submit(input);
	};

	let selection = $derived(page.url.searchParams.get('s'));
	let creating = $derived(selection === 'new');
	let detail = $derived(creating || Boolean(data.selected));

	let shareUrl = $derived(data.selected ? `${data.origin}/d/${data.selected.slug}` : '');

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(shareUrl);
		} catch {
			// Clipboard can be blocked; the field below is selectable anyway.
		}
		copied = true;
		setTimeout(() => (copied = false), 1600);
	};

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.files;
		return data.files.filter(
			(f) => f.name.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q)
		);
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const el = event.target as HTMLElement | null;
		if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;

		if (event.key === 'Escape' && detail) {
			event.preventDefault();
			goto('/admin/files', { noScroll: true });
		} else if (event.key === 'n') {
			event.preventDefault();
			goto('/admin/files?s=new', { noScroll: true });
		} else if (event.key === '/') {
			event.preventDefault();
			searchEl?.focus();
		}
	}
</script>

<svelte:head><title>Files</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<div class={masterLayout} data-detail={detail || undefined}>
	<section class={listPane} aria-label="Files">
		<header class="mb-6 flex items-center justify-between gap-4">
			<h1 class="text-xl font-semibold">Files</h1>
			<Button href="/admin/files?s=new" variant="primary" size="sm" data-sveltekit-noscroll>
				<Plus size={15} aria-hidden="true" />
				Upload
			</Button>
		</header>

		{#if data.files.length}
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
					placeholder="Search files"
					aria-label="Search files"
					class="{inputClass()} pl-9"
				/>
			</div>

			<p class="sr-only" role="status">
				{#if query.trim()}
					{visible.length}
					{visible.length === 1 ? 'file' : 'files'} match “{query.trim()}”
				{/if}
			</p>
		{/if}

		{#if form?.created}
			<p
				role="status"
				class="mb-3 rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent"
			>
				Shared at ij5.dev/d/{form.created}.
			</p>
		{/if}

		{#if !data.files.length}
			<Empty
				title="No files yet"
				body="A file is shared at ij5.dev/d/… — upload it, send the link, and the recipient downloads it straight from the edge. Files can expire and the link never exposes the bucket."
			>
				{#snippet action()}
					<Button href="/admin/files?s=new" variant="primary" size="sm">Upload the first one</Button>
				{/snippet}
			</Empty>
		{:else if !visible.length}
			<Empty title="Nothing matches" body="No file is named “{query}”. Try a shorter search." />
		{:else}
			<!-- A five-column row at `md`, a card below it. Cells are placed
			     explicitly at `md`; the phone drops the columns it has no room for. -->
			<ul class="flex flex-col gap-2">
				{#each visible as row (row.slug)}
					<li>
						<a
							href="/admin/files?s={row.slug}"
							data-sveltekit-noscroll
							aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
							class="{dataRow} md:grid-cols-[minmax(0,1.4fr)_minmax(6rem,1fr)_4.5rem_3rem_4rem]"
						>
							<span class="col-start-1 truncate text-sm font-semibold md:[grid-area:1/1]" title={row.name}>
								{row.name}
								{#if row.expired}
									<span class="{badge} ms-2">Expired</span>
								{/if}
							</span>

							<span class="col-start-1 font-mono text-xs text-text-muted md:[grid-area:1/2]">
								/d/{row.slug}
							</span>

							<span class="tnum text-right text-sm text-text-muted md:[grid-area:1/3]">
								{fmtBytes(row.bytes)}
							</span>

							<span class="tnum text-right text-sm text-text-muted md:[grid-area:1/4]" title="Downloads">
								{row.downloads}
							</span>

							<span class="tnum text-right text-xs text-text-muted md:[grid-area:1/5]">
								{fmtDay(row.created_at)}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<aside class={detailAside} aria-label="File details">
		<a href="/admin/files" data-sveltekit-noscroll class={backLink}>
			<ChevronLeft size={16} aria-hidden="true" />
			All files
		</a>

		<div class="max-lg:animate-pane-rise">
			{#if creating}
				<h2 class="mb-5 text-lg font-semibold">Share a file</h2>
				<FileForm
					fields={form?.intent === 'create' ? form.fields : undefined}
					values={form?.intent === 'create' ? form.values : undefined}
					error={form?.error}
					onDone={() => goto('/admin/files', { noScroll: true })}
				/>
			{:else if data.selected}
				<h2 class="mb-1 text-lg font-semibold" title={data.selected.name}>
					{data.selected.name}
				</h2>
				<p class="mb-4 text-xs text-text-muted">
					{fmtBytes(data.selected.bytes)} · {fmtDate(data.selected.created_at)}
					{data.selected.expires_at ? ` · expires ${fmtDate(data.selected.expires_at)}` : ''}
					{data.selected.expired ? ' · expired' : ''}
					{' '}· {data.selected.downloads}{data.selected.downloads === 1 ? ' download' : ' downloads'}
				</p>

				<label for="link" class="text-sm font-medium">Share link</label>
				<div class="mt-1.5 flex items-center gap-2">
					<input
						id="link"
						readonly
						value={shareUrl}
						onclick={(e) => e.currentTarget.select()}
						spellcheck="false"
						class="{inputClass()} font-mono text-xs"
					/>
					<Button variant="secondary" size="sm" onclick={copyLink}>
						{copied ? 'Copied' : 'Copy'}
					</Button>
				</div>

				<p class="mt-3 break-words text-xs text-text-subtle">
					<a
						href="/d/{data.selected.slug}"
						class="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-current"
					>
						Preview the page
					</a>
				</p>

				<form
					method="POST"
					action="?/delete"
					class="mt-6 border-t border-border-subtle pt-5"
					use:enhance={confirmDelete}
				>
					<input type="hidden" name="slug" value={data.selected.slug} />
					<div class="flex items-center justify-between gap-4">
						<p class="text-xs text-pretty text-text-muted">
							Deleting removes the bytes from R2. The link stops resolving immediately.
						</p>
						<Button type="submit" variant="danger" size="sm" busy={deleting.busy} busyLabel="Deleting…">
							Delete
						</Button>
					</div>
				</form>
			{:else}
				<p class="text-sm text-text-muted">
					Select a file to copy its link or delete it, or press <kbd class={kbd}>n</kbd> to upload.
				</p>
			{/if}
		</div>
	</aside>
</div>

