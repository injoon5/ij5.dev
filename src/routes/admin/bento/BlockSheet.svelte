<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One surface, two shapes: a centred dialog from `md` up, a bottom drawer
	 * below it. Both are the same native `<dialog>`, so focus trapping, `Esc`,
	 * inertness of the page behind and the top layer all come from the platform
	 * rather than from a library and a pile of event handlers.
	 *
	 * Motion follows the two rules that matter here. It has a spatial origin —
	 * the panel scales out of the card that was pressed and returns to it — and
	 * it is interruptible, because it is a transform-and-opacity transition on a
	 * single element rather than a keyframe sequence that has to run to the end.
	 */

	type Props = {
		open: boolean;
		title: string;
		/** The element the panel should appear to come from. */
		origin?: HTMLElement | null;
		onClose: () => void;
		children: Snippet;
	};

	let { open, title, origin = null, onClose, children }: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let panel = $state<HTMLDivElement | null>(null);
	let closing = $state(false);

	/**
	 * The transform that maps the panel onto the card it came from. Applied at
	 * the start of the open and removed on the next frame, so the panel travels
	 * from the block's exact position rather than from a guessed direction.
	 */
	function originTransform(): string {
		if (!origin || !panel) return 'scale(0.96)';

		const from = origin.getBoundingClientRect();
		const to = panel.getBoundingClientRect();
		if (!to.width || !to.height) return 'scale(0.96)';

		const scale = Math.max(0.2, Math.min(from.width / to.width, 1));
		const dx = from.left + from.width / 2 - (to.left + to.width / 2);
		const dy = from.top + from.height / 2 - (to.top + to.height / 2);

		return `translate(${dx}px, ${dy}px) scale(${scale})`;
	}

	const reduced = () =>
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	$effect(() => {
		const el = dialog;
		if (!el) return;

		if (open && !el.open) {
			el.showModal();
			closing = false;

			if (!reduced() && panel) {
				const start = originTransform();
				panel.style.transition = 'none';
				panel.style.transform = start;
				panel.style.opacity = '0';
				// Two frames: one for the browser to accept the start state, one
				// for the transition to have something to interpolate from.
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						if (!panel) return;
						panel.style.transition = '';
						panel.style.transform = '';
						panel.style.opacity = '';
					});
				});
			}
		}

		if (!open && el.open) close();
	});

	function close() {
		const el = dialog;
		if (!el?.open) return;

		if (reduced() || !panel) {
			el.close();
			return;
		}

		// Back to where it came from. An exit that just fades leaves the card it
		// belongs to unaccounted for.
		closing = true;
		panel.style.transform = originTransform();
		panel.style.opacity = '0';

		const done = () => {
			panel?.removeAttribute('style');
			closing = false;
			el.close();
		};

		panel.addEventListener('transitionend', done, { once: true });
		// A transition that never fires — an interrupted animation, a background
		// tab — must not leave the dialog stuck open.
		setTimeout(done, 260);
	}
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	class:is-closing={closing}
	aria-label={title}
	onclose={onClose}
	onclick={(event) => {
		// Clicking the backdrop closes. The dialog element *is* the backdrop, so
		// a press that lands on it rather than on the panel is a press outside.
		if (event.target === dialog) onClose();
	}}
	oncancel={(event) => {
		// Esc, animated the same way as every other close.
		event.preventDefault();
		onClose();
	}}
>
	<div class="panel" bind:this={panel}>
		{@render children()}
	</div>
</dialog>

<style>
	.sheet {
		margin: 0;
		max-width: none;
		max-height: none;
		width: 100%;
		height: 100%;
		background: transparent;
		border: 0;
		padding: 0;
		overflow: hidden;
	}

	.sheet::backdrop {
		background-color: oklch(0 0 0 / 0.32);
		/* Blur as layering, not decoration: it puts the page behind the panel
		   rather than beside it. */
		backdrop-filter: blur(3px);
		animation: fade 180ms var(--ease-out);
	}

	.sheet.is-closing::backdrop {
		animation: fade 180ms var(--ease-out) reverse;
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	/* Mobile: a drawer off the bottom edge, where the thumb is. */
	.panel {
		position: fixed;
		inset: auto 0 0 0;
		max-height: min(86dvh, 46rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		border-radius: var(--radius-widget-lg) var(--radius-widget-lg) 0 0;
		background-color: var(--bg);
		padding: 1.25rem 1rem calc(1.25rem + env(safe-area-inset-bottom));
		box-shadow: var(--shadow-pop);
		transform-origin: center;
		transition:
			transform 220ms var(--ease-drawer),
			opacity 160ms var(--ease-out);
	}

	@media (min-width: 768px) {
		/* Desktop: a centred dialog. Same element, same motion, different shape. */
		.panel {
			inset: 50% auto auto 50%;
			translate: -50% -50%;
			width: min(34rem, calc(100vw - 4rem));
			max-height: min(84dvh, 48rem);
			border-radius: var(--radius-widget-lg);
			padding: 1.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.panel {
			transition: none;
		}

		.sheet::backdrop,
		.sheet.is-closing::backdrop {
			animation: none;
		}
	}
</style>
