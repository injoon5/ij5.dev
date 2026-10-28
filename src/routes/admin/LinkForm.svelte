<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { affixClass, affixInput, affixPrefix, fieldClass, notice } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import type { SlugRow } from '$lib/types';

	type Props = {
		/** `null` puts the form in create mode. */
		row: SlugRow | null;
		fields?: Record<string, string>;
		values?: Record<string, string>;
		error?: string;
		/** After a create, with the new slug; after a delete, with nothing. */
		onDone?: (slug?: string) => void;
	};

	let { row, fields = {}, values = {}, error, onDone }: Props = $props();

	let mode = $derived(row ? 'update' : 'create');
	let host = $derived(page.url.host);

	// "Saved" holds on the button for a beat after an edit lands, so a save
	// that changes nothing visible still says it happened.
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
		if (!confirm(`Delete ${host}/${row?.slug}? Its analytics are kept.`)) {
			input.cancel();
			return;
		}
		return deleting.submit(input);
	};

	const iso = (ms: number | null | undefined) =>
		ms ? new Date(ms).toISOString().slice(0, 10) : '';

	// Rejected input is echoed back so a typo never costs the whole form.
	// svelte-ignore state_referenced_locally
	let status = $state(values.status ?? String(row?.status ?? 302));
	let initial = $derived({
		slug: values.slug ?? row?.slug ?? '',
		target_url: values.target_url ?? row?.target_url ?? '',
		note: values.note ?? row?.note ?? '',
		expires: values.expires ?? iso(row?.expires_at)
	});
</script>

<form method="POST" action="?/{mode}" class="flex flex-col gap-4 md:gap-5" use:enhance={saving.submit}>
	{#if error}
		<p role="alert" class={notice.error}>{error}</p>
	{/if}

	{#if row}
		<input type="hidden" name="slug" value={row.slug} />
	{:else}
		<Field id="slug" label="Short link" error={fields.slug}>
			{#snippet children({ id, describedBy, invalid })}
				<div class={affixClass(invalid)}>
					<span class={affixPrefix} aria-hidden="true">{host}/</span>
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
						placeholder="gh"
						class={affixInput}
					/>
				</div>
			{/snippet}
		</Field>
	{/if}

	<Field id="target_url" label="Destination" error={fields.target_url}>
		{#snippet children({ id, describedBy, invalid })}
			<input
				{id}
				name="target_url"
				type="url"
				inputmode="url"
				value={initial.target_url}
				aria-describedby={describedBy}
				aria-invalid={invalid || undefined}
				required
				spellcheck="false"
				autocomplete="off"
				placeholder="https://"
				class={fieldClass(invalid)}
			/>
		{/snippet}
	</Field>

	<div class="grid gap-4 sm:grid-cols-2 md:gap-5">
		<!-- The one hint on this form, and only when it applies: a 301 cannot be
		     recalled from a browser that has already followed it. -->
		<Field
			id="status"
			label="Redirect"
			error={fields.status}
			hint={status === '301' ? 'Browsers cache it for good.' : undefined}
		>
			{#snippet children({ id, describedBy, invalid })}
				<select
					{id}
					name="status"
					bind:value={status}
					aria-describedby={describedBy}
					class="{fieldClass(invalid)} pe-9"
				>
					<option value="302">Temporary (302)</option>
					<option value="301">Permanent (301)</option>
				</select>
			{/snippet}
		</Field>

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
	</div>

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

	<!-- On a phone the primary action is the full-width bar at the foot of the
	     form and Delete sits under it; from `md` they share one row, Delete
	     at the far end from Save. -->
	<div class="flex flex-col-reverse gap-2 pt-2 md:flex-row md:items-center md:border-t md:border-border-subtle md:pt-4">
		{#if row}
			<!-- Submits the separate delete form below; forms cannot nest. -->
			<Button
				type="submit"
				form="delete-link"
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
			{row ? (saved ? 'Saved' : 'Save') : 'Create link'}
		</Button>
	</div>
</form>

{#if row}
	<form id="delete-link" method="POST" action="?/delete" use:enhance={confirmDelete} hidden>
		<input type="hidden" name="slug" value={row.slug} />
	</form>
{/if}
