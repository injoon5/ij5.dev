import { describe, expect, it } from 'vitest';
import { fmtBytes } from './format';

describe('fmtBytes', () => {
	it('reads naturally at every scale', () => {
		expect(fmtBytes(512)).toBe('512 B');
		expect(fmtBytes(12_000)).toBe('12 KB');
		expect(fmtBytes(1_500_000)).toBe('1.4 MB');
		expect(fmtBytes(25 * 1024 ** 2)).toBe('25 MB');
		expect(fmtBytes(3 * 1024 ** 3)).toBe('3 GB');
		expect(fmtBytes(879 * 1024 ** 3)).toBe('879 GB');
		expect(fmtBytes(4.9 * 1024 ** 4)).toBe('4.9 TB');
	});
});
