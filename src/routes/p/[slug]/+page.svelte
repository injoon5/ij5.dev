<script lang="ts">
	import Copy from 'lucide-svelte/icons/copy';
	import Check from 'lucide-svelte/icons/check';
	import { fmtDate } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Says "Copied" only when it was: a blocked clipboard leaves the label
	// alone, and the text is selectable anyway.
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(data.paste.body);
		} catch {
			return;
		}
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1600);
	};

	const swap = 'transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]';

	// The first line, truncated, as the page's description.
	let description = $derived.by(() => {
		const first = (data.paste.body.split('\n')[0] ?? '').trim();
		return first.length > 150 ? `${first.slice(0, 150)}…` : first;
	});

	let sub = $derived(
		[
			data.paste.note,
			fmtDate(data.paste.created_at),
			data.paste.expires_at ? `Expires ${fmtDate(data.paste.expires_at)}` : null
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
	class="mx-auto flex min-h-dvh max-w-[48rem] flex-col pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] sm:pt-12 sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))]"
>
	<nav class="mb-8 flex items-center justify-between sm:mb-10">
		<a
			href="/"
			class="-mx-2 rounded-[var(--radius-ui-sm)] px-2 py-1.5 text-[0.9375rem] font-semibold tracking-[-0.01em] transition-colors duration-150 ease-out hover:text-accent"
		>
			ij5.dev
		</a>
		<div class="flex items-center gap-1">
			<a
				href="/raw/{data.paste.slug}"
				rel="nofollow"
				class="flex h-9 items-center rounded-[var(--radius-ui)] px-3 text-sm font-medium text-text-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-text pointer-coarse:h-11"
			>
				Raw
			</a>
			<!-- Both glyphs stay mounted and cross-fade; the button holds its
			     width through the label change. -->
			<button
				type="button"
				onclick={copy}
				class="flex h-9 min-w-[6.25rem] items-center justify-center gap-1.5 rounded-[var(--radius-ui)] bg-surface px-3.5 text-sm font-medium shadow-[var(--shadow-widget)] transition-[scale,background-color] duration-150 ease-out hover:bg-surface-hover active:scale-[0.96] pointer-coarse:h-11"
			>
				<span class="relative grid size-[15px] place-items-center" aria-hidden="true">
					<Copy size={15} class="{swap} {copied ? 'scale-25 opacity-0 blur-[4px]' : ''}" />
					<Check
						size={15}
						class="{swap} absolute inset-0 text-success {copied ? '' : 'scale-25 opacity-0 blur-[4px]'}"
					/>
				</span>
				<span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
			</button>
		</div>
	</nav>

	<header class="mb-4 min-w-0 px-1">
		<h1 class="truncate text-xl font-semibold tracking-[-0.018em]">
			/p/{data.paste.slug}
		</h1>
		<p class="mt-1 text-sm text-text-muted">{sub}</p>
	</header>

	<!-- The body is escaped by Svelte's text interpolation, so a paste can
	     never turn itself into markup here. -->
	<pre
		class="animate-rise m-0 rounded-[var(--radius-widget)] bg-surface px-4 py-4 font-mono text-[13px] leading-[1.65] whitespace-pre-wrap shadow-[var(--shadow-widget)] [corner-shape:squircle] [overflow-wrap:anywhere] sm:px-6 sm:py-5 sm:text-[13.5px]">{data.paste.body}</pre>
</main>
