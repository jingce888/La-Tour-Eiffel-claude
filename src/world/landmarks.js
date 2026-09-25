// Hand-modelled landmarks (where an extruded footprint would betray the real
// silhouette) and the on-screen landmark guide.
import * as THREE from 'three';
import { LANDMARKS, terrainHeight } from './geo.js';
import { mergeAll } from './water.js';

const stoneMat = () => new THREE.MeshStandardMaterial({ color: 0xcfc3aa, roughness: 0.85 });

function place(geo, x, y, z, ry = 0) {
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}
function box(w, h, d) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; }
function cyl(r0, r1, h, s = 24) { const g = new THREE.CylinderGeometry(r1, r0, h, s); g.translate(0, h / 2, 0); return g; }
function dome(r, s = 32, squash = 1) {
  const g = new THREE.SphereGeometry(r, s, Math.max(6, s / 3), 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, squash, 1);
  return g;
}

export function buildLandmarkModels(scene) {
  const stone = stoneMat();
  const white = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a948, roughness: 0.32, metalness: 0.95 });
  const lead = new THREE.MeshStandardMaterial({ color: 0x5b6166, roughness: 0.55, metalness: 0.4 });
  const glassDark = new THREE.MeshStandardMaterial({ color: 0x9aa7ae, roughness: 0.25, metalness: 0.2 });
  const out = { stone: [], white: [], gold: [], lead: [], glass: [] };
  const axisAngle = (fx, fz, tx, tz) => Math.atan2(tz - fz, tx - fx);

  // ---- Dôme des Invalides (107 m, gilded)
  {
    const [x, z] = [704, 1163], y = 0;
    out.stone.push(place(cyl(15, 14.5, 26, 32), x, y + 30, z));            // drum
    for (let i = 0; i < 24; i++) {                                         // drum columns
      const a = (i / 24) * Math.PI * 2;
      out.stone.push(place(cyl(0.7, 0.7, 13, 8), x + Math.cos(a) * 15.6, y + 34, z + Math.sin(a) * 15.6));
    }
    out.gold.push(place(dome(14.5, 40, 1.45), x, y + 56, z));             // dome
    const ribs = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = (k / 8) * Math.PI / 2;
        pts.push(new THREE.Vector3(x + Math.cos(a) * Math.cos(t) * 14.7, y + 56 + Math.sin(t) * 14.5 * 1.45, z + Math.sin(a) * Math.cos(t) * 14.7));
      }
      ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.45, 4));
    }
    out.lead.push(...ribs);
    out.gold.push(place(cyl(3.2, 2.6, 9, 16), x, y + 76.5, z));             // lantern
    out.gold.push(place(new THREE.ConeGeometry(1.6, 16, 12).translate(0, 8, 0), x, y + 85.5, z)); // spire
  }
  // ---- Sacré-Cœur on the Butte Montmartre
  {
    const [x, z] = [4748, 348];
    const y = terrainHeight(x, z) - 2;
    const rot = -44.2 * Math.PI / 180; // campanile to the north, façade looking south over Paris
    const g = [];
    g.push(place(box(72, 26, 38), 0, 0, 0));
    g.push(place(cyl(12, 11.5, 22, 32), 0, 26, 0));
    g.push(place(dome(11.5, 32, 1.6), 0, 48, 0));
    g.push(place(cyl(2.4, 2.0, 7, 12), 0, 66, 0));
    for (const [dx, dz] of [[-20, 12], [20, 12], [-20, -12], [20, -12]]) {
      g.push(place(cyl(4.5, 4.3, 8, 20), dx, 26, dz));
      g.push(place(dome(4.3, 20, 1.5), dx, 34, dz));
    }
    g.push(place(box(12, 58, 12), 38, 0, 0));      // campanile
    g.push(place(dome(5, 16, 1.4), 38, 58, 0));
    for (const geo of g) { geo.rotateY(-rot); geo.translate(x, y, z); out.white.push(geo); }
  }
  // ---- Arc de Triomphe (45 × 22 × 50 m, main arch 29 m)
  {
    const [x, z] = [1261, -1172];
    const rot = axisAngle(1953, 833, 1261, -1172); // Champs-Élysées axis
    const g = [];
    const W = 45, D = 22, H = 49.5, aw = 14.6, ah = 29.2;
    const pw = (W - aw) / 2;
    for (const s of [-1, 1]) g.push(place(box(D, ah, pw), 0, 0, s * (aw / 2 + pw / 2)));
    g.push(place(box(D, H - ah, W), 0, ah, 0));
    g.push(place(box(D + 1.2, 1.6, W + 1.2), 0, H - 9, 0));   // cornice
    for (const geo of g) { geo.rotateY(-rot); geo.translate(x, 0, z); out.stone.push(geo); }
  }
  // ---- Obélisque de Louxor, place de la Concorde
  {
    const [x, z] = [1953, 833];
    out.stone.push(place(box(4, 4, 4), x, 0, z));
    out.stone.push(place(cyl(1.25, 0.9, 19, 4).rotateY(Math.PI / 4), x, 4, z));
    out.gold.push(place(new THREE.ConeGeometry(0.9, 2.2, 4).rotateY(Math.PI / 4).translate(0, 1.1, 0), x, 23, z));
  }
  // ---- Grande Arche de la Défense (hollow cube, 110 m)
  {
    const [x, z] = [-278, -5737];
    const rot = axisAngle(1261, -1172, -278, -5737);
    const S = 108, T = 19;
    const g = [];
    g.push(place(box(S, T, S), 0, S - T, 0));                // roof slab
    g.push(place(box(S, 8, S), 0, 0, 0));                   // base
    for (const s of [-1, 1]) g.push(place(box(S, S - T - 8, T), 0, 8, s * (S / 2 - T / 2)));
    for (const geo of g) { geo.rotateY(-rot); geo.translate(x, terrainHeight(x, z), z); out.white.push(geo); }
  }
  // ---- Notre-Dame de Paris (towers 69 m, spire 96 m)
  {
    const [x, z] = [2407, 3319];
    const rot = (115 - 134.2 + 90) * Math.PI / 180; // nave axis ≈ ESE
    const g = [], r = [];
    g.push(place(box(118, 33, 40), 0, 0, 0));
    r.push(new THREE.CylinderGeometry(0.01, 22, 12, 4, 1).rotateY(Math.PI / 4).scale(2.7, 1, 1).translate(0, 39, 0));
    for (const s of [-1, 1]) g.push(place(box(16, 69, 15), -62, 0, s * 12));
    g.push(place(box(12, 44, 34), -62, 0, 0));
    r.push(new THREE.ConeGeometry(2.5, 45, 8).translate(8, 33 + 22.5 + 12, 0));
    for (const geo of g) { geo.rotateY(-rot); geo.translate(x, 0, z); out.stone.push(geo); }
    for (const geo of r) { geo.rotateY(-rot); geo.translate(x, 0, z); out.lead.push(geo); }
  }
  // ---- Panthéon (83 m dome)
  {
    const [x, z] = [1692, 3659];
    out.stone.push(place(box(84, 30, 84), x, 0, z));
    out.stone.push(place(cyl(17, 16.5, 22, 32), x, 30, z));
    out.lead.push(place(dome(16.5, 32, 1.25), x, 52, z));
    out.stone.push(place(cyl(3, 2.6, 8, 12), x, 72, z));
  }
  // ---- Maison de la Radio: central tower above the ring
  out.stone.push(place(box(24, 68, 24), -1285, 0, -400));
  // ---- Opéra Garnier: copper dome
  {
    const green = new THREE.MeshStandardMaterial({ color: 0x5e8a74, roughness: 0.5, metalness: 0.5 });
    const d = new THREE.Mesh(mergeAll([place(dome(14, 24, 0.9), 2987, 34, 909)]), green);
    d.castShadow = true; scene.add(d);
  }
  const addAll = (list, mat) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeAll(list), mat);
    m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
    scene.add(m);
  };
  addAll(out.stone, stone);
  addAll(out.white, white);
  addAll(out.gold, gold);
  addAll(out.lead, lead);
  void glassDark;
}

// ---------------------------------------------------------------- labels & compass pins
export class LandmarkGuide {
  constructor(container) {
    this.el = container;
    this.items = LANDMARKS.map((l) => {
      const d = document.createElement('div');
      d.className = 'lbl' + (l.big ? ' big' : '');
      d.innerHTML = `<b>${l.cn}</b><span>${l.fr}</span>`;
      d.style.opacity = '0';
      this.el.append(d);
      return { ...l, dom: d, v: new THREE.Vector3(...l.pos), vis: false, dist: '' };
    });
    this._v = new THREE.Vector3();
  }
  compassList() { return this.items.filter((i) => i.big); }
  update(camera, on, playerPos) {
    const w = innerWidth, h = innerHeight;
    const high = playerPos.y > 45;
    const zoom = camera.fov < 40;
    const placed = [];
    const cand = [];
    for (const it of this.items) {
      const d = Math.hypot(it.v.x - camera.position.x, it.v.z - camera.position.z);
      it.d = d;
      let show = on && (high || zoom) && d > 180 && d < (zoom ? 14000 : 8000);
      if (show) {
        this._v.copy(it.v).project(camera);
        if (this._v.z > 1 || Math.abs(this._v.x) > 0.96 || Math.abs(this._v.y) > 0.92) show = false;
        else { it.sx = (this._v.x * 0.5 + 0.5) * w; it.sy = (-this._v.y * 0.5 + 0.5) * h; }
      }
      it.want = show;
      if (show) cand.push(it);
    }
    // priority: big landmarks first, then nearer ones; skip overlapping boxes
    cand.sort((a, b) => (b.big ? 1 : 0) - (a.big ? 1 : 0) || a.d - b.d);
    for (const it of cand) {
      const bw = 150, bh = 44;
      const box = [it.sx - bw / 2, it.sy - bh - 12, it.sx + bw / 2, it.sy];
      if (placed.some((p) => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]))) { it.want = false; continue; }
      placed.push(box);
      it.dom.style.transform = `translate(${it.sx.toFixed(1)}px, ${it.sy.toFixed(1)}px) translate(-50%, -100%)`;
      const km = it.d > 1000 ? `${(it.d / 1000).toFixed(1)} km` : `${Math.round(it.d)} m`;
      if (it.dist !== km) { it.dist = km; it.dom.querySelector('span').textContent = `${it.fr} · ${km}`; }
    }
    for (const it of this.items) {
      if (it.want !== it.vis) { it.vis = it.want; it.dom.style.opacity = it.want ? '1' : '0'; }
    }
  }
}
