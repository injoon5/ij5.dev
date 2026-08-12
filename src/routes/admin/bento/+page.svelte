<script lang="ts">
	import { setContext } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Plus from 'lucide-svelte/icons/plus';
	import Rocket from 'lucide-svelte/icons/rocket';
	import Undo from 'lucide-svelte/icons/undo-2';
	import Button from '$lib/ui/Button.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import Field from '$lib/ui/Field.svelte';
	import AssetInput from '$lib/ui/AssetInput.svelte';
	import { fieldClass } from '$lib/ui/styles';
	import BentoGrid from '$lib/widgets/BentoGrid.svelte';
	import { KINDS, widgets, isKind, type WidgetKind } from '$lib/widgets/catalog';
	import { serializeLines } from '$lib/widgets/fields';
	import { toFormValues } from '$lib/widgets/form';
	import BlockFields from './BlockFields.svelte';
	import BlockList from './BlockList.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Deployment configuration rather than page state — it cannot change while
	// this page is alive.
	// svelte-ignore state_referenced_locally
	setContext('assetsOrigin', data.assetsOrigin);

	let selected = $derived(page.url.searchParams.get('b'));

	const select = (id: string) =>
		goto(selected === id ? '/admin/bento' : `/admin/bento?b=${id}`, {
			noScroll: true,
			keepFocus: true
		});

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
			<form method="POST" action="?/revert" use:enhance>
				<Button type="submit" variant="ghost" size="sm">
					<Undo size={14} aria-hidden="true" />
					Revert
				</Button>
			</form>
		{/if}

		<form method="POST" action="?/publish" use:enhance>
			<Button type="submit" variant="primary" size="sm" disabled={!data.dirty}>
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
	<div class="min-w-0">
		<!-- The identity rail is not a block: always present, always first,
		     never reordered, so it gets its own record and its own form. -->
		<section class="mb-8 rounded-[var(--radius-ui-lg)] bg-surface p-5">
			<h2 class="text-sm font-semibold">Identity</h2>

			<form method="POST" action="?/profile" class="mt-4 flex flex-col gap-4" use:enhance>
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
					<Button type="submit" variant="secondary" size="sm">Save identity</Button>
				</div>
			</form>
		</section>

		<section>
			<div class="mb-3 flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold">Blocks</h2>
				<Button variant="secondary" size="sm" onclick={() => (adding = !adding)} aria-expanded={adding}>
					<Plus size={14} aria-hidden="true" />
					Add block
				</Button>
			</div>

			{#if adding}
				<div class="mb-4 rounded-[var(--radius-ui-lg)] bg-surface p-5">
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
				<BlockList blocks={data.draft.blocks} {selected} onSelect={select}>
					{#snippet detail(block)}
						{@const kind = block.kind as WidgetKind}
						{@const errors = form?.intent === 'block' && form.id === block.id ? form.errors : undefined}
						{@const values =
							form?.intent === 'block' && form.id === block.id && form.raw
								? form.raw
								: toFormValues(kind, block.data)}

						<form method="POST" action="?/updateBlock" class="flex flex-col gap-4" use:enhance>
							<input type="hidden" name="id" value={block.id} />
							<input type="hidden" name="kind" value={block.kind} />

							<p class="text-xs text-pretty text-text-muted">{widgets[kind].description}</p>

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

							<div class="flex items-center gap-2 pt-1">
								<Button type="submit" variant="primary" size="sm">Save block</Button>
								<span class="flex-1"></span>
							</div>
						</form>

						<form method="POST" action="?/deleteBlock" class="mt-4 border-t border-border-subtle pt-4" use:enhance>
							<input type="hidden" name="id" value={block.id} />
							<div class="flex items-center justify-between gap-4">
								<p class="text-xs text-text-muted">
									Any image only this block used is deleted with it.
								</p>
								<Button type="submit" variant="danger" size="sm">Delete</Button>
							</div>
						</form>
					{/snippet}
				</BlockList>
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

	<!--
		The preview renders the same components the public page does, against
		the draft document. Nothing here is a mock-up, so what it shows is what
		publishing produces.
	-->
	<aside class="preview" aria-label="Preview">
		<div class="mb-2 flex items-baseline justify-between">
			<h2 class="text-sm font-semibold">Preview</h2>
			<span class="text-xs text-text-subtle">draft</span>
		</div>

		<div class="bento-region preview-frame">
			{#if data.draft.blocks.length}
				<BentoGrid blocks={data.draft.blocks.filter((b) => isKind(b.kind))} />
			{:else}
				<p class="py-12 text-center text-sm text-text-muted">Blocks appear here as you add them.</p>
			{/if}
		</div>
	</aside>
</div>

<style>
	.editor {
		display: grid;
		gap: 2rem;
	}

	.preview-frame {
		border-radius: var(--radius-ui-lg);
		background-color: var(--bg);
		padding: 1rem;
	}

	@media (min-width: 1024px) {
		.editor {
			grid-template-columns: minmax(0, 26rem) minmax(0, 1fr);
			align-items: start;
			gap: 2.5rem;
		}

		/* Side by side, never a tab switch: the point of the preview is seeing
		   the change land while the form is still open. */
		.preview {
			position: sticky;
			top: 2.5rem;
			max-height: calc(100dvh - 5rem);
			overflow-y: auto;
			overscroll-behavior: contain;
		}
	}
</style>
