import { describe, expect, it } from 'vitest';
import { dateInput, endOfDay, isExpired } from './expiry';

describe('expiry', () => {
	it('lasts to the end of the chosen day, UTC, and shows that same day again', () => {
		const exp = endOfDay('2026-03-14')!;
		expect(isExpired(exp, Date.parse('2026-03-14T23:59:58Z'))).toBe(false);
		expect(isExpired(exp, Date.parse('2026-03-15T00:00:00Z'))).toBe(true);
		expect(dateInput(exp)).toBe('2026-03-14');
	});

	it('treats blank or nonsense as no expiry', () => {
		for (const v of ['', '  ', null, undefined, 'soon']) expect(endOfDay(v)).toBeNull();
		expect(isExpired(null)).toBe(false);
		expect(dateInput(null)).toBe('');
	});
});
