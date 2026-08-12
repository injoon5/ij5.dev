/**
 * The handful of class strings that would otherwise drift between screens.
 * Kept as constants rather than components because an `<input>` wrapped in a
 * component loses the native attributes forms depend on.
 */

export const inputClass =
	'w-full rounded-[var(--radius-ui)] bg-surface px-3 py-2.5 text-text shadow-[inset_0_0_0_1px_var(--border-subtle)] transition-shadow duration-150 ease-out placeholder:text-text-subtle focus:shadow-[inset_0_0_0_1px_var(--accent)] focus-visible:outline-none sm:py-2';

export const inputInvalidClass =
	'w-full rounded-[var(--radius-ui)] bg-surface px-3 py-2.5 text-text shadow-[inset_0_0_0_1px_var(--danger)] transition-shadow duration-150 ease-out placeholder:text-text-subtle focus-visible:outline-none sm:py-2';

export const card = 'rounded-[var(--radius-ui-lg)] bg-surface p-5';

export const cardSubtle = 'rounded-[var(--radius-ui-lg)] bg-surface-sunken p-5';

export const fieldClass = (invalid: boolean) => (invalid ? inputInvalidClass : inputClass);
