import type { z } from 'zod';

/** `{ field: first message }` from a failed parse. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = String(issue.path[0] ?? '');
		fields[key] ??= issue.message;
	}
	return fields;
}
