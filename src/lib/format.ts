/**
 * The handful of display formatters shared across admin screens. Kept in one
 * place so a date or byte format cannot drift between the links list, the
 * security page and the file list.
 */

/** "5 Aug" — no year, for the recent list where the year is obvious. */
export function fmtDay(ms: number): string {
	return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(ms);
}

/** "5 Aug 2026" — full date for rows that span years. */
export function fmtDate(ms: number): string {
	return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
}

/** 512 → "512 B", 12_000 → "12 KB", 1_500_000 → "1.4 MB". */
export function fmtBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
