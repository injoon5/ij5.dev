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

/** 512 → "512 B", 12_000 → "12 KB", 1_500_000 → "1.4 MB", 3 GiB → "3 GB",
 *  12.4 GiB → "12 GB". One decimal only while it still means something. */
export function fmtBytes(n: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = n;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	if (unit === 0) return `${n} B`;
	if (unit === 1 || value >= 10) return `${Math.round(value)} ${units[unit]}`;
	return `${value.toFixed(1).replace(/\.0$/, '')} ${units[unit]}`;
}
