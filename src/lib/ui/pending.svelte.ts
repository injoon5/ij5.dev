import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Pending state for a progressively-enhanced form. One object per form:
 *
 *     const publishing = pending();
 *     <form use:enhance={publishing.submit}>
 *       <Button type="submit" busy={publishing.busy} busyLabel="Publishing…">
 *
 * `reset` defaults to false: these are editors, and a round trip should not
 * empty fields someone is still in. Pass a function when it depends on props.
 */
export function pending(
	options: { reset?: boolean | (() => boolean); onSuccess?: () => void } = {}
) {
	let busy = $state(false);

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ update, result }) => {
			const reset = typeof options.reset === 'function' ? options.reset() : (options.reset ?? false);
			await update({ reset });
			busy = false;
			if (result.type === 'success') options.onSuccess?.();
		};
	};

	return {
		get busy() {
			return busy;
		},
		submit
	};
}
