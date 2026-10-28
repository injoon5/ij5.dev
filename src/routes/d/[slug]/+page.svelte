<script lang="ts">
	import Download from 'lucide-svelte/icons/download';
	import FileIcon from 'lucide-svelte/icons/file';
	import { fmtBytes, fmtDate } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The name already carries the extension, so the line under it is the
	// size — what decides whether to tap Download on a phone — and the dates.
	let sub = $derived(
		[
			fmtBytes(data.file.bytes),
			fmtDate(data.file.created_at),
			data.file.expires_at ? `Expires ${fmtDate(data.file.expires_at)}` : null
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<svelte:head>
	<title>{data.file.name} · ij5</title>
	<meta name="description" content={`Download ${data.file.name} (${fmtBytes(data.file.bytes)}) from ij5.dev`} />
	<link rel="canonical" href="{data.origin}/d/{data.file.slug}" />
	<!-- Files are shared, not published: noindex keeps a download link from
	     becoming a permanent search result. -->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main
	class="mx-auto flex min-h-dvh max-w-[26rem] flex-col pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] sm:pt-12"
>
	<nav class="flex justify-center">
		<a
			href="/"
			class="rounded-[var(--radius-ui-sm)] px-2 py-1.5 text-[0.9375rem] font-semibold tracking-[-0.01em] transition-colors duration-150 ease-out hover:text-accent"
		>
			ij5.dev
		</a>
	</nav>

	<!-- The hero object rises in on load: a rare screen, so the small delight is
	     warranted. `animate-rise` collapses to instant under reduced motion. -->
	<section
		class="animate-rise my-auto flex flex-col items-center rounded-[var(--radius-widget)] bg-surface px-6 pt-9 pb-6 text-center shadow-[var(--shadow-widget)] [corner-shape:squircle] sm:my-16"
	>
		<div
			class="mb-5 grid size-14 place-items-center rounded-[var(--radius-inner-lg)] bg-surface-sunken text-text-muted [corner-shape:squircle]"
			aria-hidden="true"
		>
			<FileIcon size={24} strokeWidth={1.75} />
		</div>

		<h1 class="text-lg leading-snug font-semibold tracking-[-0.014em] [overflow-wrap:anywhere]">
			{data.file.name}
		</h1>
		<p class="mt-1.5 text-sm text-text-muted">{sub}</p>

		<!-- On hover the arrow nudges down — the direction a download travels.
		     Full width: on a phone this is the one thing the page is for. -->
		<a
			class="group mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-ui-lg)] bg-accent text-[0.9375rem] font-medium text-accent-contrast shadow-[inset_0_1px_0_oklch(1_0_0/0.12)] transition-[background-color,scale] duration-150 ease-[var(--ease-press)] hover:bg-accent-hover active:scale-[0.96] pointer-fine:h-11 pointer-fine:text-sm"
			href="/d/{data.file.slug}/file"
			rel="nofollow"
		>
			<Download
				size={17}
				aria-hidden="true"
				class="transition-transform duration-200 ease-out group-hover:translate-y-0.5"
			/>
			Download
		</a>
	</section>
</main>
