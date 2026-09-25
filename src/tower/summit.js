// The summit: consoles carrying the 3rd-floor platform (276.13 m), the glazed
// lower gallery, the stair up to the open-air terrace with its protective
// cage, Gustave Eiffel's apartment, the lighthouse lantern (300 m) and the
// antennas up to 330 m.
import * as THREE from 'three';
import { H, L3, L3_UP, L3_HALF, IRON_TOP, ANTENNA_TOP } from './profile.js';
import { FACES } from './structure.js';
import { paintAt } from './materials.js';
import { deckTexture, fenceMeshTexture, canvas, toTexture } from '../world/textures.js';

// Signs on the summit railing: distance and direction of world cities
export const CITY_SIGNS = [
  { name: '北京 Pékin', km: 8215, bearing: 50 }, { name: '上海 Shanghai', km: 9265, bearing: 45 },
  { name: 'Tokyo 東京', km: 9713, bearing: 33 }, { name: 'Moscou', km: 2486, bearing: 55 },
  { name: 'New York', km: 5837, bearing: 292 }, { name: 'Londres', km: 344, bearing: 330 },
  { name: 'Rome', km: 1106, bearing: 141 }, { name: 'Le Caire', km: 3210, bearing: 125 },
  { name: 'Sydney', km: 16961, bearing: 75 }, { name: 'Rio de Janeiro', km: 9165, bearing: 222 },
  { name: 'Montréal', km: 5510, bearing: 297 }, { name: 'Dakar', km: 4207, bearing: 214 },
];

function signTexture(items) {
  const W = 1024, Hh = 128, cv = canvas(W, Hh), g = cv.getContext('2d');
  g.fillStyle = '#e9e1cf'; g.fillRect(0, 0, W, Hh);
  g.strokeStyle = '#6b5236'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, Hh - 6);
  g.fillStyle = '#3a2a1c';
  g.textBaseline = 'middle';
  const cw = W / items.length;
  items.forEach((it, i) => {
    g.textAlign = 'center';
    g.font = '600 30px "Noto Serif SC","Songti SC","Times New Roman",serif';
    g.fillText(it.name, cw * (i + 0.5), 48, cw - 16);
    g.font = '400 26px "Times New Roman",serif';
    g.fillText(`${it.km.toLocaleString('fr-FR')} km`, cw * (i + 0.5), 92);
    if (i > 0) { g.fillRect(cw * i - 1, 20, 2, Hh - 40); }
  });
  return toTexture(cv, { repeat: false });
}

export function buildSummit({ group, collision, towerBearingZ }) {
  const steel = new THREE.MeshStandardMaterial({ color: paintAt(new THREE.Color(), 280, 1), roughness: 0.6, metalness: 0.06 });
  const steelDark = new THREE.MeshStandardMaterial({ color: paintAt(new THREE.Color(), 280, 0.75), roughness: 0.62, metalness: 0.06 });
  const deckMat = new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xa9bec2, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 0.7, side: THREE.DoubleSide });
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceMeshTexture(), color: paintAt(new THREE.Color(), 280, 1.25), roughness: 0.55, metalness: 0.2, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.5, metalness: 0.2 });
  const box = (sx, sy, sz, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    group.add(m); return m;
  };

  // ---------------------------------------------------------------- consoles (curved brackets)
  {
    const geos = [];
    for (const f of FACES) {
      for (let i = -3; i <= 3; i++) {
        const u = (i / 3) * (H(268) - 0.4);
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          const y = 267.5 + (L3 - 0.45 - 267.5) * Math.sin(t * Math.PI / 2);
          const r = H(y) + (L3_HALF - 0.2 - H(y)) * (1 - Math.cos(t * Math.PI / 2));
          const uu = u * (1 + 0.62 * t * t);
          pts.push(f.ax === 'z' ? new THREE.Vector3(uu, y, f.s * r) : new THREE.Vector3(f.s * r, y, uu));
        }
        geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.16, 5, false));
      }
    }
    for (const g of geos) {
      const m = new THREE.Mesh(g, steel);
      m.castShadow = true;
      group.add(m);
    }
  }

  // ---------------------------------------------------------------- lower (glazed) gallery
  const liftHole = { x0: -3.05, x1: 3.05, z0: -1.5, z1: 1.5 };
  const stair = { x0: 4.2, x1: 5.5, z0: -3.2, z1: 2.8 };
  {
    const deck = new THREE.Shape();
    const h = L3_HALF;
    deck.moveTo(-h, -h); deck.lineTo(h, -h); deck.lineTo(h, h); deck.lineTo(-h, h); deck.closePath();
    const hole = new THREE.Path();
    hole.moveTo(liftHole.x0, liftHole.z0); hole.lineTo(liftHole.x0, liftHole.z1); hole.lineTo(liftHole.x1, liftHole.z1); hole.lineTo(liftHole.x1, liftHole.z0); hole.closePath();
    deck.holes.push(hole);
    const body = new THREE.ExtrudeGeometry(deck, { depth: 0.55, bevelEnabled: false });
    body.rotateX(Math.PI / 2); body.translate(0, L3 - 0.02, 0);
    const mb = new THREE.Mesh(body, steelDark); mb.castShadow = mb.receiveShadow = true; group.add(mb);
    const top = new THREE.ShapeGeometry(deck);
    top.rotateX(Math.PI / 2); top.translate(0, L3, 0);
    const idx = top.index; for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
    const n = top.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mt = new THREE.Mesh(top, deckMat); mt.receiveShadow = true; group.add(mt);

    // glass curtain wall with mullions
    const hW = L3_HALF - 0.25, gh = L3_UP - L3 - 0.5;
    for (const f of FACES) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2 * hW, gh), glass);
      w.position.y = L3 + gh / 2;
      if (f.ax === 'z') { w.position.z = f.s * hW; } else { w.position.x = f.s * hW; w.rotation.y = Math.PI / 2; }
      w.renderOrder = 3;
      group.add(w);
      for (let t = -hW; t <= hW + 0.01; t += 2 * hW / 12) {
        if (f.ax === 'z') box(0.09, gh, 0.12, steel, t, L3 + gh / 2, f.s * hW);
        else box(0.12, gh, 0.09, steel, f.s * hW, L3 + gh / 2, t);
      }
      if (f.ax === 'z') box(2 * hW, 0.12, 0.16, steel, 0, L3 + 1.05, f.s * hW);
      else box(0.16, 0.12, 2 * hW, steel, f.s * hW, L3 + 1.05, 0);
      const a = f.ax === 'z' ? [-hW, f.s * hW] : [f.s * hW, -hW];
      const b = f.ax === 'z' ? [hW, f.s * hW] : [f.s * hW, hW];
      collision.addSeg(a[0], a[1], b[0], b[1], 0.18, L3, L3_UP);
    }
    // central core: lift shaft walls (open towards +z where the doors are)
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x5a4533, roughness: 0.7 });
    box(6.3, gh, 0.2, coreMat, 0, L3 + gh / 2, -1.62);
    box(0.2, gh, 3.2, coreMat, -3.12, L3 + gh / 2, 0);
    box(0.2, gh, 3.2, coreMat, 3.12, L3 + gh / 2, 0);
    box(6.3, 0.6, 0.2, coreMat, 0, L3 + gh - 0.3, 1.62);
    collision.addBox(-3.2, 3.2, -1.72, -1.5, L3, L3_UP);
    collision.addBox(-3.25, -3.0, -1.7, 1.6, L3, L3_UP);
    collision.addBox(3.0, 3.25, -1.7, 1.6, L3, L3_UP);
    // a divider between the two cabins
    box(0.12, gh, 3.1, coreMat, 0, L3 + gh / 2, 0);
    collision.addBox(-0.1, 0.1, -1.6, 1.6, L3, L3_UP);

    collision.addRect(-L3_HALF, L3_HALF, -L3_HALF, L3_HALF, L3, 'L3');
    collision.addHole(liftHole.x0, liftHole.x1, liftHole.z0, liftHole.z1, L3 - 1, L3 + 0.4);
  }

  // ---------------------------------------------------------------- stair to the terrace
  {
    const steps = 20, rise = (L3_UP - L3) / steps, run = (stair.z1 - stair.z0) / steps;
    const stepGeo = new THREE.BoxGeometry(stair.x1 - stair.x0, 0.06, run + 0.05);
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x6d5a47, roughness: 0.75, metalness: 0.1 });
    const inst = new THREE.InstancedMesh(stepGeo, stepMat, steps);
    const M = new THREE.Matrix4();
    for (let i = 0; i < steps; i++) {
      M.makeTranslation((stair.x0 + stair.x1) / 2, L3 + rise * (i + 1) - 0.03, stair.z0 + run * (i + 0.5));
      inst.setMatrixAt(i, M);
    }
    inst.castShadow = inst.receiveShadow = true;
    group.add(inst);
    // stringers + handrails
    for (const x of [stair.x0 - 0.05, stair.x1 + 0.05]) {
      const len = Math.hypot(stair.z1 - stair.z0, L3_UP - L3);
      const s = box(0.08, 0.35, len, steel, x, (L3 + L3_UP) / 2, (stair.z0 + stair.z1) / 2);
      s.rotation.x = -Math.atan2(L3_UP - L3, stair.z1 - stair.z0);
      const hr = box(0.06, 0.06, len, steel, x, (L3 + L3_UP) / 2 + 0.95, (stair.z0 + stair.z1) / 2);
      hr.rotation.x = s.rotation.x;
    }
    collision.addRamp(stair.x0, stair.x1, stair.z0, stair.z1, L3, L3_UP, 'z', 'stair');
    collision.addSeg(stair.x0 - 0.1, stair.z0, stair.x0 - 0.1, stair.z1, 0.08, L3, L3_UP + 1.2);
    collision.addSeg(stair.x1 + 0.1, stair.z0, stair.x1 + 0.1, stair.z1, 0.08, L3, L3_UP + 1.2);
  }

  // ---------------------------------------------------------------- upper terrace
  {
    const h = L3_HALF;
    const deck = new THREE.Shape();
    deck.moveTo(-h, -h); deck.lineTo(h, -h); deck.lineTo(h, h); deck.lineTo(-h, h); deck.closePath();
    const opening = new THREE.Path();
    opening.moveTo(stair.x0 - 0.15, stair.z0 - 0.1); opening.lineTo(stair.x0 - 0.15, stair.z1 + 0.05);
    opening.lineTo(stair.x1 + 0.15, stair.z1 + 0.05); opening.lineTo(stair.x1 + 0.15, stair.z0 - 0.1); opening.closePath();
    deck.holes.push(opening);
    const body = new THREE.ExtrudeGeometry(deck, { depth: 0.5, bevelEnabled: false });
    body.rotateX(Math.PI / 2); body.translate(0, L3_UP - 0.02, 0);
    const mb = new THREE.Mesh(body, steelDark); mb.castShadow = mb.receiveShadow = true; group.add(mb);
    const top = new THREE.ShapeGeometry(deck);
    top.rotateX(Math.PI / 2); top.translate(0, L3_UP, 0);
    const idx = top.index; for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
    const n = top.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mt = new THREE.Mesh(top, deckMat); mt.receiveShadow = true; group.add(mt);
    // opening railing (three sides; the stair arrives from -z)
    box(0.06, 1.05, stair.z1 - stair.z0, steel, stair.x0 - 0.18, L3_UP + 0.55, (stair.z0 + stair.z1) / 2);
    box(0.06, 1.05, stair.z1 - stair.z0, steel, stair.x1 + 0.18, L3_UP + 0.55, (stair.z0 + stair.z1) / 2);
    box(stair.x1 - stair.x0 + 0.4, 1.05, 0.06, steel, (stair.x0 + stair.x1) / 2, L3_UP + 0.55, stair.z1 + 0.08);
    collision.addSeg(stair.x0 - 0.18, stair.z0 + 0.6, stair.x0 - 0.18, stair.z1, 0.08, L3_UP, L3_UP + 1.2);
    collision.addSeg(stair.x1 + 0.18, stair.z0 + 0.6, stair.x1 + 0.18, stair.z1, 0.08, L3_UP, L3_UP + 1.2);
    collision.addSeg(stair.x0 - 0.18, stair.z1 + 0.08, stair.x1 + 0.18, stair.z1 + 0.08, 0.08, L3_UP, L3_UP + 1.2);
    collision.addRect(-L3_HALF, L3_HALF, -L3_HALF, L3_HALF, L3_UP, 'L3UP');
    collision.addHole(stair.x0 - 0.15, stair.x1 + 0.15, stair.z0 - 0.1, stair.z1 + 0.05, L3_UP - 0.5, L3_UP + 0.5);

    // the protective cage: posts, mesh, inward-curved top
    const R = L3_HALF - 0.2, fh = 2.4;
    for (const f of FACES) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, fh), fenceMat);
      plane.geometry.attributes.uv.array.forEach((v, i, arr) => { arr[i] = i % 2 === 0 ? v * (2 * R / 0.6) : v * (fh / 0.6); });
      plane.position.y = L3_UP + fh / 2;
      if (f.ax === 'z') plane.position.z = f.s * R; else { plane.position.x = f.s * R; plane.rotation.y = Math.PI / 2; }
      group.add(plane);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 1.3), fenceMat);
      top.geometry.attributes.uv.array.forEach((v, i, arr) => { arr[i] = i % 2 === 0 ? v * (2 * R / 0.6) : v * (1.3 / 0.6); });
      top.position.y = L3_UP + fh + 0.45;
      if (f.ax === 'z') { top.position.z = f.s * (R - 0.45); top.rotation.x = f.s * 0.8; }
      else { top.position.x = f.s * (R - 0.45); top.rotation.y = Math.PI / 2; top.rotation.x = f.s * 0.8; top.rotation.order = 'YXZ'; }
      group.add(top);
      for (let t = -R; t <= R + 0.01; t += 2 * R / 6) {
        if (f.ax === 'z') { box(0.07, fh + 0.9, 0.07, steel, t, L3_UP + (fh + 0.9) / 2, f.s * R); }
        else { box(0.07, fh + 0.9, 0.07, steel, f.s * R, L3_UP + (fh + 0.9) / 2, t); }
      }
      if (f.ax === 'z') box(2 * R, 0.08, 0.14, steel, 0, L3_UP + 1.1, f.s * (R - 0.05));
      else box(0.14, 0.08, 2 * R, steel, f.s * (R - 0.05), L3_UP + 1.1, 0);
      const a = f.ax === 'z' ? [-R, f.s * R] : [f.s * R, -R];
      const b = f.ax === 'z' ? [R, f.s * R] : [f.s * R, R];
      collision.addSeg(a[0], a[1], b[0], b[1], 0.2, L3_UP, L3_UP + 3.2);
    }
    // city signs on the railing (pointing to real bearings)
    const byFace = { '+z': [], '-z': [], '+x': [], '-x': [] };
    for (const c of CITY_SIGNS) {
      const rel = ((c.bearing - towerBearingZ) % 360 + 360) % 360; // 0 = +z
      const key = rel < 45 || rel >= 315 ? '+z' : rel < 135 ? '-x' : rel < 225 ? '-z' : '+x';
      byFace[key].push(c);
    }
    for (const f of FACES) {
      const key = (f.s > 0 ? '+' : '-') + f.ax;
      const items = byFace[key];
      if (!items.length) continue;
      const tex = signTexture(items);
      const w = Math.min(2 * R - 1.5, items.length * 1.25);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      sign.position.y = L3_UP + 1.06;
      const inset = R - 0.2;
      if (f.ax === 'z') { sign.position.z = f.s * inset; sign.rotation.y = f.s > 0 ? Math.PI : 0; }
      else { sign.position.x = f.s * inset; sign.rotation.y = f.s > 0 ? -Math.PI / 2 : Math.PI / 2; }
      sign.rotateX(-0.9);
      group.add(sign);
    }
  }

  // ---------------------------------------------------------------- Eiffel's apartment + lantern + antennas
  {
    const apt = new THREE.MeshStandardMaterial({ color: 0xcdb58e, roughness: 0.75 });
    const win = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.2, emissive: 0x3a2c18, emissiveIntensity: 0.25 });
    const ax = -1.2, az = -2.1, aw = 6.6, ad = 4.4, ah = 3.1;
    box(aw, ah, ad, apt, ax, L3_UP + ah / 2, az);
    for (const s of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        box(1.0, 1.3, 0.05, win, ax + i * 2.0, L3_UP + 1.7, az + s * (ad / 2 + 0.02));
      }
    }
    box(aw + 0.6, 0.3, ad + 0.6, steelDark, ax, L3_UP + ah + 0.15, az);
    collision.addBox(ax - aw / 2, ax + aw / 2, az - ad / 2, az + ad / 2, L3_UP, L3_UP + ah);

    // lantern structure: tapered lattice box on the terrace
    const m = [];
    const Y0 = L3_UP + ah + 0.3, Y1 = 292.2;
    const r0 = 3.4, r1 = 2.3;
    const lvl = [Y0, Y0 + 3, Y0 + 6, Y1];
    const rr = (y) => r0 + (r1 - r0) * (y - Y0) / (Y1 - Y0);
    for (let k = 0; k < lvl.length - 1; k++) {
      const a = lvl[k], b = lvl[k + 1];
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
        m.push([[sx * rr(a), a, sz * rr(a)], [sx * rr(b), b, sz * rr(b)], 0.28]);
      }
      for (const f of FACES) {
        const P = (u, y) => (f.ax === 'z' ? [u, y, f.s * rr(y)] : [f.s * rr(y), y, u]);
        m.push([P(-rr(a), a), P(rr(b), b), 0.14], [P(rr(a), a), P(-rr(b), b), 0.14], [P(-rr(a), a), P(rr(a), a), 0.18]);
      }
    }
    // gallery ring at 292 m
    const gr = 3.0;
    for (const f of FACES) {
      const P = (u) => (f.ax === 'z' ? [u, Y1, f.s * gr] : [f.s * gr, Y1, u]);
      m.push([P(-gr), P(gr), 0.35]);
    }
    const tubeGeos = m.map(([a, b, w]) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const g = new THREE.CylinderGeometry(w * 0.5, w * 0.5, A.distanceTo(B), 5, 1);
      g.translate(0, A.distanceTo(B) / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
      g.applyQuaternion(q); g.translate(A.x, A.y, A.z);
      return g;
    });
    for (const g of tubeGeos) { const mm = new THREE.Mesh(g, steel); mm.castShadow = true; group.add(mm); }
    const deckG = box(2 * gr + 0.4, 0.25, 2 * gr + 0.4, steelDark, 0, Y1 - 0.1, 0);
    void deckG;
    // lighthouse lantern: glazed drum + dome
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.6, 16, 1, true), glass);
    drum.position.y = Y1 + 1.9; group.add(drum);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box(0.1, 3.6, 0.1, steel, Math.cos(a) * 1.5, Y1 + 1.9, Math.sin(a) * 1.5);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0x777066, metalness: 0.7, roughness: 0.3 }));
    lamp.position.y = Y1 + 1.4; group.add(lamp);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.75, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), steelDark);
    dome.position.y = Y1 + 3.7; dome.castShadow = true; group.add(dome);
    const crown = box(1.2, 1.4, 1.2, steelDark, 0, Y1 + 5.9, 0);
    void crown;

    // antenna mast: lattice base, then tube with aviation bands
    const baseY = IRON_TOP - 0.5;
    const mast0 = baseY + 2.2, mastLat = 312;
    const lat = [];
    const rA = (y) => 0.95 - 0.55 * (y - mast0) / (mastLat - mast0);
    for (let y = mast0; y < mastLat - 0.1; y += 1.9) {
      const y2 = Math.min(mastLat, y + 1.9);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) lat.push([[sx * rA(y), y, sz * rA(y)], [sx * rA(y2), y2, sz * rA(y2)], 0.1]);
      for (const f of FACES) {
        const P = (u, yy) => (f.ax === 'z' ? [u, yy, f.s * rA(yy)] : [f.s * rA(yy), yy, u]);
        lat.push([P(-rA(y), y), P(rA(y2), y2), 0.05], [P(-rA(y), y), P(rA(y), y), 0.06]);
      }
    }
    for (const [a, b, w] of lat) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const g = new THREE.CylinderGeometry(w, w, A.distanceTo(B), 4, 1);
      g.translate(0, A.distanceTo(B) / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
      g.translate(A.x, A.y, A.z);
      group.add(new THREE.Mesh(g, white));
    }
    const segs = 6, len = (ANTENNA_TOP - 1 - mastLat) / segs;
    for (let i = 0; i < segs; i++) {
      const rTop = 0.3 - 0.18 * ((i + 1) / segs), rBot = 0.3 - 0.18 * (i / segs);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 10), i % 2 ? red : white);
      c.position.y = mastLat + len * (i + 0.5);
      c.castShadow = true;
      group.add(c);
    }
    // dish & panel antennas
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 6, 0, Math.PI * 2, 0, 0.9), dishMat);
      d.position.set(Math.cos(a) * 1.4, mast0 + 1.2 + i * 1.3, Math.sin(a) * 1.4);
      d.lookAt(d.position.clone().multiplyScalar(3).setY(d.position.y));
      d.rotateX(Math.PI / 2);
      group.add(d);
    }
    for (let i = 0; i < 3; i++) {
      for (const f of FACES) {
        const y = 314 + i * 4.2;
        const r = 0.34;
        if (f.ax === 'z') box(0.32, 2.2, 0.08, white, 0, y, f.s * r);
        else box(0.08, 2.2, 0.32, white, f.s * r, y, 0);
      }
    }
    // aviation warning light
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2 }));
    beacon.position.y = ANTENNA_TOP - 0.7;
    beacon.name = 'aviation-light';
    group.add(beacon);
  }
  return { liftHole, stair };
}
