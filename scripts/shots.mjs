/**
 * Screenshot harness for local design review.
 *
 * Not part of the build or the deploy: it exists so layout can be judged at
 * the viewport it ships to (320px, a phone, a laptop) instead of whatever the
 * author's browser window happens to be.
 *
 *   node scripts/shots.mjs [baseUrl] [outDir]
 *
 * `IJ5_TOKEN` unlocks the admin screens. `CHROME_PATH` overrides the browser.
 *
 * Beyond the images it reports two things a screenshot cannot show: horizontal
 * overflow at each viewport, and — because `/` promises to work without
 * JavaScript — whether the grid still renders with scripting turned off.
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? '/tmp/shots';
const TOKEN = process.env.IJ5_TOKEN ?? '';

const VIEWPORTS = {
	xs: { viewport: { width: 320, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
	phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
	desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
};

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
	// `playwright-core` ships no browser of its own, which is the point: point
	// it at whatever Chromium is already on the machine.
	executablePath: process.env.CHROME_PATH || undefined,
	args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
});

const problems = [];

function watch(page) {
	page.on('console', (msg) => {
		if (msg.type() === 'error' || msg.type() === 'warning') {
			problems.push(`[console.${msg.type()}] ${msg.text()}`);
		}
	});
	page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
	page.on('requestfailed', (req) =>
		problems.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`)
	);
	return page;
}

/** One context per viewport, reused, so the session cookie survives. */
const contexts = new Map();

async function contextFor(viewport, dark) {
	const key = `${viewport}:${dark}`;
	if (!contexts.has(key)) {
		const context = await browser.newContext({
			...VIEWPORTS[viewport],
			colorScheme: dark ? 'dark' : 'light',
			storageState: saved ?? undefined
		});
		contexts.set(key, context);
	}
	return contexts.get(key);
}

let saved = null;

async function shoot(name, url, viewport, { dark = false, full = true } = {}) {
	const context = await contextFor(viewport, dark);
	const page = watch(await context.newPage());
	await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(250);

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	if (overflow > 0) problems.push(`[overflow] ${url} @${viewport} is ${overflow}px too wide`);

	const file = `${OUT}/${name}.png`;
	await page.screenshot({ path: file, fullPage: full });
	console.log(`${file}  overflow=${overflow}px`);
	await page.close();
}

await shoot('home-desktop', '/', 'desktop');
await shoot('home-phone', '/', 'phone');
await shoot('home-xs', '/', 'xs');
await shoot('home-desktop-dark', '/', 'desktop', { dark: true });
await shoot('home-phone-dark', '/', 'phone', { dark: true });
await shoot('error-404', '/definitely-not-a-real-slug-here', 'desktop');
await shoot('login', '/login', 'desktop');

// §13/§14 — the public page is server-rendered HTML. If the grid disappears
// with scripting off, something started depending on hydration.
{
	const context = await browser.newContext({ ...VIEWPORTS.phone, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
	const widgets = await page.locator('[data-span]').count();
	if (widgets === 0) problems.push('[no-js] / rendered no widgets with JavaScript disabled');
	console.log(`no-js: ${widgets} widgets rendered`);
	await page.screenshot({ path: `${OUT}/home-phone-nojs.png`, fullPage: true });
	await context.close();
}

if (TOKEN) {
	const context = await browser.newContext(VIEWPORTS.desktop);
	const page = watch(await context.newPage());
	await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
	await page.fill('#token', TOKEN);
	await page.click('button[type=submit]');
	await page.waitForURL('**/admin', { waitUntil: 'networkidle' });
	saved = await context.storageState();
	await context.close();
	contexts.clear();

	await shoot('admin-links', '/admin', 'desktop');
	await shoot('admin-links-phone', '/admin', 'phone');
	await shoot('admin-links-xs', '/admin', 'xs');
	await shoot('admin-home', '/admin/home', 'desktop');
	await shoot('admin-home-phone', '/admin/home', 'phone');
	await shoot('admin-analytics', '/admin/analytics', 'desktop');
	await shoot('admin-analytics-phone', '/admin/analytics', 'phone');
	await shoot('admin-analytics-dark', '/admin/analytics', 'desktop', { dark: true });
}

for (const context of contexts.values()) await context.close();
await browser.close();

console.log('\n--- problems ---');
console.log(problems.length ? [...new Set(problems)].join('\n') : 'none');
