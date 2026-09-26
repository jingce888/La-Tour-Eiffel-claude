// Automated play-through in headless Chromium: walks from the parvis into the
// East pillar lift, rides to the 2nd floor, transfers to the summit duolift,
// rides to the top, climbs the stair to the open terrace. Fails loudly if any
// step does not reach its goal. Usage: node tools/playtest.mjs [shotDir]
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = process.argv[2] || null;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('file://' + path.join(root, 'index.html') + '?shot&frames=1&spawn=base&nohud&quality=low');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 240000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.error('boot error', err); process.exit(1); }

// Simulated time: step the game with a fixed dt without rendering every frame.
await page.evaluate(() => {
  const g = window.__game;
  g.renderer.__render = g.renderer.render;
  g.renderer.render = () => {}; // physics & logic only (fast)
  window.step = (seconds, keys = [], hits = []) => {
    const inp = g.input;
    inp.enabled = true;
    for (const k of keys) inp.keys.add(k);
    let t = 0, first = true;
    while (t < seconds) {
      if (first) for (const h of hits) inp.pressed.add(h);
      first = false;
      g.clock.getDelta = () => 1 / 30;
      g.frame();
      t += 1 / 30;
    }
    for (const k of keys) inp.keys.delete(k);
    const p = g.player.pos;
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), inside: !!g.insideLift, lift: g.lifts[0].mode + '@' + g.lifts[0].state.y.toFixed(1), duo: g.duo.mode + '@' + g.duo.state.y.toFixed(1) };
  };
  window.face = (x, z) => { const p = g.player.pos; g.player.yaw = Math.atan2(-(x - p.x), -(z - p.z)); g.player.pitch = 0; };
  window.walkTo = (x, z, maxS = 30) => {
    const p = g.player.pos;
    let t = 0;
    while (t < maxS) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 0.5) break;
      window.face(x, z);
      window.step(0.2, ['KeyW']);
      t += 0.2;
    }
    return window.step(0.3);
  };
});
const log = (label, v) => console.log(label.padEnd(34), JSON.stringify(v));
const shot = async (name) => {
  if (!shotDir) return;
  await page.evaluate(() => { const g = window.__game; g.renderer.render = g.renderer.__render; });
  await page.evaluate(() => window.__game.frame());
  await page.screenshot({ path: path.join(shotDir, name + '.png') });
  await page.evaluate(() => { const g = window.__game; g.renderer.render = () => {}; });
};
const fail = (m) => { console.error('FAIL:', m); errors.push(m); };

let s = await page.evaluate(() => window.step(0.5));
log('spawn (base)', s);
// 1. walk to the East pillar station door and call the lift
const door = await page.evaluate(() => { const l = window.__game.lifts[0]; const p = l.rail.pointAtHeight(l.stops[0].y); return [p.x - l.rail.dirOut.x * 3.4, p.z - l.rail.dirOut.z * 3.4]; });
s = await page.evaluate(([x, z]) => window.walkTo(x, z), door);
log('at East station door', s);
s = await page.evaluate(() => window.step(2.5));
log('waiting (doors open at ground)', s);
// 2. walk into the cabin
const cab = await page.evaluate(() => { const l = window.__game.lifts[0]; return [l.pos.x + l.rail.dirOut.x * 0.6, l.pos.z + l.rail.dirOut.z * 0.6]; });
s = await page.evaluate(([x, z]) => window.walkTo(x, z, 10), cab);
log('inside cabin', s);
if (!s.inside) fail('player did not enter the incline lift');
await shot('p1_in_cabin');
// 3. press 1 → ride to the 1st floor, step out onto the landing, look around
s = await page.evaluate(() => window.step(1, [], ['Digit1']));
for (let i = 0; i < 12 && !(s.lift.startsWith('open') && s.y > 50); i++) s = await page.evaluate(() => window.step(5, ['ShiftLeft']));
log('arrived at the 1st floor', s);
if (Math.abs(s.y - 57.63) > 0.3) fail('did not arrive at the 1st floor, y=' + s.y);
s = await page.evaluate(() => window.step(2));
const L = () => page.evaluate(() => { const l = window.__game.lifts[0]; return { x: l.pos.x, z: l.pos.z, ox: l.rail.dirOut.x, oz: l.rail.dirOut.z, ax: l.axisZ.x, az: l.axisZ.z }; });
let lf = await L();
s = await page.evaluate(([x, z]) => window.walkTo(x, z, 10), [lf.x - lf.ox * 5.5, lf.z - lf.oz * 5.5]);
log('walked out onto the 1st floor', s);
if (Math.abs(s.y - 57.63) > 0.05 || s.inside) fail('lost footing stepping out at the 1st floor, y=' + s.y);
// squeeze past the doorway beside the cabin, towards the shaft: must be stopped on the landing
s = await page.evaluate(([x, z]) => window.walkTo(x, z, 4), [lf.x - lf.ox * 3.2 + lf.ax * 2.3, lf.z - lf.oz * 3.2 + lf.az * 2.3]);
s = await page.evaluate(([x, z]) => window.walkTo(x, z, 4), [lf.x + lf.ax * 2.3, lf.z + lf.az * 2.3]);
log('pushing beside the doorway', s);
if (Math.abs(s.y - 57.63) > 0.05) fail('fell into the shaft beside the doorway at the 1st floor, y=' + s.y);
// back into the cabin, on to the 2nd floor
s = await page.evaluate(([x, z]) => window.walkTo(x, z, 6), [lf.x - lf.ox * 3.5, lf.z - lf.oz * 3.5]);
s = await page.evaluate(([x, z]) => window.walkTo(x, z, 8), [lf.x + lf.ox * 0.6, lf.z + lf.oz * 0.6]);
log('back inside the cabin', s);
if (!s.inside) fail('could not re-enter the lift at the 1st floor');
// 4. press 2 → ride to the 2nd floor (hold Shift to fast-forward)
s = await page.evaluate(() => window.step(1, [], ['Digit2']));
log('pressed 2', s);
for (let i = 0; i < 12 && !(s.lift.startsWith('open') && s.y > 110); i++) {
  s = await page.evaluate(() => window.step(5, ['ShiftLeft']));
  log(`riding… ${i}`, s);
  if (i === 1) await shot('p2_riding');
}
if (Math.abs(s.y - 115.73) > 0.3) fail('did not arrive at the 2nd floor, y=' + s.y);
s = await page.evaluate(() => window.step(2));
// 5. walk out towards the central hall of the summit lifts
s = await page.evaluate(() => window.walkTo(7.5, 7.5, 15));
log('stepped out on 2nd floor', s);
s = await page.evaluate(() => window.walkTo(0.2, 7.2, 15));
log('in front of the central hall', s);
s = await page.evaluate(() => window.walkTo(-1.55, 3.3, 15));
log('at duolift door', s);
// call (cabin A is at L2 initially with doors open → just walk in)
s = await page.evaluate(() => window.step(1, [], ['KeyE']));
s = await page.evaluate(() => window.step(3));
s = await page.evaluate(() => window.walkTo(-1.55, 0.2, 8));
log('inside duolift', s);
if (!s.inside) fail('player did not enter the duolift');
s = await page.evaluate(() => window.step(1, [], ['Digit3']));
for (let i = 0; i < 14 && !(s.duo.startsWith('open') && s.y > 270); i++) {
  s = await page.evaluate(() => window.step(5, ['ShiftLeft']));
  log(`going up… ${i}`, s);
  if (i === 1) await shot('p3_duolift');
}
if (Math.abs(s.y - 276.13) > 0.3) fail('did not arrive at the summit, y=' + s.y);
s = await page.evaluate(() => window.step(2));
// 6. walk out and climb the stair to the terrace
s = await page.evaluate(() => window.walkTo(-1.55, 3.4, 8));
log('out of the lift at the top', s);
s = await page.evaluate(() => window.walkTo(7.2, 3.4, 12));
s = await page.evaluate(() => window.walkTo(7.2, -4.6, 12));
s = await page.evaluate(() => window.walkTo(4.85, -4.6, 12));
log('at the foot of the stair', s);
s = await page.evaluate(() => window.walkTo(4.85, 3.4, 12));
log('top of the stair', s);
s = await page.evaluate(() => window.walkTo(0, 7.2, 12));
log('on the terrace', s);
if (s.y < 279) fail('did not reach the open terrace, y=' + s.y);
await shot('p4_terrace');
// 7. try to walk through the fence: must be stopped
s = await page.evaluate(() => { window.face(0, 30); return window.step(4, ['KeyW']); });
log('pushing against the fence', s);
if (s.z > 9.4) fail('walked through the summit fence');

const rescues = await page.evaluate(() => window.__game.rescues);
if (rescues) fail(`the fall safety net had to rescue the player ${rescues} time(s)`);
console.log(errors.length ? `\n${errors.length} problem(s):\n- ` + errors.join('\n- ') : '\nPLAYTEST PASSED');
await browser.close();
process.exit(errors.length ? 1 : 0);
