<script lang="ts">
	import Copy from 'lucide-svelte/icons/copy';
	import Check from 'lucide-svelte/icons/check';
	import Button from '$lib/ui/Button.svelte';
	import { fmtDate } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let copied = $state(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(data.paste.body);
		} catch {
			// Clipboard can be blocked outside secure contexts; the text is
			// selectable anyway.
		}
		copied = true;
		setTimeout(() => (copied = false), 1600);
	};

	// The first line, truncated, as the page's description.
	let description = $derived.by(() => {
		const first = (data.paste.body.split('\n')[0] ?? '').trim();
		return first.length > 150 ? `${first.slice(0, 150)}…` : first;
	});

	let sub = $derived(
		[
			data.paste.note,
			fmtDate(data.paste.created_at),
			data.paste.expires_at ? `expires ${fmtDate(data.paste.expires_at)}` : null
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<svelte:head>
	<title>/{data.paste.slug} · ij5</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="{data.origin}/p/{data.paste.slug}" />
	<!-- Pastes are throwaway by default: public, built for sharing, not for
	     search. `noindex` keeps an old snippet from lingering in results after
	     the owner has moved on. -->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main
	class="mx-auto flex min-h-dvh max-w-[46rem] flex-col pt-[clamp(1.5rem,5vh,3.5rem)] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]"
>
	<header class="mb-9 flex items-center justify-between">
		<a
			href="/"
			class="text-[15px] font-semibold tracking-[-0.01em] transition-colors duration-150 ease-out hover:text-accent"
		>
			ij5.dev
		</a>
		<a
			href="/raw/{data.paste.slug}"
			rel="nofollow"
			class="rounded-[var(--radius-ui-sm)] px-3 py-1.5 font-mono text-xs text-text-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-text"
		>
			Raw
		</a>
	</header>

	<header class="mb-4 flex items-start justify-between gap-4">
		<div class="min-w-0">
			<h1 class="font-mono text-lg font-semibold tracking-[-0.014em]">/{data.paste.slug}</h1>
			<p class="mt-1 truncate text-xs text-text-muted">{sub || '​'}</p>
		</div>
		<!-- Fixed width so the label swap from Copy → Copied never resizes the
		     button mid-press; the icon morphs alongside it. -->
		<Button variant="primary" size="sm" onclick={copy} aria-live="polite" class="min-w-[6rem]">
			{#if copied}
				<Check size={15} aria-hidden="true" />Copied
			{:else}
				<Copy size={15} aria-hidden="true" />Copy
			{/if}
		</Button>
	</header>

	<!-- The body is escaped by Svelte's default text interpolation, so a paste
	     can never turn itself into markup here. -->
	<pre
		class="animate-rise m-0 flex-1 rounded-[var(--radius-widget)] bg-surface px-5 py-[1.1rem] font-mono text-[13.5px] leading-[1.6] whitespace-pre-wrap shadow-[var(--shadow-widget)] [corner-shape:squircle] [overflow-wrap:anywhere] [word-break:break-word]">{data.paste.body}</pre>

	<footer class="pt-10 font-mono text-xs text-text-muted">
		<a href="/" class="transition-colors duration-150 ease-out hover:text-text">a paste on ij5.dev</a>
	</footer>
</main>
