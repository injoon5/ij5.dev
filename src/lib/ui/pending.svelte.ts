import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Pending state for a progressively-enhanced form.
 *
 * Every form in the admin posts and waits, but only the sign-in form and the
 * link editor ever said so — the other eight submitted in complete silence, so
 * pressing Publish on a slow connection looked exactly like pressing nothing.
 * The two that did handle it each rolled their own `submitting` flag, which is
 * how the same interaction ends up with two behaviours.
 *
 * One object per form:
 *
 *     const publishing = pending();
 *     <form use:enhance={publishing.submit}>
 *       <Button type="submit" busy={publishing.busy} busyLabel="Publishing…">
 *
 * `reset` defaults to false because these forms are editors — a server round
 * trip should not empty the fields someone is still working in. Set it true on
 * a create form, where an empty form is the point. Pass a function for either
 * option when it depends on props, so it is read at submit time rather than
 * captured when the form is first built.
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
