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

	// The size already sits in `.file-sub` above this line, so it is deliberately
	// left out here rather than repeated.
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

<main class="file">
	<header class="file-top">
		<a href="/" class="file-brand">ij5.dev</a>
	</header>

	<section class="file-card">
		<div class="file-icon" aria-hidden="true">
			<FileIcon size={22} />
		</div>

		<h1 class="file-name" title={data.file.name}>{data.file.name}</h1>
		<p class="file-sub">
			{ext ? `${ext.toUpperCase()} · ` : ''}{fmtBytes(data.file.bytes)}
		</p>
		<p class="file-meta">{sub}</p>

		<a class="file-dl" href="/d/{data.file.slug}/file" rel="nofollow">
			<Download size={16} aria-hidden="true" />
			Download
		</a>
	</section>

	<footer class="file-foot">
		<a href="/">file on ij5.dev</a>
	</footer>
</main>

<style>
	.file {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 30rem;
		margin-inline: auto;
		padding:
			clamp(2.5rem, 10vh, 5rem) max(1.25rem, env(safe-area-inset-right))
			calc(2.5rem + env(safe-area-inset-bottom))
			max(1.25rem, env(safe-area-inset-left));
	}

	.file-top {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 2rem;
	}

	.file-brand {
		font-size: 15px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--text);
		text-decoration: none;
		transition: color 150ms var(--ease-out);
	}

	.file-brand:hover {
		color: var(--accent);
	}

	.file-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 2.25rem 1.5rem;
		border-radius: var(--radius-widget);
		background-color: var(--surface);
		box-shadow: var(--shadow-widget);
	}

	.file-icon {
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		margin-bottom: 1.1rem;
		border-radius: var(--radius-inner-lg);
		background-color: var(--surface-sunken);
		color: var(--text-muted);
	}

	.file-name {
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.014em;
		overflow-wrap: anywhere;
	}

	.file-sub {
		margin-top: 0.4rem;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-subtle);
	}

	.file-meta {
		margin-top: 0.75rem;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.file-dl {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1.75rem;
		border-radius: var(--radius-ui);
		background-color: var(--accent);
		padding: 0.625rem 1.5rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--accent-contrast);
		text-decoration: none;
		transition:
			background-color 150ms var(--ease-out),
			scale 150ms var(--ease-press);
	}

	.file-dl:hover {
		background-color: var(--accent-hover);
	}

	.file-dl:active {
		scale: 0.97;
	}

	.file-foot {
		padding-top: 2.5rem;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.004em;
		color: var(--text-muted);
		text-align: center;
	}

	.file-foot a {
		color: inherit;
		text-decoration: none;
		transition: color 150ms var(--ease-out);
	}

	.file-foot a:hover {
		color: var(--text);
	}
</style>
