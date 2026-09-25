// Headless visual check: node tools/shot.mjs out.png "query-string" [width height]
// Renders index.html in Chromium (SwiftShader/GPU) and saves a screenshot once
// the game signals window.__ready.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , out = 'shot.png', query = '', w = '1280', h = '720'] = process.argv;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const url = 'file://' + path.join(root, 'index.html') + '?shot&' + query;
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 240000, polling: 500 });
} catch (e) {
  logs.push('timeout waiting for __ready');
}
const info = await page.evaluate(() => ({ err: window.__error, info: window.__info }));
await page.screenshot({ path: out, timeout: 180000 });
console.log(`shot ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(info));
for (const l of logs.slice(0, 40)) console.log(l);
await browser.close();
