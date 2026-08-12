<script lang="ts">
	import { card } from '$lib/ui/styles';

	/**
	 * Reference for the shortener API, written against the routes rather than
	 * generated from them — a generated page would be one more thing to keep
	 * running, and this API is five endpoints that change about once a year.
	 *
	 * Every example is copy-pasteable and none of them contain a real token.
	 */

	let origin = $state('https://ij5.dev');

	// The examples should address whatever host you are reading them on, so a
	// preview deployment does not hand you curl lines pointing at production.
	$effect(() => {
		origin = window.location.origin;
	});

	type Endpoint = {
		method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
		path: string;
		summary: string;
		body?: string;
		returns: string;
	};

	const ENDPOINTS: Endpoint[] = [
		{
			method: 'GET',
			path: '/api/links',
			summary: 'Every link, newest first.',
			returns: '{ "links": [ … ] }'
		},
		{
			method: 'POST',
			path: '/api/links',
			summary: 'Create a link. Fails if the slug is taken or reserved.',
			body: `{
  "slug": "talk",
  "url": "https://example.com/watch",
  "status": 302,
  "note": "Conference talk",
  "expires_at": null
}`,
			returns: '201 with the created link'
		},
		{
			method: 'GET',
			path: '/api/links/{slug}',
			summary: 'One link.',
			returns: 'The link, or 404'
		},
		{
			method: 'PATCH',
			path: '/api/links/{slug}',
			summary:
				'Change a link. Send only the fields you are changing; null clears note or expiry.',
			body: `{ "url": "https://example.com/new" }`,
			returns: 'The updated link'
		},
		{
			method: 'DELETE',
			path: '/api/links/{slug}',
			summary: 'Remove a link from D1 and KV.',
			returns: '{ "slug": "talk", "deleted": true }'
		}
	];

	const FIELDS = [
		['slug', 'string', 'Letters, numbers, hyphens, underscores. 1–64 characters, no leading separator.'],
		['url', 'string', 'Absolute URL including the scheme.'],
		['status', '301 | 302', 'Defaults to 302. A 301 is cached by the browser forever — only for links you will never repoint.'],
		['note', 'string | null', 'Yours, never served to visitors.'],
		['expires_at', 'number | null', 'Epoch milliseconds. Checked lazily on read; the row survives for history.']
	];

	const STATUSES = [
		['401', 'Missing or wrong bearer token.'],
		['404', 'No link with that slug.'],
		['409', 'Slug is taken, or reserved by the site itself.'],
		['422', 'Body failed validation. The response carries a `fields` object.'],
		['503', 'Deployment has no bindings or no configured token.']
	];
</script>

<svelte:head><title>API · ij5</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold">API</h1>
	<p class="mt-1 max-w-[68ch] text-sm text-pretty text-text-muted">
		A REST interface to the shortener, for scripts and shortcuts. Links created here mirror into
		KV exactly like links created in the UI, so a new slug resolves on the next request.
	</p>
</header>

<section class="{card} mb-4">
	<h2 class="text-sm font-semibold">Authentication</h2>
	<p class="mt-1 max-w-[68ch] text-sm text-pretty text-text-muted">
		Send the same token you sign in with as a bearer header. The session cookie is deliberately
		not accepted: a cookie rides along on any request a browser is talked into making, and a
		token has to be supplied on purpose. Rotate it by changing <code>AUTH_HASH</code>.
	</p>

	<pre class="snippet mt-3">curl {origin}/api/links \
  -H "Authorization: Bearer $IJ5_TOKEN"</pre>
</section>

<section class="{card} mb-4">
	<h2 class="text-sm font-semibold">Endpoints</h2>

	<ul class="mt-3 flex flex-col gap-4">
		{#each ENDPOINTS as endpoint (endpoint.method + endpoint.path)}
			<li class="endpoint">
				<p class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
					<span class="method" data-method={endpoint.method}>{endpoint.method}</span>
					<code class="text-sm font-medium">{endpoint.path}</code>
				</p>
				<p class="mt-1.5 max-w-[68ch] text-sm text-pretty text-text-muted">{endpoint.summary}</p>

				{#if endpoint.body}
					<pre class="snippet mt-2">{endpoint.body}</pre>
				{/if}

				<p class="mt-1.5 text-xs text-text-subtle">
					Returns <code>{endpoint.returns}</code>
				</p>
			</li>
		{/each}
	</ul>
</section>

<div class="grid gap-4 lg:grid-cols-2">
	<section class={card}>
		<h2 class="text-sm font-semibold">Fields</h2>
		<dl class="mt-3 flex flex-col gap-3">
			{#each FIELDS as [name, type, description] (name)}
				<div>
					<dt class="flex flex-wrap items-baseline gap-2">
						<code class="text-sm font-medium">{name}</code>
						<span class="text-xs text-text-subtle">{type}</span>
					</dt>
					<dd class="mt-0.5 max-w-[60ch] text-sm text-pretty text-text-muted">{description}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section class={card}>
		<h2 class="text-sm font-semibold">Errors</h2>
		<p class="mt-1 text-sm text-text-muted">
			Every failure is JSON with an <code>error</code> sentence.
		</p>
		<dl class="mt-3 flex flex-col gap-3">
			{#each STATUSES as [code, meaning] (code)}
				<div class="flex gap-3">
					<dt class="tnum w-8 shrink-0 text-sm font-medium">{code}</dt>
					<dd class="max-w-[52ch] text-sm text-pretty text-text-muted">{meaning}</dd>
				</div>
			{/each}
		</dl>
	</section>
</div>

<section class="{card} mt-4">
	<h2 class="text-sm font-semibold">Create a link</h2>
	<pre class="snippet mt-3">curl -X POST {origin}/api/links \
  -H "Authorization: Bearer $IJ5_TOKEN" \
  -H "Content-Type: application/json" \
  -d '&lbrace;"slug":"talk","url":"https://example.com/watch"&rbrace;'</pre>
</section>

<style>
	.snippet {
		overflow-x: auto;
		border-radius: var(--radius-ui);
		background-color: var(--surface-sunken);
		padding: 0.875rem 1rem;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.65;
		/* Long URLs scroll inside the block rather than widening the page. */
		white-space: pre;
		-webkit-overflow-scrolling: touch;
	}

	code {
		font-family: var(--font-mono);
	}

	.endpoint + .endpoint {
		border-top: 1px solid var(--border-subtle);
		padding-top: 1rem;
	}

	/*
	 * The verb is the fastest thing to scan for, so it gets weight and a
	 * monospace box rather than a coloured pill per method: five accent colours
	 * in one list is decoration, and DELETE is the only one worth flagging.
	 */
	.method {
		font-family: var(--font-mono);
		font-size: var(--text-2xs);
		font-weight: 600;
		color: var(--text-subtle);
	}

	.method[data-method='DELETE'] {
		color: var(--danger);
	}
</style>
