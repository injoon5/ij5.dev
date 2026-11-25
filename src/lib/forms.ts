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

/**
 * Reads `fields` out of a form and parses them: either the data, or the first
 * message per field. `values` is what was typed, to echo back so a typo never
 * costs the whole form.
 */
export function parseForm<T extends z.ZodType>(schema: T, data: FormData, fields: readonly string[]) {
	const values = Object.fromEntries(fields.map((k) => [k, String(data.get(k) ?? '')]));
	const result = schema.safeParse(values);
	return result.success
		? { ok: true as const, values, data: result.data as z.infer<T> }
		: { ok: false as const, values, fields: fieldErrors(result.error) };
}
