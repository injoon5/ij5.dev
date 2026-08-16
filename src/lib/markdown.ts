import MarkdownIt from 'markdown-it';
import { hasIcon, iconSvg } from '$lib/icons';
import { renderContribGraph, type ContribData } from '$lib/contrib';
import type { LiveDoc, LiveRequest } from '$lib/types';

/**
 * The homepage is one Markdown document rendered to HTML on the server and
 * injected with `{@html}`. The renderer itself is client-safe (no server-only
 * imports), so the admin editor can reuse it for a live preview. The public
 * page ships no framework JS and runs under a strict CSP, so:
 *
 *   - `html: false` — raw HTML in the source is escaped, not passed through.
 *     There is no inline-handler or `<script>` surface, and the only markup on
 *     the page is what these rules emit.
 *   - every rule's output is built from trusted constants (icon paths) or
 *     escaped author text, so the injected string is safe.
 *
 * On top of CommonMark it adds four helpers:
 *   :::links … :::    a stack of big tappable link buttons (icon | label | href | sub)
 *   :::gallery … :::  a photo grid (`cols=N` optional, each row: key | caption)
 *   :name:            an inline brand icon from the allowlist
 *   ::contributions   the GitHub contribution graph (live data, `user=` optional)
 */

export const DEFAULT_CONTRIB_USER = 'injoon5';

export type RenderCtx = {
	assetsOrigin: string;
	/** The published live-data doc, keyed by request id (see `findLiveRequests`). */
	live?: LiveDoc | null;
	/** Intrinsic dimensions for `img/…` keys, so images reserve space (CLS 0). */
	dims?: Map<string, { w: number; h: number }>;
	/** Default GitHub login for a `::contributions` with no explicit `user=`. */
	contribUser?: string;
};

type RenderEnv = RenderCtx & { needsScript: boolean; contribUser: string };

/* ------------------------------------------------------------------ helpers */

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
	return escapeHtml(s).replace(/"/g, '&quot;');
}

function joinUrl(origin: string, key: string): string {
	return origin ? `${origin.replace(/\/$/, '')}/${key}` : `/${key}`;
}

/** Only protocols we are willing to link to. Blocks `javascript:` and friends. */
function isSafeHref(href: string): boolean {
	return /^(https?:\/\/|mailto:|\/|#)/i.test(href);
}

function parseContribUser(line: string, fallback: string): string {
	const m = /user\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/i.exec(line);
	const raw = m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
	return raw.trim() || fallback;
}

const contribId = (user: string) => `grass:${user}`;

/* ------------------------------------------------------------- link buttons */

type LinkItem = { icon: string; label: string; href: string; sub: string };

function parseLinkRow(line: string): LinkItem | null {
	const parts = line.split('|').map((s) => s.trim());
	if (parts.length < 3) return null;
	const [icon, label, href, sub = ''] = parts;
	if (!label || !href || !isSafeHref(href)) return null;
	return { icon: icon || 'globe', label, href, sub };
}

const ARROW =
	'<svg class="lb-arrow" width="17" height="17" viewBox="0 0 24 24" fill="none"' +
	' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
	' aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';

/**
 * A soft colour for each icon's chip. The marks are single-hue brands, so the
 * chip borrows a muted version of that hue — a row of these reads as a set of
 * stickers rather than a column of grey squares. An unlisted icon lands on the
 * house accent. The palette itself lives in `app.css` (`[data-tint]`).
 */
const LINK_TINT: Record<string, string> = {
	github: 'zinc',
	x: 'zinc',
	linkedin: 'sky',
	instagram: 'green',
	youtube: 'red',
	mail: 'sky',
	rss: 'amber',
	website: 'violet',
	globe: 'violet',
	camera: 'amber'
};

function renderLinks(content: string): string {
	const items = content
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map(parseLinkRow)
		.filter((x): x is LinkItem => x !== null);

	if (!items.length) return '';

	const buttons = items
		.map((it) => {
			const icon = iconSvg(it.icon, 22) ?? iconSvg('globe', 22) ?? '';
			const tint = LINK_TINT[it.icon] ?? 'blue';
			const rel = /^https?:\/\//i.test(it.href) ? ' target="_blank" rel="noopener"' : '';
			const sub = it.sub ? `<span class="lb-sub">${escapeHtml(it.sub)}</span>` : '';
			return (
				`<a class="widget link-button" href="${escapeAttr(it.href)}"${rel}>` +
				`<span class="lb-icon" data-tint="${tint}" aria-hidden="true">${icon}</span>` +
				`<span class="lb-body"><span class="lb-label">${escapeHtml(it.label)}</span>${sub}</span>` +
				ARROW +
				`</a>`
			);
		})
		.join('');

	return `<nav class="link-buttons" aria-label="Links">${buttons}</nav>\n`;
}

/* --------------------------------------------------------- photo gallery */

type GalleryItem = { src: string; caption: string; dims: string };

function parseGalleryRow(line: string, e: RenderEnv): GalleryItem | null {
	const [rawSrc, caption = ''] = line.split('|').map((s) => s.trim());
	if (!rawSrc) return null;

	let src = rawSrc;
	let dims = '';
	if (/^img\/[\w.-]+$/.test(rawSrc)) {
		src = joinUrl(e.assetsOrigin, rawSrc);
		const d = e.dims?.get(rawSrc);
		if (d) dims = ` width="${d.w}" height="${d.h}"`;
	} else if (!/^https?:\/\//i.test(rawSrc)) {
		return null;
	}

	// Gallery images are images like any other: they want the lazy loader and
	// the delegated error handler in w.js.
	e.needsScript = true;

	return { src, caption, dims };
}

function parseGalleryCols(line: string): number {
	const m = /cols\s*=\s*(\d+)/i.exec(line);
	const n = m ? Number(m[1]) : 2;
	return Math.min(Math.max(n, 1), 4);
}

function renderGallery(content: string, cols: number, e: RenderEnv): string {
	const items = content
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => parseGalleryRow(l, e))
		.filter((x): x is GalleryItem => x !== null);

	if (!items.length) return '';

	const cells = items
		.map((it) => {
			const caption = it.caption ? `<figcaption>${escapeHtml(it.caption)}</figcaption>` : '';
			return (
				`<figure class="gallery-item" data-span="img">` +
				`<img class="gallery-img" src="${escapeAttr(it.src)}" alt=""` +
				` loading="lazy" decoding="async"${it.dims}>` +
				caption +
				`</figure>`
			);
		})
		.join('');

	return `<div class="gallery" data-cols="${cols}">${cells}</div>\n`;
}

/* --------------------------------------------------- narrative blocks
   Two recognisable shortcodes — `:::messages` (an iMessage-style thread, used
   as a narrative device) and `:::poll` (result bars). Both are pure
   server-rendered HTML + CSS: nothing here needs the browser to run a line of
   script, so `/` keeps its no-JS promise. Every value is escaped author text. */

/**
 * The bubble end-caps, lifted from gandan.dev: a rounded cap for each side and,
 * for the last bubble of a run, a taller cap whose extra height is the tail.
 * A cap overlaps the flat pill and is filled the pill's colour, so the two read
 * as one capsule; the tail cap adds the flick. viewBox is 93×121 (rounded) or
 * 93×142 (tail); the fill comes from CSS so it tracks sent/received and theme.
 */
const CAP = {
	roundL:
		'M38.2285 4.53223C52.5705 0.000102997 65.8942 0 92.541 0V121C65.8942 121 52.5705 121 38.2285 116.468C22.5696 110.772 10.2347 98.4442 4.53516 82.7949C0.000221252 71.3903 0 62.92 0 60.5C0 58.08 0.000221252 49.6097 4.53516 38.2051C10.2347 22.5559 22.5696 10.2282 38.2285 4.53223Z',
	roundR:
		'M54.3125 4.53223C39.9705 0.000102997 26.6468 0 0 0V121C26.6468 121 39.9705 121 54.3125 116.468C69.9714 110.772 82.3064 98.4442 88.0059 82.7949C92.5408 71.3903 92.541 62.92 92.541 60.5C92.541 58.08 92.5408 49.6097 88.0059 38.2051C82.3064 22.5559 69.9714 10.2282 54.3125 4.53223Z',
	tailL:
		'M66 121H92.541V0C65.8942 0 52.5705 0.000102997 38.2285 4.53223C22.5696 10.2282 10.2347 22.5559 4.53516 38.2051C0.000221252 49.6097 0 58.08 0 60.5C0 62.92 0.000219822 71.3903 4.53516 82.7949C9.02507 95.1229 18.2797 104.404 28.7402 111.976C31.7741 114.171 32.5953 118.94 32 124C31 132.5 23 137 27 141C30.7375 144.737 52.8316 121 66 121Z',
	tailR:
		'M27 121H0.459V0C27.1058 0 40.4295 0.000102997 54.7715 4.53223C70.4304 10.2282 82.7653 22.5559 88.4648 38.2051C92.9998 49.6097 93 58.08 93 60.5C93 62.92 92.9998 71.3903 88.4648 82.7949C83.9749 95.1229 74.7203 104.404 64.2598 111.976C61.2259 114.171 60.4047 118.94 61 124C62 132.5 70 137 66 141C62.2625 144.737 40.1684 121 27 121Z'
} as const;

/** `SIZE` is the pill (and rounded-cap) height; a cap's width holds the source
 *  93:121 ratio, and the tail cap is the same width but 142 tall. */
const CHAT_SIZE = 38;
const CAP_W = ((CHAT_SIZE / 121) * 93).toFixed(2);
const TAIL_H = ((CHAT_SIZE / 121) * 142).toFixed(2);

function chatCap(kind: keyof typeof CAP, side: 'l' | 'r'): string {
	const tail = kind[0] === 't';
	const h = tail ? TAIL_H : String(CHAT_SIZE);
	const vb = tail ? '0 0 93 142' : '0 0 93 121';
	return (
		`<svg class="cap cap-${side}" width="${CAP_W}" height="${h}" viewBox="${vb}"` +
		` aria-hidden="true"><path d="${CAP[kind]}"/></svg>`
	);
}

/** `:::messages` (alias `:::chat`) — a short thread told in bubbles, after
 *  gandan.dev. Each line is a message; prefix a line with `me |` (or `i |` /
 *  `나 |`) to send it from the right (blue), otherwise it arrives on the left
 *  (grey). Consecutive messages from one side are a run; only the last of a run
 *  grows a tail. */
function renderChat(content: string): string {
	const msgs = content
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => {
			const bar = l.indexOf('|');
			const who = bar < 0 ? '' : l.slice(0, bar).trim();
			const text = (bar < 0 ? l : l.slice(bar + 1)).trim();
			return { out: /^(me|i|나)$/i.test(who), text };
		})
		.filter((m) => m.text);
	if (!msgs.length) return '';

	const rows = msgs
		.map((m, i) => {
			const startRun = !msgs[i - 1] || msgs[i - 1].out !== m.out;
			const endRun = !msgs[i + 1] || msgs[i + 1].out !== m.out;
			const cls = `chat-row ${m.out ? 'chat-out' : 'chat-in'}${startRun ? ' chat-start' : ''}`;
			// Sent: rounded left, tail (or rounded) right. Received: the mirror.
			const left = m.out ? chatCap('roundL', 'l') : chatCap(endRun ? 'tailL' : 'roundL', 'l');
			const right = m.out ? chatCap(endRun ? 'tailR' : 'roundR', 'r') : chatCap('roundR', 'r');
			return `<div class="${cls}">${left}<p class="bubble">${escapeHtml(m.text)}</p>${right}</div>`;
		})
		.join('');
	return `<div class="chat">${rows}</div>\n`;
}

/** `:::poll` — result bars. A `# ` line is the question; every other line is
 *  `option | percent`. The leading option(s) at the max are highlighted. */
function renderPoll(content: string): string {
	const lines = content
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
	let question = '';
	const rows: { label: string; pct: number }[] = [];
	for (const l of lines) {
		if (l.startsWith('#')) {
			question = l.replace(/^#\s*/, '');
			continue;
		}
		const bar = l.lastIndexOf('|');
		if (bar < 0) continue;
		const label = l.slice(0, bar).trim();
		const pct = Math.max(0, Math.min(100, parseFloat(l.slice(bar + 1)) || 0));
		if (label) rows.push({ label, pct });
	}
	if (!rows.length) return '';
	const max = Math.max(...rows.map((r) => r.pct));
	const q = question ? `<div class="poll-q">${escapeHtml(question)}</div>` : '';
	const body = rows
		.map((r) => {
			const win = r.pct === max ? ' poll-win' : '';
			return (
				`<div class="poll-row${win}"><span class="poll-fill" style="width:${r.pct}%"></span>` +
				`<span class="poll-label">${escapeHtml(r.label)}</span>` +
				`<span class="poll-pct">${Math.round(r.pct)}%</span></div>`
			);
		})
		.join('');
	return `<div class="poll">${q}<div class="poll-rows">${body}</div></div>\n`;
}

const COMPONENTS = new Set(['messages', 'chat', 'poll']);

function componentRule(state: any, startLine: number, endLine: number, silent: boolean): boolean {
	const pos = state.bMarks[startLine] + state.tShift[startLine];
	const line = state.src.slice(pos, state.eMarks[startLine]).trim();
	const m = /^:::([a-z]+)(?:\s+(.*))?$/.exec(line);
	if (!m || !COMPONENTS.has(m[1])) return false;
	if (silent) return true;

	let next = startLine + 1;
	let closed = false;
	for (; next < endLine; next++) {
		const p = state.bMarks[next] + state.tShift[next];
		if (state.src.slice(p, state.eMarks[next]).trim() === ':::') {
			closed = true;
			break;
		}
	}

	const token = state.push('component_block', '', 0);
	token.content = state.getLines(startLine + 1, next, 0, false);
	token.meta = { name: m[1], arg: m[2] ?? '' };
	token.map = [startLine, closed ? next + 1 : next];
	state.line = closed ? next + 1 : next;
	return true;
}

function galleryRule(state: any, startLine: number, endLine: number, silent: boolean): boolean {
	const pos = state.bMarks[startLine] + state.tShift[startLine];
	const line = state.src.slice(pos, state.eMarks[startLine]).trim();
	if (!/^:::gallery\b/.test(line)) return false;
	if (silent) return true;

	let next = startLine + 1;
	let closed = false;
	for (; next < endLine; next++) {
		const p = state.bMarks[next] + state.tShift[next];
		if (state.src.slice(p, state.eMarks[next]).trim() === ':::') {
			closed = true;
			break;
		}
	}

	const token = state.push('gallery_block', '', 0);
	token.content = state.getLines(startLine + 1, next, 0, false);
	token.meta = { cols: parseGalleryCols(line) };
	token.map = [startLine, closed ? next + 1 : next];
	state.line = closed ? next + 1 : next;
	return true;
}

/* ------------------------------------------------- markdown-it rule wiring */

/* markdown-it's block/inline state and tokens are loosely typed here on
   purpose: the deep type paths move between versions, and the public surface of
   this module stays fully typed. */
/* eslint-disable @typescript-eslint/no-explicit-any */

function contribRule(state: any, startLine: number, _endLine: number, silent: boolean): boolean {
	const pos = state.bMarks[startLine] + state.tShift[startLine];
	const line = state.src.slice(pos, state.eMarks[startLine]).trim();
	if (!/^::contributions\b/.test(line)) return false;
	if (silent) return true;

	const fallback = state.env?.contribUser || DEFAULT_CONTRIB_USER;
	const user = parseContribUser(line, fallback);
	const token = state.push('contrib_block', '', 0);
	token.map = [startLine, startLine + 1];
	token.meta = { user, id: contribId(user) };
	state.line = startLine + 1;
	return true;
}

function linksRule(state: any, startLine: number, endLine: number, silent: boolean): boolean {
	const pos = state.bMarks[startLine] + state.tShift[startLine];
	if (state.src.slice(pos, state.eMarks[startLine]).trim() !== ':::links') return false;
	if (silent) return true;

	let next = startLine + 1;
	let closed = false;
	for (; next < endLine; next++) {
		const p = state.bMarks[next] + state.tShift[next];
		if (state.src.slice(p, state.eMarks[next]).trim() === ':::') {
			closed = true;
			break;
		}
	}

	const token = state.push('links_block', '', 0);
	token.content = state.getLines(startLine + 1, next, 0, false);
	token.map = [startLine, closed ? next + 1 : next];
	state.line = closed ? next + 1 : next;
	return true;
}

function iconRule(state: any, silent: boolean): boolean {
	if (state.src.charCodeAt(state.pos) !== 0x3a /* : */) return false;
	const m = /^:([a-z0-9]+):/.exec(state.src.slice(state.pos, state.pos + 24));
	if (!m || !hasIcon(m[1])) return false;
	if (!silent) {
		const token = state.push('icon_inline', '', 0);
		token.meta = { name: m[1] };
	}
	state.pos += m[0].length;
	return true;
}

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: false });

md.block.ruler.before('fence', 'contrib', contribRule);
md.block.ruler.before('fence', 'links', linksRule);
md.block.ruler.before('fence', 'gallery', galleryRule);
md.block.ruler.before('fence', 'component', componentRule);
md.inline.ruler.after('escape', 'icon', iconRule);

md.renderer.rules.links_block = (tokens: any, idx: number) => renderLinks(tokens[idx].content);

md.renderer.rules.component_block = (tokens: any, idx: number) => {
	const { name } = tokens[idx].meta as { name: string };
	const content = tokens[idx].content as string;
	switch (name) {
		case 'messages':
		case 'chat':
			return renderChat(content);
		case 'poll':
			return renderPoll(content);
		default:
			return '';
	}
};

md.renderer.rules.gallery_block = (tokens: any, idx: number, _o: any, env: any) => {
	const e = env as RenderEnv;
	const meta = tokens[idx].meta as { cols: number };
	return renderGallery(tokens[idx].content, meta.cols, e);
};

md.renderer.rules.contrib_block = (tokens: any, idx: number, _o: any, env: any) => {
	const e = env as RenderEnv;
	const meta = tokens[idx].meta as { user: string; id: string };
	const data = e.live?.[meta.id]?.data as ContribData | undefined;
	// The edge fades track the scroll position, which wants `/w.js`.
	e.needsScript = true;
	return renderContribGraph(data, meta.user) + '\n';
};

md.renderer.rules.icon_inline = (tokens: any, idx: number) =>
	iconSvg(tokens[idx].meta.name, 16, 'md-icon') ?? '';

md.renderer.rules.image = (tokens: any, idx: number, options: any, env: any, self: any) => {
	const e = env as RenderEnv;
	const token = tokens[idx];
	const rawSrc: string = token.attrGet('src') ?? '';

	let src = rawSrc;
	let key: string | null = null;
	if (/^img\/[\w.-]+$/.test(rawSrc)) {
		key = rawSrc;
		src = joinUrl(e.assetsOrigin, rawSrc);
	}

	const alt = self.renderInlineAsText(token.children ?? [], options, env);
	const title = token.attrGet('title');

	let dims = '';
	if (key && e.dims) {
		const d = e.dims.get(key);
		if (d) dims = ` width="${d.w}" height="${d.h}"`;
	}

	// Any image means the page wants the delegated <img> error handler in w.js.
	e.needsScript = true;

	const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
	return (
		`<img class="prose-img" data-span="img" src="${escapeAttr(src)}"` +
		` alt="${escapeAttr(alt)}"${titleAttr} loading="lazy" decoding="async"${dims}>`
	);
};

const defaultLinkOpen =
	md.renderer.rules.link_open ??
	((tokens: any, idx: number, options: any, _env: any, self: any) =>
		self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens: any, idx: number, options: any, env: any, self: any) => {
	const href: string = tokens[idx].attrGet('href') ?? '';
	// External links open away from the page and never leak the opener.
	if (/^https?:\/\//i.test(href)) {
		tokens[idx].attrSet('target', '_blank');
		tokens[idx].attrSet('rel', 'noopener');
	}
	return defaultLinkOpen(tokens, idx, options, env, self);
};

/* eslint-enable @typescript-eslint/no-explicit-any */

/* --------------------------------------------------------------- public API */

/** Render Markdown to sanitized HTML plus whether the page needs `/w.js`. */
export function renderMarkdown(
	src: string | null | undefined,
	ctx: RenderCtx
): { html: string; needsScript: boolean } {
	const env: RenderEnv = {
		...ctx,
		needsScript: false,
		contribUser: ctx.contribUser || DEFAULT_CONTRIB_USER
	};
	const html = md.render(src ?? '', env);
	return { html, needsScript: env.needsScript };
}

/**
 * The live sources a document needs, discovered from its shortcodes. The server
 * reads/refreshes these before rendering; `renderMarkdown` reads their data back
 * out of `ctx.live` keyed by the same id.
 */
export function findLiveRequests(
	src: string | null | undefined,
	defaultUser = DEFAULT_CONTRIB_USER
): LiveRequest[] {
	const out = new Map<string, LiveRequest>();
	for (const raw of (src ?? '').split('\n')) {
		const line = raw.trim();
		if (!/^::contributions\b/.test(line)) continue;
		const user = parseContribUser(line, defaultUser);
		const id = contribId(user);
		out.set(id, { id, kind: 'grass', data: { user } });
	}
	return [...out.values()];
}

/** Every `img/…` asset key referenced by the document (for dims + GC). The base
 *  name matches the `[\w.-]` the image renderer accepts, not just the hex of a
 *  freshly minted key, so a manually-written key is never GC'd out from under a
 *  document that still draws it. */
export function imageKeysIn(src: string | null | undefined): string[] {
	const keys = new Set<string>();
	const re = /img\/[\w-]+\.(?:webp|png|jpe?g|avif)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(src ?? ''))) keys.add(m[0]);
	return [...keys];
}
