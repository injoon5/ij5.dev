<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let avatarUrl = $derived(
		data.profile.avatar ? `${data.assetsOrigin}/${data.profile.avatar}` : null
	);

	let title = $derived(data.profile.name);
	let description = $derived(
		data.profile.tagline ?? `${data.profile.name} — writing, links and work.`
	);
	let year = new Date().getFullYear();
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />

	<link rel="canonical" href={data.publicOrigin} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={data.publicOrigin} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<!-- Cache-busted by filename on change, so this can be immutable. -->
	<meta property="og:image" content="{data.publicOrigin}/og.png" />
	<!-- Without explicit dimensions some clients fall back to a small square. -->
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />

	<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#18181d" media="(prefers-color-scheme: dark)" />

	{#if data.needsScript}
		<script src="/w.js" defer></script>
	{/if}
</svelte:head>

<main class="doc">
	<header class="masthead">
		{#if avatarUrl}
			<img
				class="avatar"
				src={avatarUrl}
				alt=""
				width="64"
				height="64"
				fetchpriority="high"
			/>
		{/if}
		<h1 class="masthead-name">{data.profile.name}</h1>
		{#if data.profile.tagline}
			<p class="masthead-tagline">{data.profile.tagline}</p>
		{/if}
	</header>

	<!--
		The document is authored as Markdown and rendered to HTML on the server;
		there is no untrusted HTML in it (the renderer escapes source markup and
		builds every element itself), so it is safe to inject here. This is the
		whole page body — prose, link buttons, images, the contribution graph.
	-->
	<article class="prose">{@html data.html}</article>

	<footer class="foot">
		<span>© {year} {data.profile.name}</span>
	</footer>
</main>
