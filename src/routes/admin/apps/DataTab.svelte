<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Trash from 'lucide-svelte/icons/trash-2';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { fmtBytes, fmtDate } from '$lib/format';
	import { pending, pendingRows } from '$lib/ui/pending.svelte';
	import { cardFlush, fieldClass, iconButton, notice } from '$lib/ui/styles';
	import { MAX_DATA_APP_BYTES, MAX_DATA_KEYS } from '$lib/apps/app';

	/**
	 * An app's data (plan §8.2): its keys with their size and when each
	 * changed, one value open at a time as formatted JSON that can be edited
	 * in place, and delete. Saved values are stored compact, exactly as the
	 * API stores them; the indentation here is for reading only.
	 */

	type Entry = { key: string; bytes: number; updated_at: number };

	let {
		slug,
		entries,
		value,
		fields = {},
		echo,
		error
	}: {
		slug: string;
		entries: Entry[];
		/** The open value, when a key is selected. */
		value: { key: string; json: string } | null;
		fields?: Record<string, string>;
		/** A rejected save's input, so a typo never costs the edit. */
		echo?: { key?: string; value?: string };
		error?: string;
	} = $props();

	const base = $derived(`/admin/apps?s=${encodeURIComponent(slug)}&tab=data`);
	const pretty = (json: string) => {
		try {
			return JSON.stringify(JSON.parse(json), null, 2);
		} catch {
			return json;
		}
	};

	const seed = () => ({
		key: echo?.key ?? value?.key ?? '',
		text: echo?.value ?? (value ? pretty(value.json) : '')
	});
	// svelte-ignore state_referenced_locally
	let draft = $state(seed());
	$effect(() => {
		const next = seed();
		untrack(() => {
			draft = next;
		});
	});

	let total = $derived(entries.reduce((n, e) => n + e.bytes, 0));

	const saving = pending({
		flash: () => Boolean(value),
		onSuccess: (data) => {
			const key = String(data?.dataSaved ?? '');
			if (!value && key) goto(`${base}&k=${encodeURIComponent(key)}`, { noScroll: true });
		}
	});

	const removing = pendingRows({
		confirm: (key) => `Delete “${key}”? The app's other devices drop it on their next sync.`,
		onSuccess: (key) => {
			if (value?.key === key) goto(base, { noScroll: true });
		}
	});
</script>

<div class="flex flex-col gap-4">
	{#if error}
		<p role="alert" class={notice.error}>{error}</p>
	{/if}

	<p class="text-xs text-text-muted">
		{entries.length.toLocaleString('en')} of {MAX_DATA_KEYS.toLocaleString('en')} keys ·
		{fmtBytes(total)} of {fmtBytes(MAX_DATA_APP_BYTES)}
	</p>

	{#if entries.length}
		<ul class="{cardFlush} divide-y divide-border-subtle">
			{#each entries as entry (entry.key)}
				<li class="flex items-center gap-2 ps-3 pe-1 {value?.key === entry.key ? 'bg-row-active' : ''}">
					<a
						href="{base}&k={encodeURIComponent(entry.key)}"
						data-sveltekit-noscroll
						aria-current={value?.key === entry.key ? 'true' : undefined}
						class="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 md:min-h-10"
					>
						<span class="min-w-0 flex-1 truncate font-mono text-[13px]">{entry.key}</span>
						<span class="shrink-0 text-xs text-text-muted tabular-nums">{fmtBytes(entry.bytes)}</span>
						<span class="hidden shrink-0 text-xs text-text-subtle sm:block">{fmtDate(entry.updated_at)}</span>
					</a>
					<form method="POST" action="?/deleteData" use:enhance={removing.submit(entry.key)}>
						<input type="hidden" name="slug" value={slug} />
						<input type="hidden" name="key" value={entry.key} />
						<button type="submit" class="{iconButton} hover:text-danger" aria-label="Delete {entry.key}" title="Delete">
							<Trash size={15} aria-hidden="true" />
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-text-muted">Nothing saved yet. Values the app saves with DB appear here.</p>
	{/if}

	<form method="POST" action="?/setData" class="flex flex-col gap-4" use:enhance={saving.submit}>
		<input type="hidden" name="slug" value={slug} />

		<div class="flex items-center gap-2">
			<h3 class="min-w-0 flex-1 truncate text-sm font-semibold">
				{value ? value.key : 'New key'}
			</h3>
			{#if value}
				<a href={base} data-sveltekit-noscroll class="text-sm font-medium text-accent">New key</a>
			{/if}
		</div>

		{#if value}
			<input type="hidden" name="key" value={value.key} />
		{:else}
			<Field id="data-key" label="Key" error={fields.key}>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{id}
						name="key"
						bind:value={draft.key}
						aria-describedby={describedBy}
						aria-invalid={invalid || undefined}
						required
						maxlength="128"
						spellcheck="false"
						autocapitalize="off"
						autocorrect="off"
						autocomplete="off"
						placeholder="todos"
						class="{fieldClass(invalid)} font-mono"
					/>
				{/snippet}
			</Field>
		{/if}

		<Field id="data-value" label="Value" error={fields.value} hint="JSON">
			{#snippet children({ id, describedBy, invalid })}
				<textarea
					{id}
					name="value"
					rows={12}
					bind:value={draft.text}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					required
					spellcheck="false"
					autocapitalize="off"
					wrap="off"
					placeholder={'[]'}
					class="{fieldClass(invalid)} resize-y font-mono text-[12.5px] leading-[1.55] pointer-fine:text-[12px]"
				></textarea>
			{/snippet}
		</Field>

		<div class="flex md:justify-end">
			<Button type="submit" variant="primary" size="form" busy={saving.busy} busyLabel="Saving…">
				{value ? (saving.saved ? 'Saved' : 'Save value') : 'Add key'}
			</Button>
		</div>
	</form>
</div>
