/**
 * Shared between the load function and the picker. `hits` is day-granular, so
 * "24 hours" means today and yesterday rather than a rolling window — worth
 * knowing before reading too much into the shortest range.
 */
export const RANGES = {
	'24h': '-1 day',
	'7d': '-7 day',
	'30d': '-30 day',
	'90d': '-90 day',
	all: '-100 year'
} as const;

export type RangeKey = keyof typeof RANGES;

export const RANGE_LABELS: Array<{ key: RangeKey; label: string }> = [
	{ key: '24h', label: '24 hours' },
	{ key: '7d', label: '7 days' },
	{ key: '30d', label: '30 days' },
	{ key: '90d', label: '90 days' },
	{ key: 'all', label: 'All time' }
];

export const isRange = (v: string | null): v is RangeKey => v !== null && v in RANGES;
