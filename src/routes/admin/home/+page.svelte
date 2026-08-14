<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Rocket from 'lucide-svelte/icons/rocket';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Undo from 'lucide-svelte/icons/undo-2';
	import Button from '$lib/ui/Button.svelte';
	import { pending } from '$lib/ui/pending.svelte';
	import type { AssetRow } from '$lib/types';
	import type { ActionData, PageData } from './$types';
	import IdentityForm from './IdentityForm.svelte';
	import PageEditor from './PageEditor.svelte';
	import FileList from './FileList.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The editing buffer. Seeded once from the draft; a save round-trip does not
	// overwrite what someone is still typing.
	// svelte-ignore state_referenced_locally
	let content = $state(data.draft.markdown ?? '');
	let textarea = $state<HTMLTextAreaElement | null>(null);

	// The uploaded files. Seeded from the load, then mutated locally by uploads
	// and deletes. When the page load re-runs (after a save/publish/revert),
	// the server list is authoritative and re-seeds this — otherwise a delete
	// elsewhere would linger in the client's copy. The effect tracks only the
	// server list, never the local one, so an optimistic upload or delete is
	// not undone by its own write.
	// svelte-ignore state_referenced_locally
	let files = $state<AssetRow[]>(data.files);
	$effect(() => {
		const serverFiles = data.files;
		untrack(() => {
			if (serverFiles !== files) files = serverFiles;
		});
	});

	const publishing = pending();
	const reverting = pending();
	const clearing = pending();

	function onUploaded(meta: Omit<AssetRow, 'at'> & { at: number }) {
		files = [meta, ...files];
	}

	function insertAtCursor(snippet: string) {
		const el = textarea;
		if (!el) {
			content += snippet;
			return;
		}
		const start = el.selectionStart ?? content.length;
		const end = el.selectionEnd ?? content.length;
		content = content.slice(0, start) + snippet + content.slice(end);
		queueMicrotask(() => {
			el.focus();
			const pos = start + snippet.length;
			el.setSelectionRange(pos, pos);
		});
	}

	function insertImageKey(key: string) {
		insertAtCursor(`\n\n![photo](${key})\n\n`);
	}

	function insertGalleryRow(key: string) {
		// If the cursor sits inside a :::gallery block the key is just another
		// row, so append it there; otherwise seed a fresh block at the cursor.
		// `lastIndexOf` finds the gallery nearest the cursor rather than blindly
		// using the first one in the document, and `close > start` confirms the
		// cursor is actually inside it before appending.
		const start = textarea?.selectionStart ?? content.length;
		const open = content.lastIndexOf(':::gallery', start);
		const close = open >= 0 ? content.indexOf('\n:::', open + 9) : -1;
		if (open >= 0 && close > start) {
			content = content.slice(0, close + 1) + key + '\n' + content.slice(close + 1);
		} else {
			insertAtCursor(`\n\n:::gallery\n${key}\n:::\n\n`);
		}
	}
</script>

<svelte:head><title>Home</title></svelte:head>

<header class="mb-6 flex flex-wrap items-center justify-between gap-3">
	<div>
		<h1 class="text-xl font-semibold">Home</h1>
		<p class="mt-0.5 text-xs text-text-muted">
			{#if data.dirty}
				Draft has unpublished changes · live version {data.publishedVersion}
			{:else}
				Published · version {data.publishedVersion}
			{/if}
		</p>
	</div>

	<div class="flex items-center gap-2">
		{#if data.canRevert}
			<form method="POST" action="?/revert" use:enhance={reverting.submit}>
				<Button type="submit" variant="ghost" size="sm" busy={reverting.busy} busyLabel="Reverting…">
					<Undo size={14} aria-hidden="true" />
					Revert
				</Button>
			</form>
		{/if}

		<form method="POST" action="?/clear" use:enhance={clearing.submit}>
			<Button
				type="submit"
				variant="ghost"
				size="sm"
				disabled={data.publishedVersion === 0}
				busy={clearing.busy}
				busyLabel="Clearing…"
				title="Re-render the homepage everywhere without publishing an edit"
			>
				<RefreshCw size={14} aria-hidden="true" />
				Clear cache
			</Button>
		</form>

		<form method="POST" action="?/publish" use:enhance={publishing.submit}>
			<Button
				type="submit"
				variant="primary"
				size="sm"
				disabled={!data.dirty}
				busy={publishing.busy}
				busyLabel="Publishing…"
			>
				<Rocket size={14} aria-hidden="true" />
				Publish
			</Button>
		</form>
	</div>
</header>

{#if form?.published}
	<p role="status" class="mb-4 rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent">
		Version {form.published} is live everywhere.
	</p>
{:else if form?.reverted}
	<p role="status" class="mb-4 rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent">
		Rolled back. Version {form.reverted} is live.
	</p>
{:else if form?.cleared}
	<p role="status" class="mb-4 rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent">
		Cache cleared — version {form.cleared} is being re-rendered everywhere.
	</p>
{:else if form?.error}
	<p role="alert" class="mb-4 rounded-[var(--radius-ui)] bg-danger-tint px-3 py-2 text-sm text-danger">
		{form.error}
	</p>
{/if}

<div class="editor">
	<IdentityForm draft={data.draft.profile} assetsOrigin={data.assetsOrigin} {form} />

	<PageEditor
		bind:content
		bind:textarea
		assetsOrigin={data.assetsOrigin}
		insert={insertAtCursor}
		{onUploaded}
	/>

	<FileList bind:files assetsOrigin={data.assetsOrigin} onInsert={insertImageKey} onGallery={insertGalleryRow} />
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}
</style>
