import { z } from 'zod';
import { SLUG_MESSAGE, SLUG_PATTERN } from '$lib/slugs/slugs';
import { isTargetUrl, NOTE_MAX, TARGET_MESSAGE } from './link';

/**
 * The rules for a link's fields, shared by the admin form and the JSON API so
 * the two can never accept different links.
 *
 * 301 is cached by browsers indefinitely, so it is opt-in: a permanent
 * redirect cannot be recalled from anyone who already followed it.
 */
export const linkFields = {
	slug: z.string().trim().regex(SLUG_PATTERN, SLUG_MESSAGE),
	url: z.string().trim().refine(isTargetUrl, TARGET_MESSAGE),
	status: z.union([z.literal(301), z.literal(302)], { error: 'Pick temporary or permanent.' }),
	note: z.string().trim().max(NOTE_MAX)
};

/** `{ field: first message }` from a failed parse. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = String(issue.path[0] ?? '');
		fields[key] ??= issue.message;
	}
	return fields;
}
