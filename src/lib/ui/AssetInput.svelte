<script lang="ts">
	import Upload from 'lucide-svelte/icons/upload';
	import X from 'lucide-svelte/icons/x';
	import { inputClass } from './styles';

	type Props = {
		id: string;
		name: string;
		value: string;
		assetsOrigin: string;
		describedBy?: string;
		invalid?: boolean;
	};

	let { id, name, value = $bindable(), assetsOrigin, describedBy, invalid = false }: Props = $props();

	let busy = $state(false);
	let error = $state('');
	let dragging = $state(false);
	let fileEl = $state<HTMLInputElement | null>(null);

	const MAX_EDGE = 1600;

	/**
	 * Downscale and re-encode before the upload rather than after it. R2 serves
	 * originals and Cloudflare's image resizing is not free, so the work
	 * belongs on the client — where CPU is unmetered — not on a Worker with a
	 * 10ms budget.
	 */
	async function shrink(file: File): Promise<{ blob: Blob; w: number; h: number }> {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
		const w = Math.round(bitmap.width * scale);
		const h = Math.round(bitmap.height * scale);

		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas is unavailable.');
		ctx.drawImage(bitmap, 0, 0, w, h);
		bitmap.close();

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/webp', 0.82)
		);
		if (!blob) throw new Error('That image could not be re-encoded.');
		return { blob, w, h };
	}

	async function upload(file: File) {
		if (!file.type.startsWith('image/')) {
			error = 'Images only.';
			return;
		}

		busy = true;
		error = '';
		try {
			const { blob, w, h } = await shrink(file);
			const res = await fetch('/api/assets', {
				method: 'POST',
				headers: {
					'content-type': blob.type,
					'x-image-width': String(w),
					'x-image-height': String(h)
				},
				body: blob
			});

			if (!res.ok) throw new Error(await res.text());
			const json = (await res.json()) as { key: string };
			value = json.key;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed.';
		} finally {
			busy = false;
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) upload(file);
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-center gap-2">
		{#if value}
			<img
				src="{assetsOrigin}/{value}"
				alt=""
				width="40"
				height="40"
				class="size-10 shrink-0 rounded-[var(--radius-ui-sm)] bg-surface-sunken object-cover"
			/>
		{/if}

		<input
			{id}
			{name}
			bind:value
			aria-describedby={describedBy}
			aria-invalid={invalid || undefined}
			placeholder="img/…"
			spellcheck="false"
			class={inputClass}
		/>

		{#if value}
			<button
				type="button"
				onclick={() => (value = '')}
				aria-label="Clear image"
				class="grid size-11 shrink-0 place-items-center rounded-[var(--radius-ui)] text-text-muted transition-colors duration-150 ease-out hover:bg-surface-sunken hover:text-text sm:size-9"
			>
				<X size={15} aria-hidden="true" />
			</button>
		{/if}
	</div>

	<!--
		A drop zone that only exists where a pointer does. On touch the file
		picker below is the whole affordance, and it is not hidden behind hover.
	-->
	<div
		class="dropzone"
		class:dragging
		ondragover={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={onDrop}
		role="presentation"
	>
		<input
			bind:this={fileEl}
			type="file"
			accept="image/png,image/jpeg,image/webp,image/avif"
			class="sr-only"
			onchange={(e) => {
				const file = e.currentTarget.files?.[0];
				if (file) upload(file);
				e.currentTarget.value = '';
			}}
		/>
		<button
			type="button"
			onclick={() => fileEl?.click()}
			disabled={busy}
			class="flex min-h-11 w-full items-center justify-center gap-2 text-xs text-text-muted transition-colors duration-150 ease-out hover:text-text disabled:opacity-50 sm:min-h-9"
		>
			<Upload size={14} aria-hidden="true" />
			{#if busy}
				Uploading…
			{:else}
				Choose an image<span class="hidden sm:inline"> or drop one here</span>
			{/if}
		</button>
	</div>

	{#if error}
		<p class="text-xs text-danger">{error}</p>
	{:else}
		<p class="text-xs text-text-subtle">
			Resized to {MAX_EDGE}px and re-encoded to WebP in the browser before it is sent.
		</p>
	{/if}
</div>

<style>
	.dropzone {
		border-radius: var(--radius-ui);
		border: 1px dashed var(--border-subtle);
		transition:
			border-color 150ms var(--ease-out),
			background-color 150ms var(--ease-out);
	}

	.dropzone.dragging {
		border-color: var(--accent);
		background-color: var(--accent-tint);
	}
</style>
