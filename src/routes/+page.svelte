<script lang="ts">
	import { setContext } from 'svelte';
	import Block from '$lib/widgets/Block.svelte';
	import PlatformIcon from '$lib/widgets/PlatformIcon.svelte';
	import type { LiveDoc } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	setContext('assetsOrigin', data.assetsOrigin);

	let live = $derived((data.live ?? {}) as LiveDoc);
	let bio = $derived(data.profile.bio?.split(/\n+/).filter(Boolean) ?? []);
	let avatarUrl = $derived(
		data.profile.avatar ? `${data.assetsOrigin}/${data.profile.avatar}` : null
	);

	let title = $derived(data.profile.name);
	let description = $derived(
		data.profile.tagline ?? bio[0] ?? `${data.profile.name} — links, writing and work.`
	);

	// The first block above the fold is the LCP candidate. Everything else is
	// lazy; this one is not, and it is the only image the page prioritises.
	let firstBlockId = $derived(data.blocks.find((b) => b.kind !== 'heading')?.id);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://ij5.dev" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content="https://ij5.dev/og.png" />
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

<div class="page">
	<!--
		The identity rail is not a block: it is always present, always first, and
		never reorders, so it gets its own record and its own region.

		The footer sits inside the rail rather than after the grid. On desktop
		`justify-between` pins it to the bottom of the sticky column; on mobile
		it lands directly under the tagline. That keeps DOM order, reading order
		and visual order identical at every width, which is worth more than
		matching a sketch — and it is what makes the screen-reader pass free.
	-->
	<header class="rail">
		<div>
			{#if avatarUrl}
				<img
					src={avatarUrl}
					alt=""
					width="72"
					height="72"
					fetchpriority="high"
					class="size-18 rounded-full bg-surface-sunken object-cover"
				/>
			{:else}
				<div
					class="grid size-18 place-items-center rounded-full bg-surface-sunken text-xl font-semibold text-text-muted"
					aria-hidden="true"
				>
					{data.profile.name.charAt(0).toUpperCase()}
				</div>
			{/if}

			<h1 class="mt-5 text-2xl font-semibold">{data.profile.name}</h1>

			{#if data.profile.tagline}
				<p class="mt-1.5 text-md text-pretty text-text-muted">{data.profile.tagline}</p>
			{/if}

			{#if bio.length}
				<div class="mt-5 max-w-[40ch] space-y-3 text-base text-pretty text-text-muted">
					{#each bio as paragraph (paragraph)}
						<p>{paragraph}</p>
					{/each}
				</div>
			{/if}
		</div>

		{#if data.profile.links.length}
			<nav class="mt-8 lg:mt-0" aria-label="Elsewhere">
				<ul class="-ml-2.5 flex flex-wrap items-center gap-0.5">
					{#each data.profile.links as link (link.href)}
						<li>
							<a
								href={link.href}
								class="grid size-11 place-items-center rounded-full text-text-subtle transition-colors duration-150 ease-out hover:bg-surface hover:text-text"
								aria-label={link.label}
							>
								<PlatformIcon name={link.icon} size={19} />
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}
	</header>

	<main class="min-w-0">
		{#if data.blocks.length}
			<div class="bento-grid">
				{#each data.blocks as block (block.id)}
					<Block {block} live={live[block.id]?.data} eager={block.id === firstBlockId} />
				{/each}
			</div>
		{:else}
			<!-- Every list has a designed empty state, this one included. It is
			     what the site looks like on day one, so it should not look
			     broken. -->
			<div
				class="flex min-h-[16rem] flex-col items-center justify-center rounded-[var(--radius-widget-lg)] bg-surface p-10 text-center shadow-[var(--shadow-widget)]"
				style="corner-shape: squircle"
			>
				<p class="text-md font-semibold">Nothing published yet</p>
				<p class="mt-1.5 max-w-[36ch] text-sm text-pretty text-text-muted">
					Blocks added in the editor appear here once they are published.
				</p>
			</div>
		{/if}
	</main>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
		width: 100%;
		max-width: 90rem;
		min-height: 100dvh;
		margin-inline: auto;
		/* Safe areas, so nothing edge-anchored lands under a notch or the home
		   indicator. */
		padding: max(1.5rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
			max(2.5rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
	}

	.rail {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}

	@media (min-width: 1024px) {
		.page {
			flex-direction: row;
			gap: 3.5rem;
			padding-inline: 2.5rem;
			padding-block: 3.5rem;
		}

		.rail {
			position: sticky;
			top: 0;
			flex-shrink: 0;
			width: 23.75rem;
			height: 100dvh;
			padding-block: 3.5rem;
			/* Its own scroll only if the bio is unusually long. The rail not
			   moving while the grid scrolls is most of what makes the layout
			   read as designed rather than stacked. */
			overflow-y: auto;
			overscroll-behavior: contain;
			margin-block: -3.5rem;
		}

		main {
			flex: 1;
		}
	}
</style>
