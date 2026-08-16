<script lang="ts">
	export type HomeOgProps = {
		name: string;
		tagline: string | null;
		/** Link labels, already capped for the row. */
		links: string[];
		domain: string;
	};

	let { name, tagline, links, domain }: HomeOgProps = $props();
</script>

<!--
	The share card for `/`. One light ground, three steps of the site's neutral
	scale, no icons: the domain mark, then a name and tagline that carry the
	whole message, then the row of link labels that proves the page links out.
	Every size is set large enough to survive a preview scaled down to a few
	hundred pixels.
-->
<div
	style="box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100%;padding:80px 100px 72px;background:#f4f4f4;color:#1b1b1b;"
>
	<div style="font-family:'Geist Mono';font-size:26px;line-height:1;color:#7b7b7b;">
		{domain}
	</div>

	<div style="display:flex;flex-direction:column;margin:auto 0;">
		<div
			style="font-family:'Inter';font-size:100px;font-weight:700;letter-spacing:-0.035em;line-height:1.02;color:#1b1b1b;"
		>
			{name}
		</div>
		{#if tagline}
			<div
				style="margin-top:26px;max-width:34ch;font-family:'Inter';font-size:36px;font-weight:400;letter-spacing:-0.012em;line-height:1.45;color:#686868;"
			>
				{tagline}
			</div>
		{/if}
	</div>

	{#if links.length}
		<div style="display:flex;align-items:center;justify-content:space-between;">
			<div style="font-family:'Geist Mono';font-size:24px;color:#7b7b7b;">
				Links&nbsp;→
			</div>
			<div
				style="display:flex;align-items:center;gap:16px;font-family:'Inter';font-size:27px;font-weight:500;letter-spacing:-0.008em;color:#1b1b1b;"
			>
				{#each links as link, i}
					{#if i > 0}
						<span style="color:#c8c8c8;">·</span>
					{/if}
					<span>{link}</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
