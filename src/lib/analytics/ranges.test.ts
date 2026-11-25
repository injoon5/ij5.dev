import { describe, expect, it } from 'vitest';
import { RANGES, fillDays } from './ranges';

const NOW = Date.parse('2026-10-27T15:00:00Z');

describe('fillDays', () => {
	it('gives a range exactly as many days as its label, today included', () => {
		const days = fillDays([{ day: '2026-10-27', hits: 1 }], RANGES['7d'], NOW);
		expect(days).toHaveLength(7);
		expect(days[0].day).toBe('2026-10-21');
		expect(days.at(-1)?.day).toBe('2026-10-27');
	});

	it('fills quiet days with zero instead of drawing across them', () => {
		const days = fillDays(
			[
				{ day: '2026-10-21', hits: 4 },
				{ day: '2026-10-27', hits: 2 }
			],
			RANGES['7d'],
			NOW
		);
		expect(days.map((d) => d.hits)).toEqual([4, 0, 0, 0, 0, 0, 2]);
	});

	it('starts "all time" at the first recorded day', () => {
		const days = fillDays([{ day: '2026-10-25', hits: 1 }], RANGES.all, NOW);
		expect(days.map((d) => d.day)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27']);
	});

	it('stays empty when nothing was recorded', () => {
		expect(fillDays([], RANGES['30d'], NOW)).toEqual([]);
	});
});
