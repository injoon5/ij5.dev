/**
 * Declarative field descriptors.
 *
 * The editor is generated from these rather than hand-written per kind, which
 * is what keeps "adding a widget" to a single registry entry. It also means
 * every form gets the same labels, hints, and validation wiring — a widget
 * cannot quietly ship a worse form than its neighbours.
 */

export type FieldType =
	| 'text'
	| 'url'
	| 'textarea'
	| 'number'
	| 'asset'
	| 'select'
	| 'lines';

export type Field = {
	name: string;
	label: string;
	type: FieldType;
	placeholder?: string;
	/** Shown under the input. Say what the field does, not what it is. */
	hint?: string;
	optional?: boolean;
	options?: Array<{ value: string; label: string }>;
	/** For `lines` fields: which key each `|`-separated column maps to. */
	keys?: string[];
};

/**
 * `lines` fields are edited as one item per line, `a | b | c`. A repeater with
 * add/remove buttons would need JavaScript to be usable; a textarea does not,
 * and the bento editor has to keep working with JS off like everything else.
 */
export function parseLines(raw: string, keys: string[]): Array<Record<string, string>> {
	return raw
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const parts = line.split('|').map((p) => p.trim());
			const out: Record<string, string> = {};
			keys.forEach((key, i) => {
				if (parts[i]) out[key] = parts[i];
			});
			return out;
		});
}

export function serializeLines(
	items: Array<Record<string, unknown>> | undefined,
	keys: string[]
): string {
	if (!items?.length) return '';
	return items
		.map((item) =>
			keys
				.map((k) => (item[k] ?? '') as string)
				.join(' | ')
				.replace(/(\s*\|\s*)+$/, '')
		)
		.join('\n');
}
