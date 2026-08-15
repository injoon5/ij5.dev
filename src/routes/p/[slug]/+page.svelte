<script lang="ts">
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

<main class="paste">
	<header class="paste-top">
		<a href="/" class="paste-brand">ij5.dev</a>
		<a href="/raw/{data.paste.slug}" class="paste-raw" rel="nofollow">Raw</a>
	</header>

	<header class="paste-meta">
		<div class="min-w-0">
			<h1 class="paste-slug">/{data.paste.slug}</h1>
			<p class="mt-1 truncate text-xs text-text-muted">{sub || '\u200b'}</p>
		</div>
		<Button variant="primary" size="sm" onclick={copy} aria-live="polite">
			{copied ? 'Copied' : 'Copy'}
		</Button>
	</header>

	<pre class="paste-body">{data.paste.body}</pre>

	<footer class="paste-foot">
		<a href="/">a paste on ij5.dev</a>
	</footer>
</main>

<style>
	.paste {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 46rem;
		margin-inline: auto;
		padding:
			clamp(1.5rem, 5vh, 3.5rem) max(1.25rem, env(safe-area-inset-right))
			calc(2.5rem + env(safe-area-inset-bottom))
			max(1.25rem, env(safe-area-inset-left));
	}

	.paste-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2.25rem;
	}

	.paste-brand {
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--text);
		text-decoration: none;
		transition: color 150ms var(--ease-out);
	}

	.paste-brand:hover {
		color: var(--accent);
	}

	.paste-raw {
		border-radius: var(--radius-ui-sm);
		padding: 0.375rem 0.75rem;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-muted);
		text-decoration: none;
		transition:
			color 150ms var(--ease-out),
			background-color 150ms var(--ease-out);
	}

	@media (hover: hover) and (pointer: fine) {
		.paste-raw:hover {
			color: var(--text);
			background-color: var(--surface);
		}
	}

	.paste-meta {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.paste-slug {
		font-family: var(--font-mono);
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.014em;
	}

	/* The body is escaped by Svelte's default text interpolation, so a paste
	   can never turn itself into markup here. */
	.paste-body {
		flex: 1;
		margin: 0;
		padding: 1.1rem 1.25rem;
		border-radius: var(--radius-widget);
		background-color: var(--surface);
		box-shadow: var(--shadow-widget);
		font-family: var(--font-mono);
		font-size: 13.5px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
		overflow-wrap: anywhere;
	}

	.paste-foot {
		padding-top: 2.5rem;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.004em;
		color: var(--text-muted);
	}

	.paste-foot a {
		color: inherit;
		text-decoration: none;
		transition: color 150ms var(--ease-out);
	}

	.paste-foot a:hover {
		color: var(--text);
	}
</style>
