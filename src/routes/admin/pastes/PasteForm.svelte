<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { affixClass, affixInput, affixPrefix, fieldClass, notice, switchClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import { MAX_PASTE_CHARS, type PasteRow } from '$lib/types';

	type Props = {
		/** `null` puts the form in create mode. */
		row: PasteRow | null;
		fields?: Record<string, string>;
		values?: Record<string, string>;
		error?: string;
		/** After a create, with the new slug; after a delete, with nothing. */
		onDone?: (slug?: string) => void;
	};

	let { row, fields = {}, values = {}, error, onDone }: Props = $props();

	let mode = $derived(row ? 'update' : 'create');
	let host = $derived(page.url.host);

	let saved = $state(false);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;

	const saving = pending({
		reset: () => mode === 'create',
		onSuccess: (data) => {
			if (mode === 'create') return onDone?.(String(data?.created ?? ''));
			saved = true;
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => (saved = false), 1600);
		}
	});

	const deleting = pending({ onSuccess: () => onDone?.() });

	const confirmDelete: SubmitFunction = (input) => {
		if (!confirm(`Delete ${host}/p/${row?.slug}? Its analytics are kept.`)) {
			input.cancel();
			return;
		}
		return deleting.submit(input);
	};

	const iso = (ms: number | null | undefined) =>
		ms ? new Date(ms).toISOString().slice(0, 10) : '';

	// Rejected input is echoed back so a typo never costs the whole form. A
	// checkbox's `values` entry is "on" or ""; `row.cache` is the stored value.
	const cacheInitial = $derived(
		values.cache !== undefined ? values.cache === 'on' : (row?.cache ?? true)
	);

	let initial = $derived({
		slug: values.slug ?? row?.slug ?? '',
		note: values.note ?? row?.note ?? '',
		expires: values.expires ?? iso(row?.expires_at)
	});

	// The body is bound so the counter tracks typing. It re-seeds when the
	// echoed-back values change, but `untrack` keeps that reseed from firing
	// on every keystroke and wiping what someone is typing.
	// svelte-ignore state_referenced_locally
	let body = $state(values.body ?? row?.body ?? '');
	$effect(() => {
		const seed = values.body ?? row?.body ?? '';
		untrack(() => {
			body = seed;
		});
	});

	// The limit only matters near it, so the count appears only then.
	let nearLimit = $derived(body.length > MAX_PASTE_CHARS * 0.9);
</script>

<form method="POST" action="?/{mode}" class="flex flex-col gap-5" use:enhance={saving.submit}>
	{#if error}
		<p role="alert" class={notice.error}>{error}</p>
	{/if}

	{#if row}
		<input type="hidden" name="slug" value={row.slug} />
	{:else}
		<Field id="slug" label="Link" error={fields.slug}>
			{#snippet children({ id, describedBy, invalid })}
				<div class={affixClass(invalid)}>
					<span class={affixPrefix} aria-hidden="true">{host}/p/</span>
					<input
						{id}
						name="slug"
						value={initial.slug}
						aria-describedby={describedBy}
						aria-invalid={invalid || undefined}
						required
						spellcheck="false"
						autocapitalize="off"
						autocorrect="off"
						autocomplete="off"
						placeholder="notes"
						class={affixInput}
					/>
				</div>
			{/snippet}
		</Field>
	{/if}

	<Field
		id="body"
		label="Text"
		error={fields.body}
		hint={nearLimit
			? `${body.length.toLocaleString('en')} of ${MAX_PASTE_CHARS.toLocaleString('en')} characters`
			: undefined}
	>
		{#snippet children({ id, describedBy, invalid })}
			<textarea
				{id}
				name="body"
				rows={14}
				bind:value={body}
				aria-describedby={describedBy}
				aria-invalid={invalid || undefined}
				required
				spellcheck="false"
				maxlength={MAX_PASTE_CHARS}
				class="{fieldClass(invalid)} resize-y font-mono text-[13px] leading-[1.6] pointer-fine:text-[12.5px]"
			></textarea>
		{/snippet}
	</Field>

	<div class="grid gap-5 sm:grid-cols-2">
		<Field id="expires" label="Expires" error={fields.expires}>
			{#snippet children({ id, describedBy, invalid })}
				<input
					{id}
					name="expires"
					type="date"
					value={initial.expires}
					aria-describedby={describedBy}
					class={fieldClass(invalid)}
				/>
			{/snippet}
		</Field>

		<Field id="note" label="Note" error={fields.note}>
			{#snippet children({ id, describedBy, invalid })}
				<input
					{id}
					name="note"
					value={initial.note}
					aria-describedby={describedBy}
					maxlength="200"
					class={fieldClass(invalid)}
				/>
			{/snippet}
		</Field>
	</div>

	<!-- Caching is the default and the box is the opt-out: off, every view
	     reads the database, so an edit shows everywhere immediately. -->
	<label
		class="flex cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-ui)] bg-surface px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--border-subtle)] select-none pointer-fine:py-2"
	>
		<span class="text-sm">Cache for 5 minutes</span>
		<input name="cache" type="checkbox" role="switch" checked={cacheInitial} class={switchClass} />
	</label>

	<!-- On a phone the primary action is the full-width bar at the foot of the
	     form and Delete sits under it; from `md` they share one row, Delete
	     at the far end from Save. -->
	<div class="flex flex-col-reverse gap-2 pt-2 md:flex-row md:items-center md:border-t md:border-border-subtle md:pt-4">
		{#if row}
			<!-- Submits the separate delete form below; forms cannot nest. -->
			<Button
				type="submit"
				form="delete-paste"
				variant="danger"
				size="form"
				class="md:-ms-3"
				busy={deleting.busy}
				busyLabel="Deleting…"
			>
				Delete
			</Button>
		{/if}
		<span class="hidden flex-1 md:block"></span>
		<Button type="submit" variant="primary" size="form" busy={saving.busy} busyLabel="Saving…">
			{row ? (saved ? 'Saved' : 'Save') : 'Create paste'}
		</Button>
	</div>
</form>

{#if row}
	<form id="delete-paste" method="POST" action="?/delete" use:enhance={confirmDelete} hidden>
		<input type="hidden" name="slug" value={row.slug} />
	</form>
{/if}
