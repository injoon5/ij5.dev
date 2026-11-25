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

/**
 * Serializes items back to `a | b | c` lines. Generic over the keys so a typed
 * item (e.g. `ProfileLink[]`) is assignable without a cast.
 */
export function serializeLines<T extends string>(
	items: Array<Partial<Record<T, string>>> | undefined,
	keys: T[]
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
