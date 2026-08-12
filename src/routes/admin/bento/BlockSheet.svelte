<script lang="ts">
	import { untrack, type Snippet } from 'svelte';

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
	 *
	 * Being interruptible is a property of the *plumbing* as much as the
	 * transition, and the plumbing here used to break it three ways:
	 *
	 *   - `transitionend` fired on whichever property finished first, and
	 *     opacity was 60ms shorter than transform, so every close tore the panel
	 *     off the screen before it reached the card. The listener now waits for
	 *     `transform` specifically, and the two exit durations match anyway.
	 *   - The safety timeout was never cancelled, so closing and reopening
	 *     inside its window slammed the dialog shut under the new selection.
	 *   - Reopening mid-exit hit `if (open && !el.open)` while the dialog was
	 *     still technically open, so the entrance never ran and the pending
	 *     close then took the panel away — leaving a URL that named a block and
	 *     no sheet on screen.
	 *
	 * All three are the same mistake: treating open and closed as states a
	 * transition merely decorates. `sync()` below owns the whole thing, and an
	 * exit is something that can be turned around rather than waited out.
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

	/** Matches the exit durations in the stylesheet, plus a frame of slack. */
	const EXIT_MS = 200;

	/** Teardown for the exit currently in flight, so an entrance can cancel it. */
	let cancelExit: (() => void) | null = null;

	$effect(() => {
		// The effect tracks the props only. Everything it *does* is untracked,
		// because `sync` writes `closing` and reads the DOM, and neither belongs
		// in the dependency graph.
		open;
		dialog;
		untrack(sync);
	});

	function sync() {
		const el = dialog;
		if (!el) return;
		if (open) enter(el);
		else if (el.open) exit(el);
	}

	function enter(el: HTMLDialogElement) {
		// A close still on its way to the card is turned around, not queued
		// behind. Because the transition lives on the element, clearing the
		// inline transform makes the browser interpolate from wherever the panel
		// actually is right now — the exit reverses out of its own midpoint
		// instead of restarting from the card.
		const reversing = Boolean(cancelExit);
		cancelExit?.();
		closing = false;

		if (!el.open) el.showModal();

		if (reduced() || !panel) {
			panel?.removeAttribute('style');
			return;
		}

		if (reversing) {
			panel.style.transform = '';
			panel.style.opacity = '';
			return;
		}

		const start = originTransform();
		panel.style.transition = 'none';
		panel.style.transform = start;
		panel.style.opacity = '0';
		// Two frames: one for the browser to accept the start state, one for the
		// transition to have something to interpolate from.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (!panel || !el.open) return;
				panel.style.transition = '';
				panel.style.transform = '';
				panel.style.opacity = '';
			});
		});
	}

	function exit(el: HTMLDialogElement) {
		if (cancelExit) return;

		if (reduced() || !panel) {
			panel?.removeAttribute('style');
			el.close();
			return;
		}

		// Back to where it came from — recomputed now, so a canvas that scrolled
		// while the sheet was open still returns the panel to the card's current
		// position rather than the one it had on the way in.
		closing = true;
		panel.style.transform = originTransform();
		panel.style.opacity = '0';

		const target = panel;

		// Only `transform` counts as arrival. Opacity finishing first is what
		// used to cut the return short.
		const onEnd = (event: TransitionEvent) => {
			if (event.target === target && event.propertyName === 'transform') finish();
		};

		// A transition that never fires — a background tab, a display that never
		// composites — must not leave the dialog stuck open.
		const timer = setTimeout(finish, EXIT_MS + 60);

		cancelExit = () => {
			clearTimeout(timer);
			target.removeEventListener('transitionend', onEnd);
			cancelExit = null;
		};

		target.addEventListener('transitionend', onEnd);

		function finish() {
			cancelExit?.();
			target.removeAttribute('style');
			closing = false;
			el.close();
		}
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

	/*
	 * The exit is a shade quicker than the entrance and its two durations are
	 * equal, so the panel finishes fading at the instant it lands on the card
	 * rather than 60ms before it gets there. Matched durations are also what
	 * lets `transitionend` on `transform` be a truthful "arrived".
	 */
	.sheet.is-closing .panel {
		transition:
			transform 200ms var(--ease-drawer),
			opacity 200ms var(--ease-out);
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
		.panel,
		.sheet.is-closing .panel {
			transition: none;
		}

		.sheet::backdrop,
		.sheet.is-closing::backdrop {
			animation: none;
		}
	}
</style>
