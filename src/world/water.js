// The Seine (sunken between limestone quays), ponds & fountains, and bridges.
import * as THREE from 'three';
import { canvas, toTexture, rng } from './textures.js';
import { RIVER_Y } from './geo.js';
import { NEAR_R } from './ground.js';

function waterNormalTexture() {
  // tileable ripple normals from summed sines + noise
  const S = 256, cv = canvas(S, S), g = cv.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const R = rng(5);
  const waves = [];
  for (let i = 0; i < 18; i++) {
    const kx = Math.round((R() - 0.5) * 16), kz = Math.round((R() - 0.5) * 16);
    waves.push([kx || 1, kz, R() * 6.28, 0.3 + R() * 0.7]);
  }
  const hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let h = 0;
      for (const [kx, kz, ph, a] of waves) h += a * Math.sin((kx * x + kz * y) / S * Math.PI * 2 + ph) / Math.hypot(kx, kz);
      hgt[y * S + x] = h;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
      const hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
      const n = new THREE.Vector3(-hx * 2.2, -hy * 2.2, 1).normalize();
      const i = (y * S + x) * 4;
      d[i] = (n.x * 0.5 + 0.5) * 255; d[i + 1] = (n.y * 0.5 + 0.5) * 255; d[i + 2] = (n.z * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(cv, { srgb: false });
}

function stoneTexture() {
  const W = 512, Hh = 256, cv = canvas(W, Hh), g = cv.getContext('2d');
  const R = rng(21);
  g.fillStyle = '#a79f8f'; g.fillRect(0, 0, W, Hh);
  const rows = 8, rh = Hh / rows;
  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * -30 - R() * 20;
    while (x < W) {
      const w = 40 + R() * 50, v = 150 + R() * 40;
      g.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
      g.fillRect(x + 1, r * rh + 1, w - 2, rh - 2);
      x += w;
    }
  }
  // damp dark band near the waterline
  const grd = g.createLinearGradient(0, Hh * 0.72, 0, Hh);
  grd.addColorStop(0, 'rgba(40,45,40,0)'); grd.addColorStop(1, 'rgba(40,45,40,0.55)');
  g.fillStyle = grd; g.fillRect(0, 0, W, Hh);
  return toTexture(cv);
}

export function buildWater({ scene, data, riverRings, collision }) {
  const normal = waterNormalTexture();
  normal.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({
    name: 'seine', color: 0x2f3f3d, roughness: 0.12, metalness: 0.0, normalMap: normal,
    normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.15,
  });
  // world-space UVs so the ripples have a constant scale
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = mat.userData.uTime = { value: 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vWUv;\nvarying vec2 vWUv2;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wpw = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWUv = wpw.xz / 38.0 + vec2(uTime * 0.012, uTime * 0.006);
        vWUv2 = wpw.xz / 11.0 + vec2(-uTime * 0.02, uTime * 0.017);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWUv;\nvarying vec2 vWUv2;')
      .replace('#include <normal_fragment_maps>', `
        vec3 wn1 = texture2D(normalMap, vWUv).xyz * 2.0 - 1.0;
        vec3 wn2 = texture2D(normalMap, vWUv2).xyz * 2.0 - 1.0;
        vec3 wn = normalize(vec3((wn1.xy + wn2.xy * 0.6) * normalScale, 1.0));
        normal = normalize(tbnWorldToView(wn));`);
    // helper: tangent frame of a horizontal surface in view space
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `
      vec3 tbnWorldToView(vec3 t) {
        vec3 wn = vec3(t.x, t.z, t.y);
        return normalize((viewMatrix * vec4(wn, 0.0)).xyz);
      }
      void main() {`);
  };
  mat.customProgramCacheKey = () => 'seine-v2';

  // river surface
  const shapes = riverRings.map((c) => new THREE.Shape(c.map(([x, z]) => new THREE.Vector2(x, z))));
  if (shapes.length) {
    const g = new THREE.ShapeGeometry(shapes, 1);
    g.rotateX(Math.PI / 2); flip(g);
    g.translate(0, RIVER_Y, 0);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.name = 'seine';
    scene.add(m);
  }
  // quay walls along the river edges
  const stone = stoneTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9, color: 0xe8e0d0 });
  {
    const pos = [], uv = [], idx = [];
    let v = 0;
    for (const ring of riverRings) {
      const n = ring.length;
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.01) continue;
        // skip the artificial edges produced by clipping at the ground rim
        if (Math.hypot(a[0], a[1]) > NEAR_R - 40 && Math.hypot(b[0], b[1]) > NEAR_R - 40) continue;
        const y0 = RIVER_Y - 0.6, y1 = 0.35;
        pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
        uv.push(acc / 12, 0, (acc + len) / 12, 0, (acc + len) / 12, 1, acc / 12, 1);
        acc += len;
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        v += 4;
        // the river is a hole in the walkable ground
      }
      if (ring.some(([x, z]) => Math.hypot(x, z) < 2500)) collision.addRingHole(ring.flat(), -1, 0.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const walls = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9, side: THREE.DoubleSide }));
    walls.receiveShadow = true;
    walls.castShadow = false;
    scene.add(walls);
    void wallMat;
  }
  // ponds, fountains, far river stretches (at ground level)
  {
    const shapes2 = [];
    for (const a of data.water) {
      if (a.cls === 1) {
        // far part of the Seine beyond the carved zone
        let far = false;
        for (let i = 0; i < a.outer.length; i += 2) if (Math.hypot(a.outer[i], a.outer[i + 1]) > NEAR_R - 30) { far = true; break; }
        if (!far) continue;
      }
      const s = new THREE.Shape();
      const o = a.outer;
      s.moveTo(o[0], o[1]);
      for (let i = 2; i < o.length; i += 2) s.lineTo(o[i], o[i + 1]);
      for (const h of a.holes) {
        const p = new THREE.Path();
        p.moveTo(h[0], h[1]);
        for (let i = 2; i < h.length; i += 2) p.lineTo(h[i], h[i + 1]);
        s.holes.push(p);
      }
      shapes2.push(s);
    }
    if (shapes2.length) {
      const g = new THREE.ShapeGeometry(shapes2, 1);
      g.rotateX(Math.PI / 2); flip(g);
      g.translate(0, 0.06, 0);
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      scene.add(m);
    }
  }
  // bridges: deck slabs + piers
  {
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x8c8375, roughness: 0.85 });
    const pierMat = new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9 });
    const decks = [], piers = [];
    for (const b of data.bridges) {
      const o = b.outer;
      let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
      for (let i = 0; i < o.length; i += 2) { minx = Math.min(minx, o[i]); maxx = Math.max(maxx, o[i]); minz = Math.min(minz, o[i + 1]); maxz = Math.max(maxz, o[i + 1]); }
      const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
      if (Math.hypot(cx, cz) > NEAR_R - 100) continue;
      const s = new THREE.Shape();
      s.moveTo(o[0], o[1]);
      for (let i = 2; i < o.length; i += 2) s.lineTo(o[i], o[i + 1]);
      const g = new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      g.translate(0, 0.28, 0);
      decks.push(g);
      // principal axis → piers every ~32 m along it
      let sxx = 0, szz = 0, sxz = 0, n = 0;
      for (let i = 0; i < o.length; i += 2) { const dx = o[i] - cx, dz = o[i + 1] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; n++; }
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
      const ax = Math.cos(ang), az = Math.sin(ang);
      let lo = Infinity, hi = -Infinity, wlo = Infinity, whi = -Infinity;
      for (let i = 0; i < o.length; i += 2) {
        const t = (o[i] - cx) * ax + (o[i + 1] - cz) * az;
        const w = -(o[i] - cx) * az + (o[i + 1] - cz) * ax;
        lo = Math.min(lo, t); hi = Math.max(hi, t); wlo = Math.min(wlo, w); whi = Math.max(whi, w);
      }
      const len = hi - lo, wid = whi - wlo;
      if (len > 60) {
        const k = Math.max(1, Math.round(len / 34) - 1);
        for (let i = 1; i <= k; i++) {
          const t = lo + (len * i) / (k + 1);
          const px = cx + ax * t, pz = cz + az * t;
          const pg = new THREE.BoxGeometry(4.2, 7.4, wid * 0.94);
          pg.rotateY(-ang);
          pg.translate(px, RIVER_Y + 3.4 - 1.2, pz);
          piers.push(pg);
        }
      }
      if (Math.hypot(cx, cz) < 2500) collision.addPolyFloor(o, 0.28, 'bridge');
    }
    const merge = (list, mat2) => {
      if (!list.length) return;
      const m = new THREE.Mesh(mergeAll(list), mat2);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    };
    merge(decks, deckMat);
    merge(piers, pierMat);
  }
  return {
    update(dt) { if (mat.userData.uTime) mat.userData.uTime.value += dt; },
  };
}

function flip(geo) {
  const idx = geo.index;
  for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
}

export function mergeAll(list) {
  let vc = 0, ic = 0;
  const norm = list.map((g) => {
    const gg = g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]);
    if (!gg.attributes.normal) gg.computeVertexNormals();
    vc += gg.attributes.position.count; ic += gg.index.count;
    return gg;
  });
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of norm) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const a = g.index.array;
    for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
    vo += g.attributes.position.count; io += a.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
