import { z } from 'zod';
import { defFor, fieldsFor, type WidgetKind } from './catalog';
import { parseLines, serializeLines } from './fields';

/**
 * Turns a submitted form into validated block data, driven by the same field
 * descriptors the editor renders from. The schema is shared between the two,
 * so a malformed block cannot be saved and the renderer never has to defend
 * against bad data.
 */

export type FieldErrors = Record<string, string>;

export type ParseResult =
	| { ok: true; data: Record<string, unknown> }
	| { ok: false; errors: FieldErrors; raw: Record<string, string> };

export function readRaw(kind: WidgetKind, form: FormData): Record<string, string> {
	const raw: Record<string, string> = {};
	for (const field of fieldsFor(kind)) {
		raw[field.name] = String(form.get(field.name) ?? '');
	}
	return raw;
}

export function parseBlockData(kind: WidgetKind, form: FormData): ParseResult {
	const def = defFor(kind);
	const raw = readRaw(kind, form);
	const shaped: Record<string, unknown> = {};

	for (const field of fieldsFor(kind)) {
		const value = raw[field.name];
		if (field.type === 'lines') {
			shaped[field.name] = parseLines(value, field.keys ?? ['label']);
		} else if (field.type === 'number') {
			shaped[field.name] = value === '' ? undefined : Number(value);
		} else {
			shaped[field.name] = value === '' ? undefined : value;
		}
	}

	const result = def.schema.safeParse(shaped);
	if (result.success) return { ok: true, data: result.data as Record<string, unknown> };

	const errors: FieldErrors = {};
	for (const issue of (result.error as z.ZodError).issues) {
		const key = String(issue.path[0] ?? '_');
		if (!errors[key]) errors[key] = issue.message;
	}
	return { ok: false, errors, raw };
}

/** The inverse, for populating the editor from a saved block. */
export function toFormValues(
	kind: WidgetKind,
	data: Record<string, unknown>
): Record<string, string> {
	const values: Record<string, string> = {};
	for (const field of fieldsFor(kind)) {
		const value = data[field.name];
		if (field.type === 'lines') {
			values[field.name] = serializeLines(
				value as Array<Record<string, unknown>>,
				field.keys ?? ['label']
			);
		} else {
			values[field.name] = value === undefined || value === null ? '' : String(value);
		}
	}
	return values;
}
