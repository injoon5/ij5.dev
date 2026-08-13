<script lang="ts">
	import { enhance } from '$app/forms';
	import ImagePlus from 'lucide-svelte/icons/image-plus';
	import Button from '$lib/ui/Button.svelte';
	import { pending } from '$lib/ui/pending.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { uploadImage } from '$lib/ui/upload';
	import type { AssetRow } from '$lib/types';

	/**
	 * The Markdown body: a textarea on the left, a live-rendered preview on
	 * the right. Uploads (button, paste, drop) re-encode in the browser and
	 * insert the key at the cursor; the parent appends the new row to the
	 * file list via `onUploaded`.
	 */

	let {
		content = $bindable(),
		textarea = $bindable(),
		assetsOrigin,
		insert,
		onUploaded
	}: {
		content: string;
		textarea: HTMLTextAreaElement | null;
		assetsOrigin: string;
		insert: (snippet: string) => void;
		onUploaded: (meta: Omit<AssetRow, 'at'> & { at: number }) => void;
	} = $props();

	let uploadEl = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);
	let uploadError = $state('');

	const saving = pending();

	let preview = $derived(renderMarkdown(content, { assetsOrigin }).html);

	async function uploadFile(file: File) {
		uploading = true;
		uploadError = '';
		try {
			const meta = await uploadImage(file);
			const alt = file.name.replace(/\.[^.]+$/, '');
			insert(`\n\n![${alt}](${meta.key})\n\n`);
			onUploaded({ ...meta, at: Date.now() });
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'Upload failed.';
		} finally {
			uploading = false;
		}
	}

	function onPaste(event: ClipboardEvent) {
		const item = [...(event.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
		const file = item?.getAsFile();
		if (file) {
			event.preventDefault();
			uploadFile(file);
		}
	}

	function onDrop(event: DragEvent) {
		const file = event.dataTransfer?.files?.[0];
		if (file?.type.startsWith('image/')) {
			event.preventDefault();
			uploadFile(file);
		}
	}
</script>

<section class="min-w-0">
	<div class="mb-3 flex items-center justify-between gap-3">
		<h2 class="text-sm font-semibold">Page</h2>
		<Button
			variant="secondary"
			size="sm"
			onclick={() => uploadEl?.click()}
			busy={uploading}
			busyLabel="Uploading…"
		>
			<ImagePlus size={14} aria-hidden="true" />
			Insert image
		</Button>
	</div>

	{#if uploadError}
		<p role="alert" class="mb-2 text-xs text-danger">{uploadError}</p>
	{/if}

	<input
		bind:this={uploadEl}
		type="file"
		accept="image/png,image/jpeg,image/webp,image/avif"
		class="sr-only"
		onchange={(e) => {
			const file = e.currentTarget.files?.[0];
			if (file) uploadFile(file);
			e.currentTarget.value = '';
		}}
	/>

	<div class="panes">
		<form method="POST" action="?/save" class="pane" use:enhance={saving.submit}>
			<!-- Drop or paste an image straight onto the text to upload and
			     insert it at the cursor. -->
			<textarea
				bind:this={textarea}
				bind:value={content}
				name="content"
				spellcheck="false"
				onpaste={onPaste}
				ondrop={onDrop}
				ondragover={(e) => e.preventDefault()}
				class="editor-area"
				aria-label="Page Markdown"
			></textarea>

			<div class="mt-3 flex flex-wrap items-center gap-2">
				<Button type="submit" variant="secondary" size="sm" busy={saving.busy} busyLabel="Saving…">
					Save draft
				</Button>
				<span class="text-xs text-text-subtle">
					Markdown, plus <code>:::links</code>, <code>:::gallery</code>, <code>:github:</code>, <code>::contributions</code>.
				</span>
			</div>
		</form>

		<div class="pane preview" aria-label="Preview">
			<article class="prose">{@html preview}</article>
		</div>
	</div>
</section>

<style>
	.panes {
		display: grid;
		gap: 1rem;
	}

	.editor-area {
		width: 100%;
		min-height: 60vh;
		padding: 1rem 1.1rem;
		border-radius: var(--radius-ui);
		background-color: var(--surface);
		box-shadow: inset 0 0 0 1px var(--border-subtle);
		font-family: var(--font-mono);
		/* 16px everywhere: iOS zooms a focused field under 16px, and a
		   landscape phone or iPad is still iOS. */
		font-size: 16px;
		line-height: 1.7;
		resize: vertical;
		transition: box-shadow 150ms var(--ease-out);
	}
	.editor-area:focus {
		outline: none;
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	.preview {
		min-height: 60vh;
		max-height: 80vh;
		padding: 1.75rem;
		border-radius: var(--radius-ui);
		background-color: var(--surface);
		box-shadow: inset 0 0 0 1px var(--border-subtle);
		overflow: auto;
	}

	@media (min-width: 1024px) {
		.panes {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}
</style>
