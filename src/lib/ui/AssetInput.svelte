<script lang="ts">
	import ImageIcon from 'lucide-svelte/icons/image';
	import Button from './Button.svelte';
	import { uploadImage } from './upload';

	/**
	 * An image field shown as the image: a round preview, then Upload (or
	 * Replace) and Remove. The stored key rides in a hidden input — it is an
	 * opaque hash nobody reads or types, so it does not earn a text field.
	 * Dropping an image anywhere on the row uploads it too.
	 */
	type Props = {
		id: string;
		name: string;
		value: string;
		assetsOrigin: string;
		describedBy?: string;
		invalid?: boolean;
		/** Fires whenever the value changes by upload or removal. */
		onchange?: () => void;
	};

	let {
		id,
		name,
		value = $bindable(),
		assetsOrigin,
		describedBy,
		invalid = false,
		onchange
	}: Props = $props();

	let busy = $state(false);
	let error = $state('');
	let dragging = $state(false);
	let fileEl = $state<HTMLInputElement | null>(null);

	let errorId = $derived(error ? `${id}-upload-error` : undefined);
	let described = $derived([describedBy, errorId].filter(Boolean).join(' ') || undefined);

	async function upload(file: File) {
		busy = true;
		error = '';
		try {
			const { key } = await uploadImage(file);
			value = key;
			onchange?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'That image could not be uploaded.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-1.5">
	<div
		class="-m-1 flex items-center gap-3 rounded-[var(--radius-ui)] p-1 transition-colors duration-150 ease-out {dragging
			? 'bg-accent-tint'
			: ''}"
		ondragover={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={(e) => {
			e.preventDefault();
			dragging = false;
			const file = e.dataTransfer?.files?.[0];
			if (file) upload(file);
		}}
		role="presentation"
	>
		{#if value}
			<img
				src="{assetsOrigin}/{value}"
				alt=""
				width="40"
				height="40"
				class="size-10 shrink-0 rounded-full bg-surface-sunken object-cover outline outline-1 -outline-offset-1 outline-[var(--img-outline)] {busy
					? 'opacity-50'
					: ''} transition-opacity duration-150 ease-out"
			/>
		{:else}
			<span
				class="grid size-10 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-subtle {invalid
					? 'ring-1 ring-danger'
					: ''}"
				aria-hidden="true"
			>
				<ImageIcon size={16} />
			</span>
		{/if}

		<input type="hidden" {name} {value} />
		<input
			bind:this={fileEl}
			{id}
			type="file"
			accept="image/png,image/jpeg,image/webp,image/avif"
			class="sr-only"
			aria-describedby={described}
			onchange={(e) => {
				const file = e.currentTarget.files?.[0];
				if (file) upload(file);
				e.currentTarget.value = '';
			}}
		/>

		<div class="flex items-center gap-1.5">
			<Button variant="secondary" size="sm" onclick={() => fileEl?.click()} {busy} busyLabel="Uploading…">
				{value ? 'Replace' : 'Upload'}
			</Button>
			{#if value}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						value = '';
						onchange?.();
					}}
				>
					Remove
				</Button>
			{/if}
		</div>
	</div>

	{#if error}
		<p id={errorId} class="text-xs text-danger">{error}</p>
	{/if}
</div>
