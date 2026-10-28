<script lang="ts">
	import Upload from 'lucide-svelte/icons/upload';
	import X from 'lucide-svelte/icons/x';
	import ImageIcon from 'lucide-svelte/icons/image';
	import Button from './Button.svelte';
	import { iconButton, inputClass } from './styles';
	import { uploadImage } from './upload';

	/**
	 * An image field: the stored key in a text input (so it still works with
	 * scripts off), a preview beside it, and an upload button. Dropping an
	 * image anywhere on the row uploads it too.
	 */
	type Props = {
		id: string;
		name: string;
		value: string;
		assetsOrigin: string;
		describedBy?: string;
		invalid?: boolean;
		/** Fires whenever the value changes by upload or clear. */
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
		class="flex items-center gap-2 rounded-[var(--radius-ui)] transition-[background-color,box-shadow] duration-150 ease-out {dragging
			? 'bg-accent-tint shadow-[0_0_0_4px_var(--accent-tint)]'
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
				class="size-10 shrink-0 rounded-full bg-surface-sunken object-cover outline outline-1 -outline-offset-1 outline-[var(--img-outline)]"
			/>
		{:else}
			<span
				class="grid size-10 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-subtle"
				aria-hidden="true"
			>
				<ImageIcon size={16} />
			</span>
		{/if}

		<input
			{id}
			{name}
			bind:value
			aria-describedby={described}
			aria-invalid={invalid || Boolean(error) || undefined}
			placeholder="img/…"
			spellcheck="false"
			autocomplete="off"
			class="{inputClass(invalid)} min-w-0 flex-1 font-mono text-[13px] pointer-fine:text-[12.5px]"
		/>

		{#if value}
			<button
				type="button"
				onclick={() => {
					value = '';
					onchange?.();
				}}
				aria-label="Remove image"
				title="Remove image"
				class={iconButton}
			>
				<X size={15} aria-hidden="true" />
			</button>
		{/if}

		<input
			bind:this={fileEl}
			type="file"
			accept="image/png,image/jpeg,image/webp,image/avif"
			class="sr-only"
			tabindex="-1"
			aria-hidden="true"
			onchange={(e) => {
				const file = e.currentTarget.files?.[0];
				if (file) upload(file);
				e.currentTarget.value = '';
			}}
		/>
		<Button
			variant="secondary"
			size="sm"
			onclick={() => fileEl?.click()}
			busy={busy}
			busyLabel="Uploading…"
		>
			<Upload size={14} aria-hidden="true" />
			Upload
		</Button>
	</div>

	{#if error}
		<p id={errorId} class="text-xs text-danger">{error}</p>
	{/if}
</div>
