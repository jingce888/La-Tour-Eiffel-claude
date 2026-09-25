// Trees: every street & park tree mapped in OpenStreetMap near the tower,
// plus a sparser fill in woods and large parks. Instanced per 420 m chunk with
// two levels of detail that swap by distance.
import * as THREE from 'three';
import { quality } from '../core/quality.js';
import { terrainHeight } from './geo.js';
import { rng } from './textures.js';

function canopyGeometry(detail, rough) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const R = rng(17 + detail);
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, 1 + (R() - 0.5) * rough);
    const s = map.get(k);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * (pos.getY(i) < 0 ? 0.72 : 1), pos.getZ(i) * s);
  }
  g.deleteAttribute('uv');
  const merged = mergeVerts(g);
  merged.computeVertexNormals();
  return merged;
}

/** Near LOD: three overlapping lobes read as a real crown instead of a ball. */
function lobedCanopy() {
  const lobes = [[0, 0.08, 0, 0.78], [0.42, -0.12, 0.22, 0.56], [-0.38, -0.02, -0.28, 0.6], [0.04, 0.42, -0.08, 0.5]];
  const parts = lobes.map(([x, y, z, r], i) => {
    const g = canopyGeometry(1, 0.3 + i * 0.02);
    g.scale(r, r, r);
    g.translate(x, y, z);
    return g;
  });
  let vc = 0, ic = 0;
  for (const g of parts) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), idx = [];
  let vo = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    for (const k of g.index.array) idx.push(k + vo);
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

function mergeVerts(g) {
  const pos = g.attributes.position;
  const map = new Map(), verts = [], idx = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!map.has(k)) { map.set(k, verts.length / 3); verts.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    idx.push(map.get(k));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(idx);
  return out;
}

/** mode 1: far LOD (d ≥ uCull.w); mode 2: mid LOD (uCull.y ≤ d < uCull.w); mode 3: near LOD (d < uCull.y). */
function foliageMaterial(mode, cull) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCull = cull;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying float vTH;\nuniform vec4 uCull;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTH = position.y;
        vec4 tw = instanceMatrix * vec4(transformed, 1.0);
        vTW = (modelMatrix * tw).xyz;
        float cd = distance(vec2(instanceMatrix[3].x, instanceMatrix[3].z), vec2(uCull.x, uCull.z));
        if (${mode === 1 ? 'cd < uCull.w' : mode === 2 ? '(cd >= uCull.w || cd < uCull.y)' : 'cd >= uCull.y'}) transformed *= 0.0;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTW;
        varying float vTH;
        float fh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float fnoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(fh(i), fh(i + vec3(1,0,0)), f.x), mix(fh(i + vec3(0,1,0)), fh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(fh(i + vec3(0,0,1)), fh(i + vec3(1,0,1)), f.x), mix(fh(i + vec3(0,1,1)), fh(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float clump = fnoise(vTW * 0.9) * 0.6 + fnoise(vTW * 2.7) * 0.4;
        diffuseColor.rgb *= 0.62 + 0.62 * clump;
        diffuseColor.rgb *= mix(0.55, 1.08, smoothstep(-0.8, 0.9, vTH));`);
  };
  m.customProgramCacheKey = () => 'foliage-v3-' + mode;
  return m;
}

export function buildTrees({ scene, data, collision }) {
  const R = rng(99);
  const pts = [];
  const trees = data.trees;
  for (let i = 0; i < trees.length; i += 2) {
    const x = trees[i], z = trees[i + 1];
    if (Math.abs(x) < 68 && Math.abs(z) < 68) continue; // the parvis under the tower is paved
    pts.push([x, z, 0]);
  }
  // fill woods & big parks with scattered trees (sparser far away)
  const budget = Math.round(18000 * quality.trees);
  let added = 0;
  for (const a of data.green) {
    if (a.cls !== 3 && a.cls !== 2) continue;
    const o = a.outer;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < o.length; i += 2) { minx = Math.min(minx, o[i]); maxx = Math.max(maxx, o[i]); minz = Math.min(minz, o[i + 1]); maxz = Math.max(maxz, o[i + 1]); }
    const area = (maxx - minx) * (maxz - minz);
    const r = Math.hypot((minx + maxx) / 2, (minz + maxz) / 2);
    if (r < 700 && a.cls === 2) continue;  // near parks: the mapped trees are enough
    const density = a.cls === 3 ? (r < 4000 ? 1 / 170 : 1 / 420) : 1 / 520;
    const n = Math.min(4000, Math.round(area * density));
    for (let k = 0; k < n && added < budget; k++) {
      const x = minx + R() * (maxx - minx), z = minz + R() * (maxz - minz);
      if (!inRing(o, x, z)) continue;
      if (a.holes.some((h) => inRing(h, x, z))) continue;
      pts.push([x, z, 1]);
      added++;
    }
  }
  // chunking
  const CH = 640;
  const chunks = new Map();
  for (const p of pts) {
    const key = `${Math.floor(p[0] / CH)},${Math.floor(p[1] / CH)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(p);
  }
  const canopyHi = canopyGeometry(1, 0.32);
  const canopyLo = canopyGeometry(0, 0.2);
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 1, 6, 1, true);
  trunkGeo.translate(0, 0.5, 0);
  const cull = { value: new THREE.Vector4(0, 160, 0, 600) };
  const leafNear = foliageMaterial(3, cull);
  const leafMid = foliageMaterial(2, cull);
  const leafFar = foliageMaterial(1, cull);
  const canopyNear = lobedCanopy();
  const bark = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 });
  const palette = ['#56703a', '#4d6a35', '#5f7a3f', '#48652f', '#6a8045', '#526b3a', '#5a7440'].map((c) => new THREE.Color(c));
  const col = new THREE.Color();
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const total = pts.length;
  const allMats = new THREE.InstancedBufferAttribute(new Float32Array(total * 16), 16);
  const allCols = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
  const groups = [];
  let gi = 0;
  for (const [key, list] of chunks) {
    const n = list.length;
    const mats = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16);
    const tmats = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16);
    const cols = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    let cx = 0, cz = 0;
    list.forEach((p, i) => {
      const [x, z, forest] = p;
      const base = terrainHeight(x, z);
      const rad = forest ? 4.2 + R() * 3.2 : 3.1 + R() * 2.6;
      const cy = base + (forest ? 9 + R() * 6 : 7 + R() * 4.5);
      e.set(0, R() * 6.28, 0); q.setFromEuler(e);
      M.compose(new THREE.Vector3(x, cy, z), q, new THREE.Vector3(rad, rad * (1.05 + R() * 0.35), rad));
      M.toArray(mats.array, i * 16);
      M.toArray(allMats.array, gi * 16);
      M.compose(new THREE.Vector3(x, base - 0.2, z), q, new THREE.Vector3(1 + R() * 0.3, cy - base - rad * 0.5, 1 + R() * 0.3));
      M.toArray(tmats.array, i * 16);
      col.copy(palette[Math.floor(R() * palette.length)]).multiplyScalar(0.85 + R() * 0.3);
      col.toArray(cols.array, i * 3);
      col.toArray(allCols.array, gi * 3);
      gi++;
      cx += x; cz += z;
      if (collision && Math.hypot(x, z) < 1300 && !forest) collision.addSeg(x, z, x, z, 0.35, -1, 6);
    });
    cx /= n; cz /= n;
    let rad2 = 0;
    for (const p of list) rad2 = Math.max(rad2, Math.hypot(p[0] - cx, p[1] - cz));
    const mk = (geo, m, attr, colors) => {
      const im = new THREE.InstancedMesh(geo, m, n);
      im.instanceMatrix = attr;
      if (colors) im.instanceColor = colors;
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = true;
      im.matrixAutoUpdate = false;
      scene.add(im);
      return im;
    };
    const hi = mk(canopyHi, leafMid, mats, cols);
    const nr = mk(canopyNear, leafNear, mats, cols);
    const tr = mk(trunkGeo, bark, tmats, null);
    groups.push({ key, cx, cz, r: rad2, hi, nr, tr });
  }
  // every tree in a single far-LOD draw call (instances near the camera collapse)
  const far = new THREE.InstancedMesh(canopyLo, leafFar, total);
  far.instanceMatrix = allMats;
  far.instanceColor = allCols;
  far.computeBoundingSphere();
  far.castShadow = false;
  far.receiveShadow = true;
  far.frustumCulled = false;
  scene.add(far);
  return {
    count: pts.length,
    update(camera) {
      const p = camera.position;
      const hiDist = 520 + Math.max(0, p.y) * 0.5;
      const nearDist = p.y > 60 ? 0 : 170;
      cull.value.set(p.x, nearDist, p.z, hiDist);
      for (const gp of groups) {
        const d = Math.hypot(gp.cx - p.x, gp.cz - p.z) - gp.r;
        gp.hi.visible = d < hiDist;
        gp.hi.castShadow = d < 700;
        gp.nr.visible = d < nearDist;
        gp.tr.visible = d < 420 && p.y < 150;
      }
    },
  };
}

function inRing(flat, x, z) {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], zi = flat[i * 2 + 1], xj = flat[j * 2], zj = flat[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
