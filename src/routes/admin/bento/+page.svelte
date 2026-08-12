<script lang="ts">
	import { setContext } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Plus from 'lucide-svelte/icons/plus';
	import Rocket from 'lucide-svelte/icons/rocket';
	import Undo from 'lucide-svelte/icons/undo-2';
	import X from 'lucide-svelte/icons/x';
	import Button from '$lib/ui/Button.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import Field from '$lib/ui/Field.svelte';
	import AssetInput from '$lib/ui/AssetInput.svelte';
	import { card, fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import BentoGrid from '$lib/widgets/BentoGrid.svelte';
	import { KINDS, widgets, isKind, type WidgetKind } from '$lib/widgets/catalog';
	import { serializeLines } from '$lib/widgets/fields';
	import { toFormValues } from '$lib/widgets/form';
	import BlockFields from './BlockFields.svelte';
	import BlockCanvas from './BlockCanvas.svelte';
	import BlockSheet from './BlockSheet.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Deployment configuration rather than page state — it cannot change while
	// this page is alive.
	// svelte-ignore state_referenced_locally
	setContext('assetsOrigin', data.assetsOrigin);

	let selected = $derived(page.url.searchParams.get('b'));
	let selectedBlock = $derived(data.draft.blocks.find((b) => b.id === selected) ?? null);

	/**
	 * The element the sheet should appear to come from, so the panel expands out
	 * of the card that was pressed and collapses back into it on close.
	 */
	let origin = $state<HTMLElement | null>(null);

	const select = (id: string, from: HTMLElement) => {
		origin = from;
		goto(`/admin/bento?b=${id}`, { noScroll: true, keepFocus: true });
	};

	const deselect = () => goto('/admin/bento', { noScroll: true, keepFocus: true });

	// Reordering posts the same form action the nudge buttons do, so drag is a
	// faster way to do the one thing, not a second way that skips validation.
	let reorderForm = $state<HTMLFormElement | null>(null);
	let orderValue = $state('');

	function reorder(ids: string[]) {
		orderValue = ids.join(',');
		queueMicrotask(() => reorderForm?.requestSubmit());
	}

	let linksValue = $derived(
		serializeLines(data.draft.profile.links as unknown as Array<Record<string, unknown>>, [
			'label',
			'href',
			'icon'
		])
	);

	// Grouped by cost, because that is the real constraint: a static block is
	// free to render, a live one spends a KV write every TTL, an embed brings a
	// third party onto the page.
	const GROUPS = [
		{ tier: 'static' as const, label: 'Static', note: 'Renders from its own data. No network.' },
		{ tier: 'live' as const, label: 'Live', note: 'Refreshed behind the response, never in front of it.' },
		{ tier: 'embed' as const, label: 'Embed', note: 'A poster until someone presses play.' }
	];

	const kindsIn = (tier: 'static' | 'live' | 'embed') =>
		KINDS.filter((k) => widgets[k].tier === tier);

	let adding = $state(false);

	// Every form that posts and waits says so. Adding a block is the one
	// exception and needs no flag: the picker collapses on submit, which is the
	// feedback.
	const publishing = pending();
	const reverting = pending();
	const savingProfile = pending();
	const savingBlock = pending();
	const deletingBlock = pending();
</script>

<svelte:head><title>Bento</title></svelte:head>

<header class="mb-6 flex flex-wrap items-center justify-between gap-3">
	<div>
		<h1 class="text-xl font-semibold">Bento</h1>
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
				<Button
					type="submit"
					variant="ghost"
					size="sm"
					busy={reverting.busy}
					busyLabel="Reverting…"
				>
					<Undo size={14} aria-hidden="true" />
					Revert
				</Button>
			</form>
		{/if}

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
{:else if form?.error}
	<p role="alert" class="mb-4 rounded-[var(--radius-ui)] bg-danger-tint px-3 py-2 text-sm text-danger">
		{form.error}
	</p>
{/if}

<div class="editor">
	<!-- The identity rail is not a block: always present, always first, never
	     reordered — so it gets its own record, its own form and its own
	     column. -->
	<section class="{card} mb-8">
		<h2 class="text-sm font-semibold">Identity</h2>

		<form
			method="POST"
			action="?/profile"
			class="mt-3 flex flex-col gap-4"
			use:enhance={savingProfile.submit}
		>
			<Field id="p-name" label="Name" error={form?.intent === 'profile' ? form.fields?.name : undefined}>
				{#snippet children({ id, describedBy, invalid })}
					<input {id} name="name" value={data.draft.profile.name} aria-describedby={describedBy} required class={fieldClass(invalid)} />
				{/snippet}
			</Field>

			<Field id="p-tagline" label="Tagline" optional hint="One line. Allowed to wrap to two on a phone.">
				{#snippet children({ id, describedBy, invalid })}
					<input {id} name="tagline" value={data.draft.profile.tagline ?? ''} aria-describedby={describedBy} class={fieldClass(invalid)} />
				{/snippet}
			</Field>

			<Field id="p-bio" label="Bio" optional hint="Two to four short paragraphs, separated by blank lines.">
				{#snippet children({ id, describedBy, invalid })}
					<textarea {id} name="bio" rows="5" value={data.draft.profile.bio ?? ''} aria-describedby={describedBy} class="{fieldClass(invalid)} resize-y"></textarea>
				{/snippet}
			</Field>

			<Field id="p-avatar" label="Avatar" optional>
				{#snippet children({ id, describedBy })}
					<AssetInput {id} name="avatar" value={data.draft.profile.avatar ?? ''} assetsOrigin={data.assetsOrigin} {describedBy} />
				{/snippet}
			</Field>

			<Field
				id="p-links"
				label="Footer links"
				optional
				hint="One per line: label | url | icon. Icons: github, x, linkedin, instagram, youtube, mail, rss, globe."
			>
				{#snippet children({ id, describedBy, invalid })}
					<textarea
						{id}
						name="links"
						rows="4"
						value={linksValue}
						aria-describedby={describedBy}
						spellcheck="false"
						class="{fieldClass(invalid)} resize-y font-mono text-xs"
					></textarea>
				{/snippet}
			</Field>

			<div>
				<Button
					type="submit"
					variant="secondary"
					size="sm"
					busy={savingProfile.busy}
					busyLabel="Saving…"
				>
					Save identity
				</Button>
			</div>
		</form>
	</section>

	<section class="min-w-0">
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-sm font-semibold">Blocks</h2>
			<Button variant="secondary" size="sm" onclick={() => (adding = !adding)} aria-expanded={adding}>
				<Plus size={14} aria-hidden="true" />
				Add block
			</Button>
		</div>

		{#if adding}
			<div class="{card} mb-4">
				{#each GROUPS as group (group.tier)}
					<div class="mb-4 last:mb-0">
						<p class="text-xs font-semibold">{group.label}</p>
						<p class="mb-2 text-xs text-text-subtle">{group.note}</p>
						<div class="flex flex-wrap gap-1.5">
							{#each kindsIn(group.tier) as kind (kind)}
								<form method="POST" action="?/addBlock" use:enhance={() => {
									adding = false;
									return async ({ update }) => update({ reset: false });
								}}>
									<input type="hidden" name="kind" value={kind} />
									<Button type="submit" variant="secondary" size="sm" title={widgets[kind].description}>
										{widgets[kind].label}
									</Button>
								</form>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if data.draft.blocks.length}
			<!--
				The canvas is the page, made editable: same components, same
				spans, same sectioning. Drag a card to move it, press it to open
				its fields. Editing a list beside a preview meant every change
				was a guess about a card you were not looking at.
			-->
			<div class="bento-region canvas-frame">
				<BlockCanvas
					blocks={data.draft.blocks.filter((b) => isKind(b.kind))}
					{selected}
					onSelect={select}
					onReorder={reorder}
				/>
			</div>

			<!-- Drag and the nudge buttons land on one action, which is also the
			     one that works with JavaScript off. -->
			<form method="POST" action="?/reorder" bind:this={reorderForm} use:enhance class="hidden">
				<input type="hidden" name="ids" value={orderValue} />
			</form>
		{:else}
			<Empty
				title="No blocks yet"
				body="Start with a link, a call to action and a short piece of text. Five well-made blocks read better than twenty half-made ones."
			>
				{#snippet action()}
					<Button variant="primary" size="sm" onclick={() => (adding = true)}>Add the first block</Button>
				{/snippet}
			</Empty>
		{/if}
	</section>
</div>

{#if selectedBlock && isKind(selectedBlock.kind)}
	{@const block = selectedBlock}
	{@const kind = block.kind as WidgetKind}
	{@const errors = form?.intent === 'block' && form.id === block.id ? form.errors : undefined}
	{@const values =
		form?.intent === 'block' && form.id === block.id && form.raw
			? form.raw
			: toFormValues(kind, block.data)}

	<BlockSheet open title="Edit {widgets[kind].label}" {origin} onClose={deselect}>
		<div class="mb-4 flex items-start justify-between gap-4">
			<div class="min-w-0">
				<h2 class="text-md font-semibold">{widgets[kind].label}</h2>
				<p class="mt-0.5 text-xs text-pretty text-text-muted">{widgets[kind].description}</p>
			</div>
			<Button variant="ghost" size="sm" onclick={deselect} aria-label="Close">
				<X size={16} aria-hidden="true" />
			</Button>
		</div>

		<form
			method="POST"
			action="?/updateBlock"
			class="flex flex-col gap-4"
			use:enhance={savingBlock.submit}
		>
			<input type="hidden" name="id" value={block.id} />
			<input type="hidden" name="kind" value={block.kind} />

			<Field id="f-span" label="Size">
				{#snippet children({ id, invalid })}
					<select {id} name="span" class={fieldClass(invalid)}>
						{#each widgets[kind].spans as span (span)}
							<option value={span} selected={block.span === span}>{span}</option>
						{/each}
					</select>
				{/snippet}
			</Field>

			<BlockFields {kind} {values} {errors} assetsOrigin={data.assetsOrigin} />

			<div class="sticky bottom-0 -mx-1 flex items-center gap-2 bg-bg px-1 pt-3 pb-1">
				<Button
					type="submit"
					variant="primary"
					size="sm"
					busy={savingBlock.busy}
					busyLabel="Saving…"
				>
					Save block
				</Button>
				<Button variant="ghost" size="sm" onclick={deselect}>Cancel</Button>
			</div>
		</form>

		<form
			method="POST"
			action="?/deleteBlock"
			class="mt-2 border-t border-border-subtle pt-4"
			use:enhance={deletingBlock.submit}
		>
			<input type="hidden" name="id" value={block.id} />
			<div class="flex items-center justify-between gap-4">
				<p class="text-xs text-pretty text-text-muted">
					Any image only this block used is deleted with it.
				</p>
				<Button
					type="submit"
					variant="danger"
					size="sm"
					busy={deletingBlock.busy}
					busyLabel="Deleting…"
				>
					Delete
				</Button>
			</div>
		</form>
	</BlockSheet>
{/if}

<style>
	.editor {
		display: grid;
		gap: 2rem;
	}

	/*
	 * The canvas sits on the page background rather than a panel, because it is
	 * standing in for the page. A card on a card would read as a mock-up.
	 */
	.canvas-frame {
		border-radius: var(--radius-ui-lg);
		background-color: var(--bg);
		padding: 1rem;
	}

	@media (min-width: 1024px) {
		.editor {
			/* Identity is a narrow column; the canvas takes the rest, at close to
			   the width it will actually be published at. */
			grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
			align-items: start;
			gap: 2.5rem;
		}

		.canvas-frame {
			padding: 1.5rem;
		}
	}
</style>
