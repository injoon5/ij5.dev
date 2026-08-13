/**
 * A textarea edited as one item per line, `a | b | c`. A repeater with
 * add/remove buttons would need JavaScript to be usable; a textarea does not,
 * so the profile-links field keeps working with JS off like everything else.
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
