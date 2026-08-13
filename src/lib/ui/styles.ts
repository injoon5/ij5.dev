/**
 * The handful of class strings that would otherwise drift between screens.
 * Kept as constants rather than components because an `<input>` wrapped in a
 * component loses the native attributes forms depend on.
 */

/** The border token and the focus accent are the only two things that change
 *  between a valid and invalid field, so one template builds both rather than
 *  two strings that could drift. */
export function inputClass(invalid = false): string {
	const border = invalid ? 'var(--danger)' : 'var(--border-subtle)';
	const focus = invalid ? '' : 'focus:shadow-[inset_0_0_0_1px_var(--accent)] ';
	return `w-full rounded-[var(--radius-ui)] bg-surface px-3 py-2.5 text-text shadow-[inset_0_0_0_1px_${border}] transition-shadow duration-150 ease-out placeholder:text-text-subtle ${focus}focus-visible:outline-none pointer-fine:py-2`;
}

export const fieldClass = (invalid = false) => inputClass(invalid);

export const card = 'rounded-[var(--radius-ui-lg)] bg-surface p-5';
