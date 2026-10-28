<script lang="ts">
	import Copy from 'lucide-svelte/icons/copy';
	import Check from 'lucide-svelte/icons/check';
	import { iconButton } from './styles';

	/**
	 * Copies a string, and only says "copied" when it was. The check holds for
	 * a beat so the eye catches it, then the control goes back to its resting
	 * state.
	 */
	let { text, label = 'Copy link' }: { text: string; label?: string } = $props();

	let copied = $state(false);

	const swap = 'transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]';
	const shown = 'opacity-100 scale-100 blur-0';
	const hidden = 'opacity-0 scale-25 blur-[4px]';
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Blocked outside a secure context; nothing was copied, so say nothing.
			return;
		}
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1400);
	}
</script>

<!-- Both glyphs stay mounted and cross-fade: the check grows in from a blur as
     the copy icon shrinks away, so the confirmation reads as the same control
     changing state rather than one icon being swapped for another. -->
<button
	type="button"
	class={iconButton}
	onclick={copy}
	aria-label={label}
	title={label}
>
	<Copy size={15} aria-hidden="true" class="{swap} {copied ? hidden : shown}" />
	<Check size={15} aria-hidden="true" class="{swap} absolute inset-0 m-auto text-success {copied ? shown : hidden}" />
</button>
<span class="sr-only" role="status">{copied ? 'Copied' : ''}</span>
