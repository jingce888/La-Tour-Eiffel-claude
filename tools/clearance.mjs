// Lift clearance check: sweeps every lift cabin (and the incline chassis) along
// its whole run and reports static tower geometry that it would cut through.
// Usage: node tools/clearance.mjs [--verbose]   (exit code 1 when anything clips)
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.goto('file://' + path.join(root, 'index.html') + '?shot&frames=1&quality=low&nohud');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 240000 });

const report = await page.evaluate(() => {
  const g = window.__game;
  const scene = g.scene;
  // ---------------------------------------------------------------- triangles of the static world near the lifts
  const liftRoots = new Set();
  for (const l of g.lifts) liftRoots.add(l.root);
  if (g.duo) for (const c of g.duo.cabins || []) c.root && liftRoots.add(c.root);
  const isLift = (o) => { for (let p = o; p; p = p.parent) { if (liftRoots.has(p) || (p.name || '').startsWith('lift') || (p.name || '').startsWith('duo')) return true; } return false; };
  const tris = []; // [ax,ay,az,bx,by,bz,cx,cy,cz, label]
  const near = (x, y, z) => Math.hypot(x, z) < 70 && y > -3 && y < 290;
  const mul = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  const mm = (a, b) => { // a * b (column-major 4x4)
    const r = new Array(16);
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
      r[c * 4 + rr] = a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
    }
    return r;
  };
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible && !o.isInstancedMesh) return;
    if (isLift(o)) return;
    const geo = o.geometry, pos = geo.attributes.position;
    if (!pos) return;
    const idx = geo.index ? geo.index.array : null;
    const n = idx ? idx.length : pos.count;
    const label = (o.material && o.material.name) || o.name || o.type;
    if (/sky|seine|ground|terrain|water|foliage|trunk/i.test(label) || geo.boundingSphere && geo.boundingSphere.radius > 5000) return;
    const mats = [];
    if (o.isInstancedMesh) {
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) mats.push(mm(o.matrixWorld.elements, Array.from(a.subarray(i * 16, i * 16 + 16))));
    } else mats.push(o.matrixWorld.elements);
    for (const m of mats) {
      // quick reject: instance/mesh origin far from the tower
      if (o.isInstancedMesh && !near(m[12], m[13], m[14]) && Math.hypot(m[12], m[14]) > 90) continue;
      for (let t = 0; t < n; t += 3) {
        const i0 = idx ? idx[t] : t, i1 = idx ? idx[t + 1] : t + 1, i2 = idx ? idx[t + 2] : t + 2;
        const A = mul(m, pos.getX(i0), pos.getY(i0), pos.getZ(i0));
        const B = mul(m, pos.getX(i1), pos.getY(i1), pos.getZ(i1));
        const C = mul(m, pos.getX(i2), pos.getY(i2), pos.getZ(i2));
        if (!near(A[0], A[1], A[2]) && !near(B[0], B[1], B[2]) && !near(C[0], C[1], C[2])) continue;
        tris.push([...A, ...B, ...C, label]);
      }
    }
  });

  // ---------------------------------------------------------------- SAT triangle vs box (box-local coords)
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function triBox(v0, v1, v2, h) {
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const e = [sub(v1, v0), sub(v2, v1), sub(v0, v2)];
    const test = (ax) => {
      const p0 = dot(v0, ax), p1 = dot(v1, ax), p2 = dot(v2, ax);
      const r = h[0] * Math.abs(ax[0]) + h[1] * Math.abs(ax[1]) + h[2] * Math.abs(ax[2]);
      return !(Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r);
    };
    for (const a of axes) if (!test(a)) return false;
    const nrm = cross(e[0], e[1]);
    if (dot(nrm, nrm) > 1e-12 && !test(nrm)) return false;
    for (const a of axes) for (const ed of e) { const c = cross(a, ed); if (dot(c, c) > 1e-12 && !test(c)) return false; }
    return true;
  }
  // box given by centre + orthonormal axes + half sizes
  function hits(center, X, Y, Z, h) {
    const out = [];
    const R = Math.hypot(h[0], h[1], h[2]);
    const loc = (p) => { const d = sub(p, center); return [dot(d, X), dot(d, Y), dot(d, Z)]; };
    for (const t of tris) {
      const a = [t[0], t[1], t[2]], b = [t[3], t[4], t[5]], c = [t[6], t[7], t[8]];
      const minY = Math.min(a[1], b[1], c[1]), maxY = Math.max(a[1], b[1], c[1]);
      if (maxY < center[1] - R || minY > center[1] + R) continue;
      const minX = Math.min(a[0], b[0], c[0]), maxX = Math.max(a[0], b[0], c[0]);
      if (maxX < center[0] - R || minX > center[0] + R) continue;
      const minZ = Math.min(a[2], b[2], c[2]), maxZ = Math.max(a[2], b[2], c[2]);
      if (maxZ < center[2] - R || minZ > center[2] + R) continue;
      const la = loc(a), lb = loc(b), lc = loc(c);
      if (triBox(la, lb, lc, h)) {
        const m = [(la[0] + lb[0] + lc[0]) / 3, (la[1] + lb[1] + lc[1]) / 3, (la[2] + lb[2] + lc[2]) / 3];
        out.push({ label: t[9], at: m.map((v) => +v.toFixed(2)), box: [minX, maxX, minY, maxY, minZ, maxZ].map((v) => +v.toFixed(1)) });
      }
    }
    return out;
  }

  const res = { tris: tris.length, clips: [] };
  const add = (who, y, list) => {
    for (const h of list) res.clips.push({ who, y: +y.toFixed(2), label: h.label, at: h.at, box: h.box });
  };
  // ---------------------------------------------------------------- incline lifts
  const CAB = { along: 4.0, across: 3.5, height: 2.9 };
  for (const l of g.lifts) {
    const rail = l.rail, o = rail.dirOut, a = l.axisZ;
    const X = [o.x, 0, o.z], Y = [0, 1, 0], Z = [a.x, 0, a.z];
    const yMin = l.stops[0].y, yMax = l.stops[l.stops.length - 1].y;
    for (let y = yMin; y <= yMax + 1e-6; y += 0.2) {
      const p = rail.pointAtHeight(y);
      // cabin shell: floor slab (-0.22) … roof (+3.18), shrunk by 2 cm so
      // surfaces merely touching at a landing do not count
      const hc = [CAB.along / 2 - 0.02, 1.68, CAB.across / 2 - 0.02];
      add(l.name + ' cabin', y, hits([p.x, p.y + 1.48, p.z], X, Y, Z, hc));
      // chassis side frames, tilted with the rail
      const t = rail.tangentAtHeight(y);
      const hor = Math.hypot(t.x, t.z), incl = Math.atan2(t.y, hor);
      const U = [o.x * Math.cos(incl), -Math.sin(incl), o.z * Math.cos(incl)];
      const Vv = [o.x * Math.sin(incl), Math.cos(incl), o.z * Math.sin(incl)];
      for (const s of [-1, 1]) {
        const c = [p.x + a.x * s * 2.15, p.y - 0.2, p.z + a.z * s * 2.15];
        add(l.name + ' chassis', y, hits(c, U, Vv, Z, [3.2, 0.3, 0.2]));
      }
    }
  }
  // ---------------------------------------------------------------- summit duolift
  if (g.duo && g.duo.cabins) {
    for (const cab of g.duo.cabins) {
      const x = cab.x ?? cab.root.position.x, z = cab.z ?? cab.root.position.z;
      for (let y = g.duo.bottom ?? 115.73; y <= (g.duo.top ?? 276.13) + 1e-6; y += 0.25) {
        add('duo ' + x.toFixed(2), y, hits([x, y + 1.35, z], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1.25, 1.55, 1.25]));
      }
    }
  }
  return res;
});

// group consecutive samples per (who,label)
const groups = new Map();
for (const c of report.clips) {
  const k = c.who + ' × ' + c.label;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}
console.log(`triangles considered: ${report.tris}`);
if (!groups.size) console.log('no clipping — every cabin clears the structure');
for (const [k, list] of groups) {
  const ys = [...new Set(list.map((c) => c.y))].sort((a, b) => a - b);
  const ranges = [];
  for (const y of ys) {
    const last = ranges[ranges.length - 1];
    if (last && y - last[1] < 0.45) last[1] = y; else ranges.push([y, y]);
  }
  console.log(`${k}: ${list.length} hits at y ${ranges.map(([a, b]) => a === b ? a : `${a}–${b}`).join(', ')}`);
  if (verbose) {
    const seen = new Set();
    for (const c of list) {
      const k2 = c.box.join(',');
      if (seen.has(k2)) continue;
      seen.add(k2);
      if (seen.size > 8) break;
      console.log('    at cabin y', c.y, 'triangle box x/y/z', JSON.stringify(c.box), 'local', JSON.stringify(c.at));
    }
  }
}
await browser.close();
process.exit(groups.size ? 1 : 0);
