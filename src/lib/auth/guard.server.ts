import { fail } from '@sveltejs/kit';

/**
 * What a `limited` session (password + puzzle) may not do: anything on the
 * security page, and anything that deletes. It can still read everything and
 * create or edit — the point of it is getting something done from a borrowed
 * computer, not getting the keys to the house.
 */

export const FULL_ONLY =
	'This needs a full sign-in: a passkey, the admin token, or the password with a recovery code.';

export const isFull = (locals: App.Locals) => locals.session?.strength === 'full';

/**
 * For form actions: `const denied = requireFull(locals, 'delete'); if (denied) return denied;`
 * `intent` is the one the page shows the action's errors under.
 */
export function requireFull(locals: App.Locals, intent?: string) {
	return isFull(locals) ? null : fail(403, { intent, error: FULL_ONLY });
}
