<script lang="ts">
	import ImagePlus from 'lucide-svelte/icons/image-plus';
	import Button from '$lib/ui/Button.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { uploadImage } from '$lib/ui/upload';
	import { cardFlush, cardTitle } from '$lib/ui/styles';
	import type { AssetRow } from '$lib/types';

	/**
	 * The Markdown body and its live preview. Side by side where there is
	 * room for two readable columns (`xl`); below that, one at a time behind a
	 * Write / Preview switch — two squeezed columns is the worst of both.
	 * Uploads (button, paste, drop) re-encode in the browser and insert the
	 * key at the cursor; the parent adds the new image to the grid.
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
	let view = $state<'write' | 'preview'>('write');

	let preview = $derived(renderMarkdown(content, { assetsOrigin }).html);

	async function uploadFile(file: File) {
		uploading = true;
		uploadError = '';
		try {
			const meta = await uploadImage(file);
			const alt = file.name.replace(/\.[^.]+$/, '');
			view = 'write';
			insert(`\n\n![${alt}](${meta.key})\n\n`);
			onUploaded({ ...meta, at: Date.now() });
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'That image could not be uploaded.';
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

	const segment =
		'rounded-[calc(var(--radius-ui)-3px)] px-3 py-1 text-sm font-medium text-text-muted transition-[background-color,color] duration-150 ease-out aria-pressed:bg-surface aria-pressed:text-text aria-pressed:shadow-[0_1px_2px_oklch(0_0_0/0.08),0_0_0_1px_var(--border-subtle)] pointer-coarse:py-2';
</script>

<section class="min-w-0">
	<div class="mb-3 flex items-center gap-2">
		<h2 class={cardTitle}>Page</h2>

		<div
			class="ms-2 flex gap-0.5 rounded-[var(--radius-ui)] bg-surface-sunken p-[3px] xl:hidden"
			role="group"
			aria-label="View"
		>
			<button type="button" class={segment} aria-pressed={view === 'write'} onclick={() => (view = 'write')}>
				Write
			</button>
			<button type="button" class={segment} aria-pressed={view === 'preview'} onclick={() => (view = 'preview')}>
				Preview
			</button>
		</div>

		<span class="flex-1"></span>
		<!-- Icon-only on the narrowest screens, where the switch beside it needs
		     the room; the status line below says when an upload is running. -->
		<Button
			variant="secondary"
			size="sm"
			onclick={() => uploadEl?.click()}
			busy={uploading}
			aria-label="Insert image"
			title="Insert image"
		>
			<ImagePlus size={14} aria-hidden="true" />
			<span class="max-sm:hidden">Insert image</span>
		</Button>
	</div>

	{#if uploadError}
		<p role="alert" class="mb-2 text-xs text-danger">{uploadError}</p>
	{:else if uploading}
		<p role="status" class="mb-2 text-xs text-text-muted">Uploading image…</p>
	{/if}

	<input
		bind:this={uploadEl}
		type="file"
		accept="image/png,image/jpeg,image/webp,image/avif"
		class="sr-only"
		tabindex="-1"
		aria-hidden="true"
		onchange={(e) => {
			const file = e.currentTarget.files?.[0];
			if (file) uploadFile(file);
			e.currentTarget.value = '';
		}}
	/>

	<div class="grid gap-4 xl:grid-cols-2 xl:items-stretch">
		<div class={view === 'write' ? '' : 'max-xl:hidden'}>
			<!-- Drop or paste an image straight onto the text to upload and
			     insert it at the cursor. The textarea belongs to no form of its
			     own: Save and Publish each send it along with themselves. -->
			<textarea
				bind:this={textarea}
				bind:value={content}
				spellcheck="false"
				onpaste={onPaste}
				ondrop={onDrop}
				ondragover={(e) => e.preventDefault()}
				class="block h-[min(70vh,44rem)] min-h-80 w-full resize-y rounded-[var(--radius-ui-lg)] bg-surface px-4 py-3.5 font-mono text-[13.5px] leading-[1.7] text-text shadow-[inset_0_0_0_1px_var(--border-subtle)] transition-shadow duration-150 ease-out focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-tint)] focus:outline-none pointer-coarse:text-base"
				aria-label="Page Markdown"
			></textarea>
			<p class="mt-2 text-xs text-text-subtle">
				Markdown, with <code class="font-mono">:::links</code>, <code class="font-mono">:::gallery</code>,
				<code class="font-mono">:name:</code> icons and <code class="font-mono">::contributions</code>.
			</p>
		</div>

		<div
			class="{cardFlush} h-[min(70vh,44rem)] min-h-80 overflow-auto p-5 md:p-7 {view === 'preview'
				? ''
				: 'max-xl:hidden'}"
			aria-label="Preview"
			role="region"
		>
			<article class="prose">{@html preview}</article>
		</div>
	</div>
</section>
