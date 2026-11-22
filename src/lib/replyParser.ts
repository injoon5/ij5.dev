import { TINTS, type Tint } from './types';

/**
 * Turns a chat reply — or a raw Swift file — into an app (Shelf plan §9.4).
 *
 * There are two copies of this parser: this one (the admin's New App form and
 * `PUT /api/apps/{slug}` with `Content-Type: text/x-swift`) and a Swift one in
 * Shelf. Both run against the same fixtures (`fixtures/replies/*.md`, each
 * with its expected result beside it), and the rules are written out in
 * `fixtures/replies/README.md`. Change a rule there, in both copies and in the
 * fixtures at once, or the phone and the server will name the same reply
 * differently.
 *
 * Deliberately plain: line-by-line, no Markdown library. A Markdown parser
 * would be "more correct" about edge cases a model never produces, and
 * matching its exact behaviour in Swift would be the hard part.
 */

export type ParsedReply = {
	name: string | null;
	icon: string | null;
	tint: Tint;
	slug: string;
	source: string;
};

const FENCE = '```';
const HEADER = /^\s*\/\/\s*(name|icon|tint)\s*:\s*(.*?)\s*$/i;
const isBlank = (line: string) => line.trim() === '';

/**
 * Line endings are normalised to "\n" before anything else (CRLF and a lone
 * CR alike), and one leading byte-order mark is dropped. A reply copied out of
 * a Windows tool would otherwise carry a "\r" into every header value and into
 * the stored source, and a BOM would hide the first `// Name:` line.
 */
function normalise(input: string): string {
	return input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** Every ```swift block, joined with a blank line; null when there are none. */
function swiftBlocks(lines: string[]): string | null {
	const blocks: string[][] = [];
	let current: string[] | null = null;
	let inFence = false;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith(FENCE)) {
			if (inFence) {
				// Any fence line closes the open block, swift or not.
				inFence = false;
				current = null;
			} else {
				inFence = true;
				const info = trimmed.replace(/^`+/, '').trim();
				if (info.toLowerCase().startsWith('swift')) {
					current = [];
					blocks.push(current);
				}
			}
			continue;
		}
		// An unclosed block runs to the end of the reply: a reply cut off
		// mid-file should still yield the code it has.
		current?.push(line);
	}

	return blocks.length ? blocks.map((b) => b.join('\n')).join('\n\n') : null;
}

/** Drops leading and trailing blank lines; ends in exactly one "\n". */
function tidy(text: string): string {
	const lines = text.split('\n');
	let start = 0;
	let end = lines.length;
	while (start < end && isBlank(lines[start])) start++;
	while (end > start && isBlank(lines[end - 1])) end--;
	return start === end ? '' : lines.slice(start, end).join('\n') + '\n';
}

/**
 * Reads `// Name:`, `// Icon:` and `// Tint:` from the top of the file only —
 * the leading run of `//` comments and blank lines. A `// Name:` further down
 * is part of the program (a comment above a view, say), never the header.
 * The first occurrence of each key wins, even when its value is empty.
 */
function header(source: string): Partial<Record<'name' | 'icon' | 'tint', string>> {
	const found: Partial<Record<'name' | 'icon' | 'tint', string>> = {};
	for (const line of source.split('\n')) {
		if (isBlank(line)) continue;
		if (!line.trim().startsWith('//')) break;
		const m = HEADER.exec(line);
		if (!m) continue;
		const key = m[1].toLowerCase() as 'name' | 'icon' | 'tint';
		if (!(key in found)) found[key] = m[2].trim();
	}
	return found;
}

/**
 * The slug for a name: accents folded away (NFKD, then combining marks
 * dropped), lowercase, every run of anything outside `[a-z0-9]` one hyphen,
 * no hyphen at either end, at most 64 characters. A name with nothing left —
 * all Hangul, say — becomes "app"; the slug is editable wherever it is shown.
 */
export function slugify(name: string | null): string {
	if (!name) return 'app';
	const slug = name
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64)
		.replace(/-+$/, '');
	return slug || 'app';
}

export function parseReply(input: string): ParsedReply {
	const text = normalise(input);
	const source = tidy(swiftBlocks(text.split('\n')) ?? text);
	const h = header(source);

	const name = h.name || null;
	const icon = h.icon || null;
	const tint = (h.tint ?? '').toLowerCase();

	return {
		name,
		icon,
		tint: (TINTS as readonly string[]).includes(tint) ? (tint as Tint) : 'blue',
		slug: slugify(name),
		source
	};
}
