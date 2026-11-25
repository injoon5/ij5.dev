import { describe, expect, it } from 'vitest';
import { MAX_OBJECT_BYTES, MAX_PARTS, MIN_PART_BYTES, partSizeFor, uploadLimits } from './uploads';

const MiB = 1024 * 1024;

describe('uploadLimits', () => {
	it('defaults to parts that clear the Free/Pro 100 MB request limit', () => {
		const limits = uploadLimits();
		expect(limits.maxPartBytes).toBe(90 * MiB);
		expect(limits.maxPartBytes).toBeLessThan(100_000_000);
		expect(limits.maxFileBytes).toBe(90 * MiB * MAX_PARTS);
	});

	it('follows a bigger plan, but never past what R2 will store', () => {
		expect(uploadLimits('190').maxFileBytes).toBe(190 * MiB * MAX_PARTS);
		expect(uploadLimits('4000').maxFileBytes).toBe(MAX_OBJECT_BYTES);
	});

	it('ignores a setting R2 could not honour', () => {
		expect(uploadLimits('1').maxPartBytes).toBe(90 * MiB);
		expect(uploadLimits('nope').maxPartBytes).toBe(90 * MiB);
	});
});

describe('partSizeFor', () => {
	const limits = uploadLimits();

	it('keeps a small file in one part', () => {
		expect(partSizeFor(3 * MiB, limits)).toBeGreaterThanOrEqual(3 * MiB);
	});

	it('never goes under R2’s minimum part', () => {
		expect(partSizeFor(1, limits)).toBeGreaterThanOrEqual(MIN_PART_BYTES);
	});

	it('grows parts so any allowed file fits in 10,000 of them', () => {
		for (const size of [200 * MiB, 50 * 1024 * MiB, limits.maxFileBytes]) {
			const part = partSizeFor(size, limits)!;
			expect(part).toBeLessThanOrEqual(limits.maxPartBytes);
			expect(Math.ceil(size / part)).toBeLessThanOrEqual(MAX_PARTS);
		}
	});

	it('refuses a file over the limit', () => {
		expect(partSizeFor(limits.maxFileBytes + 1, limits)).toBeNull();
	});
});
