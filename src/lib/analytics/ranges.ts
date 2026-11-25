/**
 * Shared between the load function and the picker. Each offset feeds
 * `day >= date('now', offset)`, which includes today — so "7 days" is today and
 * the six before it, never eight calendar days. `hits` is day-granular (UTC),
 * so "24 hours" is today and yesterday: the shortest window that always
 * covers the last 24 hours in full.
 */
export const RANGES = {
	'24h': '-1 day',
	'7d': '-6 day',
	'30d': '-29 day',
	'90d': '-89 day',
	all: '-100 year'
} as const;

export type RangeKey = keyof typeof RANGES;

export const RANGE_LABELS: Array<{ key: RangeKey; label: string }> = [
	{ key: '24h', label: '24h' },
	{ key: '7d', label: '7d' },
	{ key: '30d', label: '30d' },
	{ key: '90d', label: '90d' },
	{ key: 'all', label: 'All' }
];

export const isRange = (v: string | null): v is RangeKey => v !== null && v in RANGES;

const DAY = 864e5;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * One point per day of the range, quiet days included. The table only holds
 * days that had traffic, and a line drawn straight across a missing week says
 * traffic held steady through it — the opposite of what happened. "All time"
 * starts at the first recorded day rather than a century of zeros.
 */
export function fillDays(
	rows: Array<{ day: string; hits: number }>,
	offset: string,
	now = Date.now()
): Array<{ day: string; hits: number }> {
	if (!rows.length) return [];
	const end = Date.parse(iso(now));
	const back = /^-(\d+) day$/.exec(offset);
	const start = back ? end - Number(back[1]) * DAY : Date.parse(rows[0].day);

	const byDay = new Map(rows.map((r) => [r.day, r.hits]));
	const out: Array<{ day: string; hits: number }> = [];
	for (let t = start; t <= end; t += DAY) {
		const day = iso(t);
		out.push({ day, hits: byDay.get(day) ?? 0 });
	}
	return out;
}
