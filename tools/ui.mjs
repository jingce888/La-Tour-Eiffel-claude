// Screenshots of the real UI flow: loader → menu → in-game HUD (normal mode, no ?shot).
import { chromium } from 'playwright';
const out = process.argv[2] || '.';
const w = +(process.argv[3] || 1280), h = +(process.argv[4] || 720);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + new URL('../index.html', import.meta.url).pathname + '?time=golden&quality=low');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/ui_loader.png` });
await page.waitForFunction(() => { const m = document.getElementById('menu'); return m && !m.classList.contains('hidden'); }, null, { timeout: 240000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/ui_menu.png`, timeout: 180000 });
await page.click('#btn-start');
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/ui_game.png`, timeout: 180000 });
await browser.close();
console.log('ok');
