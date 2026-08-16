<script lang="ts">
	import Download from 'lucide-svelte/icons/download';
	import FileIcon from 'lucide-svelte/icons/file';
	import { fmtBytes, fmtDate } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let ext = $derived.by(() => {
		const dot = data.file.name.lastIndexOf('.');
		return dot > 0 ? data.file.name.slice(dot + 1).toLowerCase() : '';
	});

	// The size already sits in the sub line above, so it is deliberately left
	// out here rather than repeated.
	let sub = $derived(
		[
			`uploaded ${fmtDate(data.file.created_at)}`,
			data.file.expires_at ? `expires ${fmtDate(data.file.expires_at)}` : null,
			`${data.file.downloads} ${data.file.downloads === 1 ? 'download' : 'downloads'}`
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
	class="mx-auto flex min-h-dvh max-w-[30rem] flex-col pt-[clamp(2.5rem,10vh,5rem)] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]"
>
	<header class="mb-8 flex justify-center">
		<a
			href="/"
			class="text-[15px] font-semibold tracking-[-0.01em] transition-colors duration-150 ease-out hover:text-accent"
		>
			ij5.dev
		</a>
	</header>

	<!-- The hero object rises in on load: a rare screen, so the small delight is
	     warranted. `animate-rise` collapses to instant under reduced motion. -->
	<section
		class="animate-rise flex flex-col items-center rounded-[var(--radius-widget)] bg-surface px-6 py-9 text-center shadow-[var(--shadow-widget)] [corner-shape:squircle]"
	>
		<div
			class="mb-[1.1rem] grid size-[3.25rem] place-items-center rounded-[var(--radius-inner-lg)] bg-surface-sunken text-text-muted"
			aria-hidden="true"
		>
			<FileIcon size={22} />
		</div>

		<h1 class="text-lg font-semibold tracking-[-0.014em] [overflow-wrap:anywhere]" title={data.file.name}>
			{data.file.name}
		</h1>
		<p class="mt-1.5 font-mono text-xs text-text-subtle">
			{ext ? `${ext.toUpperCase()} · ` : ''}{fmtBytes(data.file.bytes)}
		</p>
		<p class="mt-3 text-xs text-text-muted">{sub}</p>

		<!-- On hover the arrow nudges down — the direction a download travels. -->
		<a
			class="group mt-7 inline-flex items-center gap-2 rounded-[var(--radius-ui)] bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast transition-[background-color,scale] duration-150 ease-[var(--ease-press)] hover:bg-accent-hover active:scale-[0.97]"
			href="/d/{data.file.slug}/file"
			rel="nofollow"
		>
			<Download
				size={16}
				aria-hidden="true"
				class="transition-transform duration-200 ease-out group-hover:translate-y-0.5"
			/>
			Download
		</a>
	</section>

	<footer class="pt-10 text-center font-mono text-xs text-text-muted">
		<a href="/" class="transition-colors duration-150 ease-out hover:text-text">file on ij5.dev</a>
	</footer>
</main>
