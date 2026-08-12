/**
 * Screenshot harness for local design review.
 *
 * Not part of the build or the deploy: it exists so layout can be judged at
 * the viewport it ships to (320px, a phone, a laptop) instead of whatever the
 * author's browser window happens to be.
 *
 *   node scripts/shots.mjs [baseUrl] [outDir]
 */

import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? '/tmp/shots';
const TOKEN = process.env.IJ5_TOKEN ?? '';

const VIEWPORTS = {
	xs: { width: 320, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
	phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
	desktop: { width: 1440, height: 900, deviceScaleFactor: 1 }
};

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
	executablePath: '/usr/local/bin/google-chrome',
	headless: 'new',
	args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
});

const page = await browser.newPage();
const problems = [];

page.on('console', (msg) => {
	if (msg.type() === 'error' || msg.type() === 'warning') {
		problems.push(`[console.${msg.type()}] ${msg.text()}`);
	}
});
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => problems.push(`[404?] ${req.url()} ${req.failure()?.errorText}`));

async function shoot(name, url, viewport, { dark = false, full = true, after } = {}) {
	await page.setViewport(VIEWPORTS[viewport]);
	await page.emulateMediaFeatures([
		{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }
	]);
	await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle0' });
	if (after) await after(page);
	await new Promise((r) => setTimeout(r, 250));

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	if (overflow > 0) problems.push(`[overflow] ${url} @${viewport} is ${overflow}px too wide`);

	const file = `${OUT}/${name}.png`;
	await page.screenshot({ path: file, fullPage: full });
	console.log(`${file}  overflow=${overflow}px`);
}

await shoot('home-desktop', '/', 'desktop');
await shoot('home-phone', '/', 'phone');
await shoot('home-xs', '/', 'xs');
await shoot('home-desktop-dark', '/', 'desktop', { dark: true });
await shoot('home-phone-dark', '/', 'phone', { dark: true });
await shoot('error-404', '/definitely-not-a-real-slug-here', 'desktop');
await shoot('login', '/login', 'desktop');

if (TOKEN) {
	await page.setViewport(VIEWPORTS.desktop);
	await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
	await page.type('#token', TOKEN);
	await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type=submit]')]);

	await shoot('admin-links', '/admin', 'desktop');
	await shoot('admin-links-phone', '/admin', 'phone');
	await shoot('admin-link-new', '/admin?s=new', 'desktop');
	await shoot('admin-bento', '/admin/bento', 'desktop');
	await shoot('admin-bento-open', '/admin/bento?b=b-cta', 'desktop');
	await shoot('admin-bento-phone', '/admin/bento', 'phone');
	await shoot('admin-analytics', '/admin/analytics', 'desktop');
	await shoot('admin-analytics-phone', '/admin/analytics', 'phone');
}

await browser.close();

console.log('\n--- problems ---');
console.log(problems.length ? [...new Set(problems)].join('\n') : 'none');
