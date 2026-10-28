<script lang="ts">
	import { page } from '$app/state';
	import CopyButton from '$lib/ui/CopyButton.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { card, cardTitle } from '$lib/ui/styles';

	/**
	 * Reference for the shortener API, written against the routes rather than
	 * generated from them — five endpoints that change about once a year do
	 * not earn a generator. Every example is copy-pasteable, addresses the
	 * host you are reading it on (so a preview deployment never hands you
	 * production curl lines), and none contains a real token.
	 */

	let origin = $derived(page.url.origin);

	type Endpoint = {
		method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
		path: string;
		summary: string;
		body?: string;
		returns: string;
	};

	const ENDPOINTS: Endpoint[] = [
		{ method: 'GET', path: '/api/links', summary: 'Every link, newest first.', returns: '{ "links": [ … ] }' },
		{
			method: 'POST',
			path: '/api/links',
			summary: 'Create a link.',
			body: `{
  "slug": "talk",
  "url": "https://example.com/watch",
  "status": 302,
  "note": "Conference talk",
  "expires_at": null
}`,
			returns: '201 and the link'
		},
		{ method: 'GET', path: '/api/links/{slug}', summary: 'One link.', returns: 'The link' },
		{
			method: 'PATCH',
			path: '/api/links/{slug}',
			summary: 'Change a link. Send only what changes; null clears the note or expiry.',
			body: `{ "url": "https://example.com/new" }`,
			returns: 'The updated link'
		},
		{
			method: 'DELETE',
			path: '/api/links/{slug}',
			summary: 'Delete a link.',
			returns: '{ "slug": "talk", "deleted": true }'
		}
	];

	const FIELDS = [
		['slug', 'string', 'Letters, numbers, hyphens and underscores, up to 64.'],
		['url', 'string', 'A full URL: https://, mailto:, tel: or sms:.'],
		['status', '301 | 302', '302 unless the link will never move — browsers cache a 301 for good.'],
		['note', 'string | null', 'For you; never shown to visitors.'],
		['expires_at', 'number | null', 'Epoch milliseconds.']
	];

	const STATUSES = [
		['400', 'The body is not JSON.'],
		['401', 'The bearer token is missing or wrong.'],
		['404', 'No link with that slug.'],
		['409', 'The slug is taken or reserved.'],
		['422', 'The body failed validation; its fields object names each problem.']
	];

	const method = {
		GET: 'text-text-muted',
		POST: 'text-success',
		PATCH: 'text-warning',
		DELETE: 'text-danger'
	};

	let auth = $derived(`curl ${origin}/api/links \\\n  -H "Authorization: Bearer $IJ5_TOKEN"`);
	let create = $derived(
		`curl -X POST ${origin}/api/links \\\n  -H "Authorization: Bearer $IJ5_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"slug":"talk","url":"https://example.com/watch"}'`
	);
</script>

<svelte:head><title>API</title></svelte:head>

{#snippet code(text: string)}
	<!-- Long lines scroll inside the block rather than widening the page. -->
	<div class="relative">
		<pre
			class="overflow-x-auto rounded-[var(--radius-ui)] bg-surface-sunken py-3 ps-4 pe-12 font-mono text-[12.5px] leading-[1.65] whitespace-pre">{text}</pre>
		<div
			class="absolute top-1 right-1 rounded-[var(--radius-ui-sm)] bg-surface-sunken shadow-[-12px_0_12px_var(--surface-sunken)]"
		>
			<CopyButton {text} label="Copy" />
		</div>
	</div>
{/snippet}

<PageHeader title="API" />

<div class="mx-auto flex max-w-3xl flex-col gap-8 px-4 pt-1 pb-10 md:px-6 md:pt-8">
	<section>
		<h2 class="{cardTitle} mb-1">Authentication</h2>
		<p class="mb-3 text-sm text-pretty text-text-muted">
			Send your sign-in token as a bearer token. The session cookie is not accepted here.
		</p>
		{@render code(auth)}
	</section>

	<section>
		<h2 class="{cardTitle} mb-3">Endpoints</h2>
		<ul class="{card} flex flex-col divide-y divide-border-subtle p-0 md:p-0">
			{#each ENDPOINTS as endpoint (endpoint.method + endpoint.path)}
				<li class="flex flex-col gap-2 p-4 md:p-5">
					<p class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
						<span class="w-14 shrink-0 font-mono text-xs font-semibold {method[endpoint.method]}">
							{endpoint.method}
						</span>
						<code class="font-mono text-sm font-medium">{endpoint.path}</code>
					</p>
					<p class="text-sm text-pretty text-text-muted">{endpoint.summary}</p>
					{#if endpoint.body}
						{@render code(endpoint.body)}
					{/if}
					<p class="text-xs text-text-muted">
						Returns <code class="font-mono text-text">{endpoint.returns}</code>
					</p>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="{cardTitle} mb-3">Fields</h2>
		<dl class="{card} flex flex-col divide-y divide-border-subtle p-0 md:p-0">
			{#each FIELDS as [name, type, description] (name)}
				<div class="grid gap-1 p-4 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-4 md:px-5">
					<dt class="flex flex-wrap items-baseline gap-x-2">
						<code class="font-mono text-sm font-medium">{name}</code>
						<span class="font-mono text-xs text-text-subtle">{type}</span>
					</dt>
					<dd class="text-sm text-pretty text-text-muted">{description}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section>
		<h2 class="{cardTitle} mb-1">Errors</h2>
		<p class="mb-3 text-sm text-text-muted">
			Every failure is JSON with an <code class="font-mono text-text">error</code> sentence.
		</p>
		<dl class="{card} flex flex-col divide-y divide-border-subtle p-0 md:p-0">
			{#each STATUSES as [status, meaning] (status)}
				<div class="flex gap-4 px-4 py-3 md:px-5">
					<dt class="w-9 shrink-0 font-mono text-sm font-medium">{status}</dt>
					<dd class="text-sm text-pretty text-text-muted">{meaning}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section>
		<h2 class="{cardTitle} mb-3">Example</h2>
		{@render code(create)}
	</section>
</div>
