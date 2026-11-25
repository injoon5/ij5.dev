import { slugFormatProblem } from './slugs';

type Env = App.Platform['env'];
type Owner = 'link' | 'paste' | 'file';

/** What already has this name, if anything. */
export async function slugOwner(env: Env, slug: string): Promise<Owner | null> {
	const [link, paste, file] = await env.DB.batch([
		env.DB.prepare(`SELECT 1 FROM slugs WHERE slug = ?`).bind(slug),
		env.DB.prepare(`SELECT 1 FROM pastes WHERE slug = ?`).bind(slug),
		env.DB.prepare(`SELECT 1 FROM files WHERE slug = ?`).bind(slug)
	]);
	if (link.results.length) return 'link';
	if (paste.results.length) return 'paste';
	if (file.results.length) return 'file';
	return null;
}

/** Why a new link, paste or file cannot take this slug, or nothing if it can. */
export async function slugProblem(env: Env, slug: string): Promise<string | undefined> {
	const format = slugFormatProblem(slug);
	if (format) return format;
	const owner = await slugOwner(env, slug);
	if (owner) return `That name is taken by a ${owner}.`;
}

/** No ambiguous characters: a slug read out loud from a chat must survive. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function randomSlug(): string {
	let out = '';
	for (const b of crypto.getRandomValues(new Uint8Array(8))) out += ALPHABET[b % ALPHABET.length];
	return out;
}

/** A free random slug, or null after a few unlucky tries. */
export async function freeRandomSlug(env: Env): Promise<string | null> {
	for (let i = 0; i < 8; i++) {
		const candidate = randomSlug();
		if (!(await slugOwner(env, candidate))) return candidate;
	}
	return null;
}

/** The slug asked for if it is usable, a fresh random one if none was asked for. */
export async function chooseSlug(
	env: Env,
	wanted: string
): Promise<{ ok: true; slug: string } | { ok: false; problem: string }> {
	const slug = wanted.trim();
	if (slug) {
		const problem = await slugProblem(env, slug);
		return problem ? { ok: false, problem } : { ok: true, slug };
	}
	const random = await freeRandomSlug(env);
	return random ? { ok: true, slug: random } : { ok: false, problem: 'Could not find a free name. Try again.' };
}
