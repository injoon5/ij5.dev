import { describe, expect, it } from 'vitest';
import { hashPassword, parseHash, verifyPassword } from './password.server';

// The smallest cost `parseHash` accepts, so the suite stays fast. Production
// uses 19 MiB × 2 passes.
const M = 8192;
const T = 1;

describe('password hashing', () => {
	const pepper = 'pepper-0123456789';
	const phc = hashPassword('correct horse', pepper, M, T);

	it('writes a standard PHC string', () => {
		expect(phc).toMatch(/^\$argon2id\$v=19\$m=8192,t=1,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
		expect(parseHash(phc)).not.toBeNull();
	});

	it('verifies the right password and only that', () => {
		expect(verifyPassword('correct horse', phc, pepper)).toBe(true);
		expect(verifyPassword('correct horse ', phc, pepper)).toBe(false);
		expect(verifyPassword('Correct horse', phc, pepper)).toBe(false);
	});

	it('needs the pepper: the hash alone is not enough', () => {
		expect(verifyPassword('correct horse', phc, 'another-pepper')).toBe(false);
		expect(verifyPassword('correct horse', phc, undefined)).toBe(false);
	});

	it('treats Unicode that looks the same as the same password', () => {
		const p = hashPassword('ｃａｆé', pepper, M, T); // full-width + precomposed
		expect(verifyPassword('café', p, pepper)).toBe(true);
	});

	it('refuses a malformed or out-of-bounds stored hash without throwing', () => {
		for (const bad of [undefined, '', 'nope', phc.replace('m=8192', 'm=999999'), phc.replace('p=1', 'p=4')]) {
			expect(verifyPassword('correct horse', bad, pepper)).toBe(false);
		}
	});
});
