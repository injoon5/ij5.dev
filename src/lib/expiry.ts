/**
 * Expiry for links, pastes and files: chosen as a date in a form, stored as
 * epoch ms at the end of that day in UTC, judged lazily on read.
 */

/** `YYYY-MM-DD` → the last second of that day, UTC; blank or invalid → null. */
export function endOfDay(raw: string | null | undefined): number | null {
	const v = (raw ?? '').trim();
	return v ? Date.parse(`${v}T23:59:59Z`) || null : null;
}

/** Epoch ms → the `YYYY-MM-DD` a date input shows (the UTC day, matching `endOfDay`). */
export const dateInput = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

export const isExpired = (exp: number | null | undefined, now = Date.now()) => exp != null && exp <= now;
