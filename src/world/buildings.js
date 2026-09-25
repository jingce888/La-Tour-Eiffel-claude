// Buildings of Paris.
//
// Near: real OpenStreetMap footprints (merged into city blocks), extruded
// with a Parisian mansard roof where appropriate, grouped in 480 m chunks.
// Far: a procedural city fabric of instanced blocks aligned with the real
// street network, filling everything that is not water, park, rail or road.
// One shader draws both: Haussmann limestone façades (window rhythm, shop
// fronts, balconies, cornice), zinc roofs with dormers and chimney pots,
// glass towers, and lit windows at night — all from world position, so the
// geometry needs no UVs or normals.
import * as THREE from 'three';
import { quality } from '../core/quality.js';
import { terrainHeight, R_DETAIL } from './geo.js';

// ---------------------------------------------------------------- shader
const COMMON = /* glsl */`
  varying vec3 vBW;
  varying vec4 vBD;
  uniform float uNight;
  float bh1(float n) { return fract(sin(n) * 43758.5453); }
  float bh2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

export function buildingMaterial({ instanced = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0, flatShading: true });
  const U = { uNight: { value: 0 } };
  mat.userData.uniforms = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${COMMON}
        ${instanced ? 'attribute vec4 bdataI;' : 'attribute vec4 bdata;'}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${instanced ? `
          vec4 bwI = instanceMatrix * vec4(transformed, 1.0);
          vBW = (modelMatrix * bwI).xyz;
          vBD = bdataI;` : `
          vBW = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vBD = bdata;`}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <map_fragment>', `
        vec3 bN = normalize(cross(dFdx(vBW), dFdy(vBW)));
        if (dot(bN, cameraPosition - vBW) < 0.0) bN = -bN;
        float bStyle = floor(vBD.x);
        float bSeed = fract(vBD.x);
        float hRel = vBW.y - vBD.y;
        float wallTop = vBD.z - vBD.y;
        float dist = length(cameraPosition - vBW);
        float isRoof = step(0.86, bN.y);
        float isMansard = step(0.2, bN.y) * (1.0 - isRoof);
        vec3 bT = normalize(vec3(-bN.z, 0.0, bN.x) + 1e-5);
        float u = dot(vBW.xz, bT.xz) + bSeed * 17.0;
        // façade palette
        vec3 stone = mix(vec3(0.5, 0.43, 0.31), vec3(0.62, 0.54, 0.4), bh1(bSeed * 91.7));
        stone *= 0.86 + 0.18 * bh1(bSeed * 13.1);
        vec3 col = stone;
        float glassK = 0.0;
        float emis = 0.0;
        float fh = bStyle == 2.0 ? 4.6 : 3.05;     // floor height
        float gf = bStyle == 2.0 ? 5.5 : 4.4;      // ground floor
        float colW = bStyle == 2.0 ? 3.8 : 3.15;   // window pitch
        float fl = hRel < gf ? 0.0 : 1.0 + floor((hRel - gf) / fh);
        float fv = hRel < gf ? hRel / gf : fract((hRel - gf) / fh);
        float cu = fract(u / colW);
        float colId = floor(u / colW);
        float lod = clamp((dist - 260.0) / 900.0, 0.0, 1.0);   // fade the window grid far away
        if (bStyle == 4.0) {
          // glass & steel curtain wall
          vec3 g1 = mix(vec3(0.07, 0.09, 0.11), vec3(0.16, 0.2, 0.24), bh1(bSeed * 7.3));
          float mull = max(step(0.93, fract(u / 1.5)), step(0.9, fract(hRel / 3.6)));
          col = mix(g1, vec3(0.3, 0.32, 0.34), mull * (1.0 - lod));
          glassK = 1.0 - mull * 0.6;
          float lit = step(0.55, bh2(vec2(floor(u / 1.5), floor(hRel / 3.6)) + bSeed));
          emis = lit * (1.0 - mull);
        } else if (bStyle == 1.0 || bStyle == 3.0) {
          vec3 c2 = bStyle == 3.0 ? vec3(0.42, 0.41, 0.39) : mix(vec3(0.58, 0.56, 0.53), vec3(0.55, 0.42, 0.33), step(0.7, bh1(bSeed * 3.1)));
          col = c2;
          float win = step(0.25, cu) * step(cu, 0.75) * step(0.3, fract(hRel / 3.0)) * step(fract(hRel / 3.0), 0.85) * step(3.0, hRel);
          win *= bStyle == 3.0 ? 0.0 : 1.0;
          col = mix(col, vec3(0.06, 0.07, 0.08), win * (1.0 - lod * 0.7));
          glassK = win * 0.7;
          emis = win * step(0.6, bh2(vec2(colId, floor(hRel / 3.0)) + bSeed));
        } else if (bStyle == 5.0) {
          col = stone * 1.05;
          float lanc = step(0.4, cu) * step(cu, 0.6) * step(4.0, hRel) * step(hRel, wallTop - 4.0);
          col = mix(col, vec3(0.08, 0.08, 0.1), lanc * (1.0 - lod));
        } else {
          // Haussmann: shop fronts, windows with shutters' shadow, balconies, cornice
          float isGround = 1.0 - step(gf, hRel);
          float win = step(0.36, cu) * step(cu, 0.64) * step(0.14, fv) * step(fv, 0.84) * (1.0 - isGround);
          float shop = isGround * step(0.08, cu) * step(cu, 0.92) * step(0.08, fv) * step(fv, 0.82);
          float balc = (1.0 - isGround) * (step(fl, 2.5) * step(1.5, fl) + step(fl, 5.5) * step(4.5, fl)) * step(fv, 0.14) * step(0.02, fv);
          float cornice = step(wallTop - 0.9, hRel) * step(hRel, wallTop);
          float band = step(fv, 0.035) * (1.0 - isGround);
          col = mix(col, col * 1.12, cornice + band * 0.6);
          float frame = step(0.31, cu) * step(cu, 0.69) * step(0.1, fv) * step(fv, 0.88) * (1.0 - isGround) * (1.0 - win);
          col = mix(col, col * 1.1, frame * (1.0 - lod));
          col = mix(col, mix(vec3(0.08, 0.085, 0.09), col * 0.72, lod), (win + shop * 0.9));
          col = mix(col, vec3(0.09, 0.08, 0.075), balc * (1.0 - lod));
          glassK = (win + shop) * (1.0 - lod);
          float lit = step(0.52, bh2(vec2(colId, fl) + bSeed * 7.0));
          emis = win * lit + shop * 1.6 * step(0.3, bh2(vec2(colId, 3.0) + bSeed));
        }
        // street-level grime & soft ambient occlusion
        col *= mix(0.72, 1.0, smoothstep(0.0, 9.0, hRel));
        col *= 0.93 + 0.1 * bh2(vec2(floor(u / 9.0), bSeed));
        // mansard: zinc with dormers
        if (isMansard > 0.5) {
          vec3 zinc = mix(vec3(0.15, 0.165, 0.185), vec3(0.2, 0.2, 0.21), bh1(bSeed * 5.1));
          float dorm = step(0.36, cu) * step(cu, 0.64) * step(0.18, (hRel - wallTop) / 3.6) * step((hRel - wallTop) / 3.6, 0.72);
          col = mix(zinc, vec3(0.62, 0.58, 0.52), dorm * 0.8 * (1.0 - lod));
          col = mix(col, vec3(0.05, 0.05, 0.06), dorm * step(0.42, cu) * step(cu, 0.58) * (1.0 - lod));
          glassK = 0.2;
          emis = dorm * step(0.7, bh2(vec2(colId, 9.0) + bSeed));
        }
        // roofs: zinc sheets, gravel terraces, chimney pots
        if (isRoof > 0.5) {
          vec3 zinc = mix(vec3(0.17, 0.185, 0.2), vec3(0.23, 0.23, 0.24), bh1(bSeed * 2.3));
          vec3 terr = vec3(0.3, 0.29, 0.27);
          col = (bStyle == 1.0 || bStyle == 3.0 || bStyle == 4.0) ? terr : zinc;
          float seam = step(0.92, fract(vBW.x * 0.9 + vBW.z * 0.25));
          col *= 1.0 - seam * 0.12 * (1.0 - lod);
          vec2 cell = floor(vBW.xz / 3.4);
          float chim = step(0.9, bh2(cell + bSeed)) * step(0.3, fract(vBW.x / 3.4)) * step(fract(vBW.x / 3.4), 0.7) * step(0.3, fract(vBW.z / 3.4)) * step(fract(vBW.z / 3.4), 0.6);
          col = mix(col, vec3(0.5, 0.26, 0.16), chim * (bStyle == 0.0 ? 1.0 : 0.0));
          glassK = 0.0; emis = 0.0;
        }
        diffuseColor.rgb = col;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.86, 0.14, glassK);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(0.0, 0.35, glassK * step(3.5, bStyle) * step(bStyle, 4.5));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.68, 0.36) * emis * uNight * 0.55;`);
  };
  mat.customProgramCacheKey = () => (instanced ? 'bld-inst-v3' : 'bld-v3');
  return mat;
}

// ---------------------------------------------------------------- overrides for landmarks
// buildings replaced by hand-made models, or with misleading heights
const OVERRIDES = [
  { x: -278, z: -5737, r: 90, skip: true },          // Grande Arche → model
  { x: 1261, z: -1172, r: 30, skip: true },          // Arc de Triomphe → model
  { x: 4748, z: 348, r: 70, skip: true },            // Sacré-Cœur → model
  { x: 704, z: 1163, r: 45, clamp: 30 },             // Invalides church body (dome is a model)
  { x: -1285, z: -400, r: 110, clamp: 26 },          // Maison de la Radio ring (tower added)
  { x: 2987, z: 909, r: 80, clamp: 34 },             // Opéra Garnier body
  { x: 2407, z: 3319, r: 80, skip: true },           // Notre-Dame → model
  { x: 1692, z: 3659, r: 70, skip: true },           // Panthéon → model
];

// ---------------------------------------------------------------- geometry
function signedArea(flat) {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1];
  }
  return a / 2;
}

/** Inset (miter) of a ring towards the building mass (right-hand side of each edge). */
function insetRing(flat, d) {
  const n = flat.length / 2;
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n, q = (i + 1) % n;
    const x = flat[i * 2], z = flat[i * 2 + 1];
    let e1x = x - flat[p * 2], e1z = z - flat[p * 2 + 1];
    let e2x = flat[q * 2] - x, e2z = flat[q * 2 + 1] - z;
    const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
    e1x /= l1; e1z /= l1; e2x /= l2; e2z /= l2;
    const n1x = e1z, n1z = -e1x, n2x = e2z, n2z = -e2x;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-4) { mx = n1x; mz = n1z; } else { mx /= ml; mz /= ml; }
    const cos = mx * n1x + mz * n1z;
    const len = Math.min(d / Math.max(cos, 0.3), d * 2.6);
    out[i * 2] = x + mx * len;
    out[i * 2 + 1] = z + mz * len;
  }
  return out;
}

function insetOk(orig, ins) {
  const n = orig.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ox = orig[j * 2] - orig[i * 2], oz = orig[j * 2 + 1] - orig[i * 2 + 1];
    const ix = ins[j * 2] - ins[i * 2], iz = ins[j * 2 + 1] - ins[i * 2 + 1];
    if (ox * ix + oz * iz <= 0) return false; // edge flipped → self-intersection
  }
  return Math.abs(signedArea(ins)) > Math.abs(signedArea(orig)) * 0.3;
}

class Chunk {
  constructor() { this.pos = []; this.bd = []; this.idx = []; this.v = 0; }
  vert(x, y, z, bd) { this.pos.push(x, y, z); this.bd.push(bd[0], bd[1], bd[2], bd[3]); return this.v++; }
}

function addBuilding(ch, b, mansards) {
  const cx = centroidX(b.outer), cz = centroidZ(b.outer);
  let h = b.h;
  for (const o of OVERRIDES) {
    if (Math.hypot(cx - o.x, cz - o.z) < o.r) {
      if (o.skip) return;
      if (o.clamp) h = Math.min(h, o.clamp);
    }
  }
  if (b.style === 5 && h > 26) h = 26;
  const base = terrainHeight(cx, cz) - 0.6;
  const y0 = base + (b.minh || 0);
  const useM = mansards && b.roof === 1 && h >= 13;
  const mh = useM ? Math.min(3.6, h * 0.22) : 0;
  const wallTop = base + h - mh;
  const top = base + h;
  const bd = [b.style + (b.seed + 0.5) / 256, base, wallTop, top];
  const rings = [b.outer, ...b.holes];
  let insets = null;
  if (useM) {
    insets = rings.map((r) => insetRing(r, 1.3));
    if (!insets.every((ins, i) => insetOk(rings[i], ins))) insets = null;
  }
  const wt = insets ? wallTop : top;
  const bdW = [bd[0], bd[1], wt, top];
  const topRings = [];
  for (let k = 0; k < rings.length; k++) {
    const r = rings[k];
    const n = r.length / 2;
    const bot = [], tp = [];
    for (let i = 0; i < n; i++) {
      bot.push(ch.vert(r[i * 2], y0, r[i * 2 + 1], bdW));
      tp.push(ch.vert(r[i * 2], wt, r[i * 2 + 1], bdW));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      ch.idx.push(bot[i], bot[j], tp[j], bot[i], tp[j], tp[i]);
    }
    if (insets) {
      const ins = insets[k];
      const up = [];
      for (let i = 0; i < n; i++) up.push(ch.vert(ins[i * 2], top, ins[i * 2 + 1], bdW));
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        ch.idx.push(tp[i], tp[j], up[j], tp[i], up[j], up[i]);
      }
      topRings.push({ flat: ins, ids: up });
    } else {
      topRings.push({ flat: r, ids: tp });
    }
  }
  // roof
  const contour = [], holes = [];
  const toV = (flat) => { const a = []; for (let i = 0; i < flat.length; i += 2) a.push(new THREE.Vector2(flat[i], flat[i + 1])); return a; };
  contour.push(...toV(topRings[0].flat));
  for (let k = 1; k < topRings.length; k++) holes.push(toV(topRings[k].flat));
  let faces;
  try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { faces = []; }
  const ids = topRings.flatMap((t) => t.ids);
  const all = [...contour, ...holes.flat()];
  for (const [a, bb, c] of faces) {
    // ensure the face points up
    const A = all[a], B = all[bb], Cc = all[c];
    const cross = (B.x - A.x) * (Cc.y - A.y) - (B.y - A.y) * (Cc.x - A.x);
    if (cross < 0) ch.idx.push(ids[a], ids[bb], ids[c]);
    else ch.idx.push(ids[a], ids[c], ids[bb]);
  }
}

function centroidX(f) { let s = 0; for (let i = 0; i < f.length; i += 2) s += f[i]; return s / (f.length / 2); }
function centroidZ(f) { let s = 0; for (let i = 1; i < f.length; i += 2) s += f[i]; return s / (f.length / 2); }

export function buildNearBuildings({ scene, data, collision }) {
  const mat = buildingMaterial();
  const CH = 480;
  const chunks = new Map();
  const mansards = quality.mansards;
  const list = [...data.buildings, ...data.tall];
  for (const b of list) {
    const cx = centroidX(b.outer), cz = centroidZ(b.outer);
    // sparse tall landmarks far out share coarse chunks
    const ch = Math.hypot(cx, cz) > R_DETAIL + 200 ? 4000 : CH;
    const key = `${ch}:${Math.floor(cx / ch)},${Math.floor(cz / ch)}`;
    if (!chunks.has(key)) chunks.set(key, new Chunk());
    addBuilding(chunks.get(key), b, mansards);
    // collision for buildings near the walkable area
    if (Math.hypot(cx, cz) < 1300 && collision) {
      collision.addPolyWalls(pairs(b.outer), 0.05, -1, b.h);
    }
  }
  const meshes = [];
  let tris = 0;
  for (const ch of chunks.values()) {
    if (!ch.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3));
    g.setAttribute('bdata', new THREE.Float32BufferAttribute(ch.bd, 4));
    g.setIndex(ch.v > 65535 ? new THREE.Uint32BufferAttribute(ch.idx, 1) : new THREE.Uint16BufferAttribute(ch.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    meshes.push(m);
    m.userData.center = g.boundingSphere.center.clone();
    m.userData.radius = g.boundingSphere.radius;
    tris += ch.idx.length / 3;
  }
  return {
    mat, meshes, tris, count: list.length,
    update(camera) {
      const p = camera.position;
      const range = p.y > 150 ? 2200 : 900;
      for (const m of meshes) {
        const d = Math.hypot(m.userData.center.x - p.x, m.userData.center.z - p.z) - m.userData.radius;
        m.castShadow = d < range;
      }
    },
  };
}

function pairs(flat) { const a = []; for (let i = 0; i < flat.length; i += 2) a.push([flat[i], flat[i + 1]]); return a; }

// ---------------------------------------------------------------- far procedural city
export function buildFarCity({ scene, data }) {
  const R0 = R_DETAIL + 60, R1 = 9500;
  const G = 1024, half = R1;
  const cv = document.createElement('canvas');
  cv.width = cv.height = G;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const s = G / (2 * half);
  const tx = (x, z) => [(x + half) * s, (z + half) * s];
  g.fillStyle = '#000'; g.fillRect(0, 0, G, G);
  g.fillStyle = '#fff';
  const fillRing = (flat) => {
    g.beginPath();
    g.moveTo(...tx(flat[0], flat[1]));
    for (let i = 2; i < flat.length; i += 2) g.lineTo(...tx(flat[i], flat[i + 1]));
    g.closePath();
  };
  for (const a of data.water) { fillRing(a.outer); g.fill(); }
  for (const a of data.green) { if (a.cls === 1 && Math.hypot(a.outer[0], a.outer[1]) < R0) continue; fillRing(a.outer); g.fill(); }
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (const l of [...data.roadsFar, ...data.roads.filter((r) => r.cls <= 2)]) {
    g.lineWidth = Math.max(1, (l.width * 1.6) * s);
    g.beginPath(); g.moveTo(...tx(l.pts[0], l.pts[1]));
    for (let i = 2; i < l.pts.length; i += 2) g.lineTo(...tx(l.pts[i], l.pts[i + 1]));
    g.stroke();
  }
  for (const l of data.rail) {
    g.lineWidth = Math.max(1, 14 * s);
    g.beginPath(); g.moveTo(...tx(l.pts[0], l.pts[1]));
    for (let i = 2; i < l.pts.length; i += 2) g.lineTo(...tx(l.pts[i], l.pts[i + 1]));
    g.stroke();
  }
  const mask = g.getImageData(0, 0, G, G).data;
  const blocked = (x, z) => {
    const px = Math.floor((x + half) * s), pz = Math.floor((z + half) * s);
    if (px < 0 || pz < 0 || px >= G || pz >= G) return true;
    return mask[(pz * G + px) * 4] > 100;
  };
  // orientation field from the street network (angles mod 90°)
  const OG = 96, oc = new Float32Array(OG * OG * 2), ow = new Float32Array(OG * OG);
  const ocs = OG / (2 * half);
  for (const l of [...data.roadsFar, ...data.roads.filter((r) => r.cls <= 5)]) {
    for (let i = 2; i < l.pts.length; i += 2) {
      const x0 = l.pts[i - 2], z0 = l.pts[i - 1], x1 = l.pts[i], z1 = l.pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 5) continue;
      const a = Math.atan2(z1 - z0, x1 - x0) * 4;
      const steps = Math.ceil(len / 60);
      for (let k = 0; k <= steps; k++) {
        const x = x0 + (x1 - x0) * k / steps, z = z0 + (z1 - z0) * k / steps;
        const cx = Math.floor((x + half) * ocs), cz = Math.floor((z + half) * ocs);
        if (cx < 0 || cz < 0 || cx >= OG || cz >= OG) continue;
        const id = cz * OG + cx;
        oc[id * 2] += Math.cos(a) * len; oc[id * 2 + 1] += Math.sin(a) * len; ow[id] += len;
      }
    }
  }
  for (let it = 0; it < 12; it++) {
    const nx = new Float32Array(oc);
    for (let z = 1; z < OG - 1; z++) {
      for (let x = 1; x < OG - 1; x++) {
        const id = z * OG + x;
        if (ow[id] > 0) continue;
        let sx = 0, sz = 0;
        for (const d of [-1, 1, -OG, OG]) { sx += oc[(id + d) * 2]; sz += oc[(id + d) * 2 + 1]; }
        nx[id * 2] = sx * 0.25; nx[id * 2 + 1] = sz * 0.25;
      }
    }
    oc.set(nx);
  }
  const angleAt = (x, z) => {
    const cx = Math.min(OG - 1, Math.max(0, Math.floor((x + half) * ocs)));
    const cz = Math.min(OG - 1, Math.max(0, Math.floor((z + half) * ocs)));
    const id = cz * OG + cx;
    return Math.atan2(oc[id * 2 + 1], oc[id * 2]) / 4;
  };
  // lay out blocks
  let seed = 1234567;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cell = 54 / Math.sqrt(quality.farCity);
  const inst = [];
  for (let z = -R1; z < R1; z += cell) {
    for (let x = -R1; x < R1; x += cell) {
      const px = x + (R() - 0.5) * cell * 0.5, pz = z + (R() - 0.5) * cell * 0.5;
      const r = Math.hypot(px, pz);
      if (r < R0 || r > R1) continue;
      if (blocked(px, pz)) continue;
      const a = angleAt(px, pz);
      const w = cell * (0.55 + R() * 0.35), d = cell * (0.45 + R() * 0.45);
      // Paris keeps a uniform skyline; the suburbs are more varied
      let h = 15 + R() * 10 + (R() > 0.93 ? 8 + R() * 18 : 0);
      if (r > 6500) h *= 0.7 + R() * 0.5;
      const base = terrainHeight(px, pz) - 0.5;
      const style = R() > 0.8 ? 1 : 0;
      inst.push([px, base, pz, w, h, d, a, style + (Math.floor(R() * 255) + 0.5) / 256]);
    }
  }
  // 8 shared corners, 10 triangles: normals come from screen-space derivatives
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
    -0.5, 1, -0.5, 0.5, 1, -0.5, 0.5, 1, 0.5, -0.5, 1, 0.5,
  ], 3));
  geo.setIndex([
    4, 7, 6, 4, 6, 5,           // top
    0, 1, 5, 0, 5, 4,           // -z
    1, 2, 6, 1, 6, 5,           // +x
    2, 3, 7, 2, 7, 6,           // +z
    3, 0, 4, 3, 4, 7,           // -x
  ]);
  geo.computeBoundingSphere();
  const mat = buildingMaterial({ instanced: true });
  const mesh = new THREE.InstancedMesh(geo, mat, inst.length);
  const bdI = new Float32Array(inst.length * 4);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  inst.forEach((b, i) => {
    e.set(0, -b[6], 0); q.setFromEuler(e);
    M.compose(new THREE.Vector3(b[0], b[1], b[2]), q, new THREE.Vector3(b[3], b[4], b[5]));
    mesh.setMatrixAt(i, M);
    bdI.set([b[7], b[1], b[1] + b[4], b[1] + b[4]], i * 4);
  });
  geo.setAttribute('bdataI', new THREE.InstancedBufferAttribute(bdI, 4));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return { mat, mesh, count: inst.length };
}
