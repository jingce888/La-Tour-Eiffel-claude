// Ground: land-cover textures painted from OpenStreetMap vectors at three
// scales (parvis / city / region), a flat urban plane with the Seine carved
// out, a far ring to the horizon and the hills that frame Paris.
import * as THREE from 'three';
import { quality } from '../core/quality.js';
import { canvas, toTexture, noiseTexture } from './textures.js';
import { terrainHeight, RIVER_Y, HILLS } from './geo.js';

const COL = {
  urban: '#8a867e', road1: '#56554f', road2: '#5a5953', road3: '#5f5d58', road4: '#64625c', road5: '#6d6a64',
  service: '#7a766f', pedestrian: '#b4ab9b', path: '#c9b89a', rail: '#6b6259',
  grass: '#5d7d3c', park: '#557638', forest: '#3d5a2d', cemetery: '#6c7652', pitch: '#4f8540',
  water: '#2c393b', far: '#8c877f',
};

function ringPath(g, pts, tx) {
  const n = pts.length / 2;
  g.moveTo(...tx(pts[0], pts[1]));
  for (let i = 1; i < n; i++) g.lineTo(...tx(pts[i * 2], pts[i * 2 + 1]));
  g.closePath();
}

/** Paints the land cover of the square [cx±half] into a size×size canvas. */
function paint(data, cx, cz, half, size, level) {
  const cv = canvas(size, size), g = cv.getContext('2d');
  const s = size / (2 * half);
  const tx = (x, z) => [(x - (cx - half)) * s, (z - (cz - half)) * s];
  const inView = (pts) => {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    return !(maxx < cx - half || minx > cx + half || maxz < cz - half || minz > cz + half);
  };
  g.fillStyle = level === 'far' ? COL.far : COL.urban;
  g.fillRect(0, 0, size, size);
  // subtle large-scale variation of the urban fabric
  if (level !== 'local') {
    const R = mulberry(9);
    g.globalAlpha = 0.06;
    for (let i = 0; i < 900; i++) {
      g.fillStyle = R() > 0.5 ? '#6f6b64' : '#a29d93';
      const r = (6 + R() * 40) * (size / 2048);
      g.beginPath(); g.arc(R() * size, R() * size, r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  // pedestrian plazas
  for (const l of data.roads) {
    if (l.cls === 7 && (l.flags & 2) && inView(l.pts)) {
      g.fillStyle = COL.pedestrian; g.beginPath(); ringPath(g, l.pts, tx); g.fill();
    }
  }
  // green areas (largest first)
  const gcol = { 1: COL.grass, 2: COL.park, 3: COL.forest, 4: COL.cemetery, 5: COL.pitch };
  for (const a of data.green) {
    if (!inView(a.outer)) continue;
    g.fillStyle = gcol[a.cls] || COL.park;
    g.beginPath(); ringPath(g, a.outer, tx);
    for (const h of a.holes) ringPath(g, h, tx);
    g.fill('evenodd');
    if (level === 'local' && (a.cls === 1 || a.cls === 2)) {
      // mowing stripes
      g.save(); g.clip('evenodd');
      g.globalAlpha = 0.07; g.fillStyle = '#9fbf6a';
      const step = 7 * s;
      for (let k = -size; k < size * 2; k += step * 2) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + step, 0); g.lineTo(k + step, size); g.lineTo(k, size); g.fill(); }
      g.restore(); g.globalAlpha = 1;
    }
  }
  // roads & paths
  const roadCol = { 1: COL.road1, 2: COL.road2, 3: COL.road3, 4: COL.road4, 5: COL.road5, 6: COL.service, 7: COL.pedestrian, 8: COL.path };
  g.lineCap = 'round'; g.lineJoin = 'round';
  const lists = level === 'far' ? [data.roadsFar, data.roads.filter((r) => r.cls <= 3)] : [data.roads];
  for (let pass = 0; pass < 2; pass++) {
    for (const list of lists) {
      for (const l of list) {
        if ((l.flags & 2) || !inView(l.pts)) continue;
        if (pass === 0 && l.cls < 7) continue;   // paths first, streets on top
        if (pass === 1 && l.cls >= 7) continue;
        const w = Math.max(level === 'far' ? 0.8 : 0.6, l.width * s * (level === 'far' ? 2.2 : 1));
        g.strokeStyle = roadCol[l.cls] || COL.road5;
        g.lineWidth = w;
        g.beginPath();
        const n = l.pts.length / 2;
        g.moveTo(...tx(l.pts[0], l.pts[1]));
        for (let i = 1; i < n; i++) g.lineTo(...tx(l.pts[i * 2], l.pts[i * 2 + 1]));
        g.stroke();
      }
    }
  }
  // railways
  g.strokeStyle = COL.rail;
  for (const l of data.rail) {
    if (!inView(l.pts)) continue;
    g.lineWidth = Math.max(0.6, 6 * s);
    g.beginPath();
    const n = l.pts.length / 2;
    g.moveTo(...tx(l.pts[0], l.pts[1]));
    for (let i = 1; i < n; i++) g.lineTo(...tx(l.pts[i * 2], l.pts[i * 2 + 1]));
    g.stroke();
  }
  // the paved parvis under and around the tower (stabilised sand & stone)
  if (level !== 'far') {
    g.fillStyle = '#b3a791';
    const [ax, az] = tx(-70, -70), [bx, bz] = tx(70, 70);
    g.fillRect(ax, az, bx - ax, bz - az);
    if (level === 'local') {
      g.strokeStyle = 'rgba(90,80,66,0.18)'; g.lineWidth = Math.max(1, 0.25 * s);
      for (let v = -70; v <= 70; v += 3.5) {
        g.beginPath(); g.moveTo(...tx(v, -70)); g.lineTo(...tx(v, 70)); g.stroke();
        g.beginPath(); g.moveTo(...tx(-70, v)); g.lineTo(...tx(70, v)); g.stroke();
      }
    }
  }
  // water
  g.fillStyle = COL.water;
  for (const a of data.water) {
    if (!inView(a.outer)) continue;
    g.beginPath(); ringPath(g, a.outer, tx);
    for (const h of a.holes) ringPath(g, h, tx);
    g.fill('evenodd');
  }
  return cv;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintNight(data, half, size) {
  const cv = canvas(size, size), g = cv.getContext('2d');
  const s = size / (2 * half);
  const tx = (x, z) => [(x + half) * s, (z + half) * s];
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.lineCap = 'round';
  g.shadowColor = '#ff9a3c'; g.shadowBlur = 3;
  for (const l of [...data.roads, ...data.roadsFar]) {
    if (l.cls > 6 || (l.flags & 2)) continue;
    g.strokeStyle = l.cls <= 2 ? '#ffd08a' : '#b97a3c';
    g.lineWidth = Math.max(0.8, (l.cls <= 3 ? 2.2 : 1.2));
    g.beginPath();
    g.moveTo(...tx(l.pts[0], l.pts[1]));
    for (let i = 2; i < l.pts.length; i += 2) g.lineTo(...tx(l.pts[i], l.pts[i + 1]));
    g.stroke();
  }
  g.shadowBlur = 0;
  // warm pool of light around the illuminated tower
  const [cx, cz] = tx(0, 0);
  const grd = g.createRadialGradient(cx, cz, 0, cx, cz, 190 * s);
  grd.addColorStop(0, 'rgba(255,190,110,0.9)'); grd.addColorStop(0.45, 'rgba(255,160,80,0.35)'); grd.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = grd; g.fillRect(cx - 200 * s, cz - 200 * s, 400 * s, 400 * s);
  return toTexture(cv, { repeat: false });
}

export function groundMaterial(tex) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0 });
  const U = {
    tNight: { value: tex.night }, uNight: { value: 0 }, bNight: { value: new THREE.Vector3(0, 0, 9000) },
    tLocal: { value: tex.local }, tMid: { value: tex.mid }, tFar: { value: tex.far }, tNoise: { value: noiseTexture() },
    bLocal: { value: new THREE.Vector3(0, 0, 450) }, bMid: { value: new THREE.Vector3(0, 0, 2800) }, bFar: { value: new THREE.Vector3(0, 0, 25000) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGW;
        uniform sampler2D tLocal, tMid, tFar, tNoise, tNight;
        uniform vec3 bLocal, bMid, bFar, bNight;
        uniform float uNight;
        vec2 guv(vec2 xz, vec3 b) { vec2 u = (xz - b.xy) / (2.0 * b.z) + 0.5; return vec2(u.x, 1.0 - u.y); }
        float edgeW(vec2 xz, vec3 b, float band) { vec2 d = abs(xz - b.xy); return clamp((b.z - max(d.x, d.y)) / band, 0.0, 1.0); }`)
      .replace('#include <map_fragment>', `
        vec2 xz = vGW.xz;
        vec3 cF = texture2D(tFar, guv(xz, bFar)).rgb;
        vec3 cM = texture2D(tMid, guv(xz, bMid)).rgb;
        vec3 cL = texture2D(tLocal, guv(xz, bLocal)).rgb;
        vec3 gc = mix(cF, cM, edgeW(xz, bMid, 300.0));
        gc = mix(gc, cL, edgeW(xz, bLocal, 60.0));
        float n1 = texture2D(tNoise, xz * 0.043).r;
        float n2 = texture2D(tNoise, xz * 0.31).r;
        float n3 = texture2D(tNoise, xz * 1.9).r;
        float grass = smoothstep(0.02, 0.08, gc.g - max(gc.r, gc.b));
        float sandy = smoothstep(0.05, 0.12, gc.r - gc.b) * (1.0 - grass);
        vec3 detail = vec3(0.86 + 0.28 * n1) * (0.9 + 0.2 * n2);
        detail = mix(detail, detail * (0.78 + 0.44 * n3), grass * 0.9 + sandy * 0.5);
        diffuseColor.rgb *= gc * detail;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.99, grass);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uNight > 0.0) {
          vec3 nl = texture2D(tNight, guv(xz, bNight)).rgb;
          float nd = smoothstep(60.0, 420.0, length(vGW - cameraPosition));
          totalEmissiveRadiance += nl * vec3(0.9, 0.62, 0.32) * uNight * 0.3 * nd;
        }`);
  };
  mat.userData.uniforms = U;
  mat.customProgramCacheKey = () => 'ground-v2';
  return mat;
}

function circleContour(r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

/** Sutherland–Hodgman clip of a ring (flat array) against a convex polygon (Vector2[] CCW). */
function clipRing(flat, clip) {
  let poly = [];
  for (let i = 0; i < flat.length; i += 2) poly.push([flat[i], flat[i + 1]]);
  for (let e = 0; e < clip.length; e++) {
    const A = clip[e], B = clip[(e + 1) % clip.length];
    const inside = (p) => (B.x - A.x) * (p[1] - A.y) - (B.y - A.y) * (p[0] - A.x) >= 0;
    const inter = (p, q) => {
      const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1];
      const x3 = A.x, y3 = A.y, x4 = B.x, y4 = B.y;
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / (den || 1e-9);
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Qp = poly[(i + 1) % poly.length];
      const pin = inside(P), qin = inside(Qp);
      if (pin) { out.push(P); if (!qin) out.push(inter(P, Qp)); } else if (qin) out.push(inter(P, Qp));
    }
    poly = out;
    if (!poly.length) break;
  }
  return poly;
}

export const NEAR_R = 8000;

export function buildGround({ scene, data, holes = [] }) {
  const midSize = quality.groundTex;
  const tex = {
    local: toTexture(paint(data, 0, 0, 450, 2048, 'local'), { repeat: false }),
    mid: toTexture(paint(data, 0, 0, 2800, midSize, 'mid'), { repeat: false }),
    far: toTexture(paint(data, 0, 0, 25000, 2048, 'far'), { repeat: false }),
    night: paintNight(data, 9000, 2048),
  };
  const mat = groundMaterial(tex);

  // near plane with the river carved out (islands restored)
  const contour = circleContour(NEAR_R, 160);
  const clip = circleContour(NEAR_R - 20, 160);
  const shape = new THREE.Shape(contour);
  const islands = [];
  const riverRings = [];
  for (const a of data.water) {
    if (a.cls !== 1) continue;
    const c = clipRing(a.outer, clip);
    if (c.length < 3) continue;
    riverRings.push(c);
    shape.holes.push(new THREE.Path(c.map(([x, z]) => new THREE.Vector2(x, z))));
    for (const h of a.holes) {
      const hc = clipRing(h, clip);
      if (hc.length >= 3) islands.push(hc);
    }
  }
  // lift pits at the ground stations
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  const geo = new THREE.ShapeGeometry(shape, 1);
  geo.rotateX(Math.PI / 2);            // shape (x, y) → world (x, 0, y)
  flipUp(geo);
  const near = new THREE.Mesh(geo, mat);
  near.receiveShadow = true;
  near.name = 'ground-near';
  scene.add(near);
  for (const isl of islands) {
    const g2 = new THREE.ShapeGeometry(new THREE.Shape(isl.map(([x, z]) => new THREE.Vector2(x, z))));
    g2.rotateX(Math.PI / 2); flipUp(g2);
    const m = new THREE.Mesh(g2, mat); m.receiveShadow = true; scene.add(m);
  }

  // far ring out to the horizon (slightly below to avoid any overlap artefacts)
  {
    const radial = 40, ang = 180;
    const r0 = NEAR_R - 30, r1 = 34000;
    const pos = [], idx = [];
    for (let j = 0; j <= radial; j++) {
      const t = j / radial;
      const r = r0 * Math.pow(r1 / r0, t);
      for (let i = 0; i <= ang; i++) {
        const a = (i / ang) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        pos.push(x, terrainHeight(x, z) - 0.6 - (j === 0 ? 0 : 0), z);
      }
    }
    for (let j = 0; j < radial; j++) {
      for (let i = 0; i < ang; i++) {
        const a = j * (ang + 1) + i, b = a + ang + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const far = new THREE.Mesh(g, mat);
    far.receiveShadow = true;
    scene.add(far);
  }

  // hills inside the near circle (Montmartre, Belleville…) as smooth domes
  for (const hill of HILLS) {
    const hx = hill.x, hz = hill.z, R = hill.r * 3.1;
    const rings = 28, seg = 72, pos = [], idx = [];
    for (let j = 0; j <= rings; j++) {
      const r = R * Math.pow(j / rings, 1.15);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r;
        // crosses the flat ground at a clear angle (no coplanar z-fighting)
        pos.push(x, terrainHeight(x, z) - 1.0, z);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i, b = a + seg + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    scene.add(m);
  }
  return { riverRings, mat, tex };
}

function flipUp(geo) {
  const idx = geo.index;
  for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
}

export { RIVER_Y };
