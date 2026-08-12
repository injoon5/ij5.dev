<script lang="ts">
	import Mail from 'lucide-svelte/icons/mail';
	import Copy from 'lucide-svelte/icons/copy';
	import Check from 'lucide-svelte/icons/check';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();
</script>

<Surface {span} stretchedHref="mailto:{data.email}" label="Email {data.email}">
	<Mail size={22} class="text-text" aria-hidden="true" />

	<div class="relative z-2 mt-auto flex items-end justify-between gap-2 pt-3">
		<div class="min-w-0">
			<p class="truncate text-base font-semibold">{data.label || 'Email'}</p>
			<p class="mt-0.5 truncate text-xs text-text-muted">{data.email}</p>
		</div>

		<!--
			Copy is a real control rather than a hover-revealed affordance: on
			touch there is no hover, and the address is the thing most people
			actually want. `/w.js` wires the click, and the mailto underneath
			still works if the script never loads.
		-->
		<button
			type="button"
			data-copy={data.email}
			aria-label="Copy email address"
			class="copy widget-inner grid size-11 shrink-0 place-items-center bg-surface-sunken text-text-muted transition-colors duration-150 ease-out hover:text-text"
		>
			<span class="copy-idle"><Copy size={15} aria-hidden="true" /></span>
			<span class="copy-done text-success"><Check size={15} aria-hidden="true" /></span>
		</button>
	</div>
</Surface>

<style>
	/* Confirmation is a state swap, not an animation: this is a control people
	   press once, and a 200ms entrance on it would only be in the way. */
	.copy {
		display: grid;
	}

	.copy .copy-idle,
	.copy .copy-done {
		grid-area: 1 / 1;
		display: grid;
		place-items: center;
	}

	.copy .copy-done {
		visibility: hidden;
	}

	/* `data-copied` is set by `/w.js` at runtime, so the compiler cannot see
	   it in the markup and would otherwise prune these rules. */
	.copy:global([data-copied]) .copy-idle {
		visibility: hidden;
	}

	.copy:global([data-copied]) .copy-done {
		visibility: visible;
	}
</style>
