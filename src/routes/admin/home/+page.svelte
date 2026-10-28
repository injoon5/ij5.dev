<script lang="ts">
	import { untrack } from 'svelte';
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Ellipsis from 'lucide-svelte/icons/ellipsis';
	import Button from '$lib/ui/Button.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { pending } from '$lib/ui/pending.svelte';
	import { iconButton, notice } from '$lib/ui/styles';
	import type { AssetRow } from '$lib/types';
	import type { ActionData, PageData } from './$types';
	import IdentityForm from './IdentityForm.svelte';
	import PageEditor from './PageEditor.svelte';
	import FileList from './FileList.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The editing buffer, seeded once from the draft. A save round trip does
	// not overwrite what someone is still typing; a revert does (below).
	// svelte-ignore state_referenced_locally
	let content = $state(data.draft.markdown ?? '');
	let textarea = $state<HTMLTextAreaElement | null>(null);

	let profileDirty = $state(false);
	let profileForm = $state<HTMLFormElement | null>(null);
	let saveForm = $state<HTMLFormElement | null>(null);
	let menu = $state<HTMLDetailsElement | null>(null);

	let contentDirty = $derived(content !== (data.draft.markdown ?? ''));
	let unsaved = $derived(contentDirty || profileDirty);

	// One status, most urgent first. "Unsaved" is about this browser tab;
	// "unpublished" is the saved draft against what visitors see.
	let status = $derived(
		unsaved
			? { label: 'Unsaved changes', dot: 'bg-warning' }
			: !data.publishedVersion
				? { label: 'Not published yet', dot: 'bg-text-subtle' }
				: data.dirty
					? { label: 'Unpublished changes', dot: 'bg-accent' }
					: { label: 'Published', dot: 'bg-success' }
	);

	// The uploaded images. Seeded from the load, then changed locally by
	// uploads and deletes. When the load re-runs the server list wins — a
	// delete elsewhere must not linger here — and the effect tracks only the
	// server list, so a local change is not undone by its own write.
	// svelte-ignore state_referenced_locally
	let files = $state<AssetRow[]>(data.files);
	$effect(() => {
		const serverFiles = data.files;
		untrack(() => {
			if (serverFiles !== files) files = serverFiles;
		});
	});

	const saving = pending();
	const clearing = pending({ onSuccess: () => menu?.removeAttribute('open') });
	const reverting = pending({
		onSuccess: () => {
			// The revert rewrote the draft; the buffer follows it.
			content = data.draft.markdown ?? '';
			profileDirty = false;
			menu?.removeAttribute('open');
		}
	});
	const publishing = pending({ onSuccess: () => (profileDirty = false) });

	const confirmRevert: SubmitFunction = (input) => {
		if (!confirm('Put the previously published version back live? The current one is kept, so this can be undone.')) {
			input.cancel();
			return;
		}
		return reverting.submit(input);
	};

	/**
	 * Publish ships what is on screen. The page text rides along in this
	 * form; unsaved profile edits live in their own form, so they are saved
	 * first — and if that save is rejected, nothing is published and the
	 * profile's errors show where they belong.
	 */
	const publish: SubmitFunction = async (input) => {
		if (profileDirty && profileForm) {
			const res = await fetch('?/profile', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: new FormData(profileForm)
			});
			const result = deserialize(await res.text());
			if (result.type !== 'success') {
				input.cancel();
				await applyAction(result);
				return;
			}
			profileDirty = false;
		}
		return publishing.submit(input);
	};

	// ⌘S / Ctrl+S saves the draft, the way every editor does.
	function onkeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			if (contentDirty) saveForm?.requestSubmit();
			if (profileDirty) profileForm?.requestSubmit();
		}
	}

	// Never lose typing to a stray click: leaving with unsaved edits asks.
	beforeNavigate(({ cancel, type }) => {
		if (!unsaved || type === 'leave') return;
		if (!confirm('Leave without saving? Your changes will be lost.')) cancel();
	});

	function onbeforeunload(event: BeforeUnloadEvent) {
		if (unsaved) event.preventDefault();
	}

	// A click anywhere outside the overflow menu closes it.
	function onclick(event: MouseEvent) {
		if (menu?.open && !menu.contains(event.target as Node)) menu.removeAttribute('open');
	}

	function onUploaded(meta: Omit<AssetRow, 'at'> & { at: number }) {
		if (!files.some((f) => f.key === meta.key)) files = [meta, ...files];
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
		insertAtCursor(`\n\n![](${key})\n\n`);
	}

	function insertGalleryRow(key: string) {
		// Inside a :::gallery block the key is just another row, so it goes
		// there; otherwise a fresh block starts at the cursor. `lastIndexOf`
		// finds the gallery nearest the cursor, and `close > start` confirms
		// the cursor is actually inside it.
		const start = textarea?.selectionStart ?? content.length;
		const open = content.lastIndexOf(':::gallery', start);
		const close = open >= 0 ? content.indexOf('\n:::', open + 9) : -1;
		if (open >= 0 && close > start) {
			content = content.slice(0, close + 1) + key + '\n' + content.slice(close + 1);
		} else {
			insertAtCursor(`\n\n:::gallery\n${key}\n:::\n\n`);
		}
	}

	const menuItem =
		'flex w-full items-center rounded-[var(--radius-ui-sm)] px-2.5 py-2 text-left text-sm transition-colors duration-100 ease-out hover:bg-row-active disabled:pointer-events-none disabled:opacity-45 pointer-coarse:py-3';
</script>

<svelte:head><title>Home</title></svelte:head>
<svelte:window {onkeydown} {onbeforeunload} {onclick} />

<PageHeader title="Home">
	{#snippet meta()}
		<span class="flex items-center gap-1.5 text-xs whitespace-nowrap text-text-muted" role="status">
			<span class="size-1.5 rounded-full {status.dot}" aria-hidden="true"></span>
			{status.label}
		</span>
	{/snippet}
	{#snippet actions()}
		<!-- The rarely-used, consequential actions live behind one button. -->
		<details bind:this={menu} class="relative">
			<summary class="{iconButton} list-none [&::-webkit-details-marker]:hidden" aria-label="More actions" title="More actions">
				<Ellipsis size={16} aria-hidden="true" />
			</summary>
			<div
				class="absolute top-full right-0 z-20 mt-1.5 w-60 origin-top-right rounded-[var(--radius-ui)] bg-surface p-1 shadow-[var(--shadow-pop)] starting:scale-95 starting:opacity-0 transition-[opacity,scale] duration-150 ease-out"
			>
				<form method="POST" action="?/revert" use:enhance={confirmRevert}>
					<button type="submit" class={menuItem} disabled={!data.canRevert || reverting.busy}>
						{reverting.busy ? 'Reverting…' : 'Revert to previous version'}
					</button>
				</form>
				<form method="POST" action="?/clear" use:enhance={clearing.submit}>
					<button
						type="submit"
						class={menuItem}
						disabled={!data.publishedVersion || clearing.busy}
						title="Re-render the live page everywhere without publishing an edit"
					>
						{clearing.busy ? 'Clearing…' : 'Clear cache'}
					</button>
				</form>
			</div>
		</details>

		<form bind:this={saveForm} method="POST" action="?/save" use:enhance={saving.submit}>
			<input type="hidden" name="content" value={content} />
			<Button type="submit" variant="secondary" size="sm" disabled={!contentDirty} busy={saving.busy} busyLabel="Saving…">
				Save
			</Button>
		</form>

		<form method="POST" action="?/publish" use:enhance={publish}>
			<input type="hidden" name="content" value={content} />
			<Button
				type="submit"
				variant="primary"
				size="sm"
				disabled={!unsaved && !data.dirty}
				busy={publishing.busy}
				busyLabel="Publishing…"
			>
				Publish
			</Button>
		</form>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-8 px-4 pt-2 pb-8 md:px-6 md:pt-6">
	{#if form?.published}
		<p role="status" class={notice.ok}>Published. The live page is up to date.</p>
	{:else if form?.reverted}
		<p role="status" class={notice.ok}>The previous version is live again.</p>
	{:else if form?.cleared}
		<p role="status" class={notice.ok}>Cache cleared. The live page re-renders on the next visit.</p>
	{:else if form && 'error' in form && form.error}
		<p role="alert" class={notice.error}>{form.error}</p>
	{/if}

	<IdentityForm
		draft={data.draft.profile}
		assetsOrigin={data.assetsOrigin}
		fields={form?.intent === 'profile' ? form.fields : undefined}
		bind:dirty={profileDirty}
		bind:formEl={profileForm}
	/>

	<PageEditor
		bind:content
		bind:textarea
		assetsOrigin={data.assetsOrigin}
		insert={insertAtCursor}
		{onUploaded}
	/>

	<FileList bind:files assetsOrigin={data.assetsOrigin} onInsert={insertImageKey} onGallery={insertGalleryRow} />
</div>
