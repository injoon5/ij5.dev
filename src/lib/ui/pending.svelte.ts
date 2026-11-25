import type { SubmitFunction } from '@sveltejs/kit';

/**
 * State for a progressively-enhanced form. One object per form:
 *
 *     const publishing = pending({ confirm: 'Publish now?' });
 *     <form use:enhance={publishing.submit}>
 *       <Button type="submit" busy={publishing.busy} busyLabel="Publishing…">
 *
 * - `confirm` asks first, and a "no" sends nothing;
 * - `reset` (default false) clears the form after a round trip — these are
 *   editors, and a save should not empty fields someone is still in;
 * - `flash` decides whether a success shows `saved` for a moment, so a save
 *   that changes nothing visible still says it happened.
 */
type Options = {
	confirm?: string | (() => string | null);
	reset?: () => boolean;
	flash?: () => boolean;
	/** Runs after a successful round trip, with whatever the action returned. */
	onSuccess?: (data: Record<string, unknown> | undefined) => void;
};

const FLASH_MS = 1600;

const declined = (question: Options['confirm']) => {
	const q = typeof question === 'function' ? question() : question;
	return Boolean(q) && !confirm(q!);
};

export function pending(options: Options = {}) {
	let busy = $state(false);
	let saved = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const submit: SubmitFunction = (input) => {
		if (declined(options.confirm)) return input.cancel();
		busy = true;
		return async ({ update, result }) => {
			await update({ reset: options.reset?.() ?? false });
			busy = false;
			if (result.type !== 'success') return;
			options.onSuccess?.(result.data);
			if (options.flash?.()) {
				saved = true;
				clearTimeout(timer);
				timer = setTimeout(() => (saved = false), FLASH_MS);
			}
		};
	};

	return {
		get busy() {
			return busy;
		},
		get saved() {
			return saved;
		},
		submit
	};
}

/**
 * The same for a list where each row has its own small form (remove, revoke):
 * `rows.submit(id)` for the row's `use:enhance`, `rows.busy(id)` for its state.
 */
export function pendingRows(options: { confirm?: (id: string) => string | null; onSuccess?: (id: string) => void } = {}) {
	let busy = $state<string | null>(null);

	const submit =
		(id: string): SubmitFunction =>
		(input) => {
			if (declined(() => options.confirm?.(id) ?? null)) return input.cancel();
			busy = id;
			return async ({ update, result }) => {
				await update();
				busy = null;
				if (result.type === 'success') options.onSuccess?.(id);
			};
		};

	return { submit, busy: (id: string) => busy === id };
}
