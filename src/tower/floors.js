// The 1st and 2nd floors: deck slabs (with the lift shafts cut out), the
// frieze bearing the 72 names of French scientists, the second-floor cornice,
// the glass floor around the first-floor void, protective fences, glass
// pavilions — and the matching collision geometry.
import * as THREE from 'three';
import { H, C, L1, L2, L1_HALF, L2_HALF, L1_VOID, L2_CORE } from './profile.js';
import { FACES, G1, G2, archBandGeometries } from './structure.js';
import { paintAt } from './materials.js';
import { canvas, toTexture, deckTexture, fenceMeshTexture, FENCES } from '../world/textures.js';
import { latticeTextures } from './lattice.js';
import { shaftLanding, buildShaftRailing } from './shaft.js';
import { TOP_LIFT } from './rails.js';

// 18 names per façade (engraved in gold letters, 1889 / restored 1986-87)
const NAMES = {
  nw: ['SEGUIN', 'LALANDE', 'TRESCA', 'PONCELET', 'BRESSE', 'LAGRANGE', 'BÉLANGER', 'CUVIER', 'LAPLACE',
    'DULONG', 'CHASLES', 'LAVOISIER', 'AMPÈRE', 'CHEVREUL', 'FLACHAT', 'NAVIER', 'LEGENDRE', 'CHAPTAL'],
  se: ['JAMIN', 'GAY-LUSSAC', 'FIZEAU', 'SCHNEIDER', 'LE CHATELIER', 'BERTHIER', 'BARRAL', 'DE DION', 'GOÜIN',
    'JOUSSELIN', 'BROCA', 'BECQUEREL', 'CORIOLIS', 'CAIL', 'TRIGER', 'GIFFARD', 'PERRIER', 'STURM'],
  ne: ['CAUCHY', 'BELGRAND', 'REGNAULT', 'FRESNEL', 'DE PRONY', 'VICAT', 'EBELMEN', 'COULOMB', 'POINSOT',
    'FOUCAULT', 'DELAUNAY', 'MORIN', 'HAÜY', 'COMBES', 'THÉNARD', 'ARAGO', 'POISSON', 'MONGE'],
  sw: ['PETIET', 'DAGUERRE', 'WURTZ', 'LE VERRIER', 'PERDONNET', 'DELAMBRE', 'MALUS', 'BREGUET', 'POLONCEAU',
    'DUMAS', 'CLAPEYRON', 'BORDA', 'FOURIER', 'BICHAT', 'SAUVAGE', 'PELOUZE', 'CARNOT', 'LAMÉ'],
};
// tower frame: +z faces the Champ de Mars (SE), -z the Trocadéro (NW), +x NE, -x SW
const FACE_NAMES = { '+z': NAMES.se, '-z': NAMES.nw, '+x': NAMES.ne, '-x': NAMES.sw };

const toHex = (c) => '#' + c.getHexString(); // getHexString() already encodes to sRGB

function friezeTexture(names, y0, y1, withNames = true) {
  const W = 2048, Hh = 256;
  const cv = canvas(W, Hh), g = cv.getContext('2d');
  const base = paintAt(new THREE.Color(), (y0 + y1) / 2, 1, 0);
  const col = (k) => toHex(base.clone().multiplyScalar(k));
  // background
  g.fillStyle = col(1.0);
  g.fillRect(0, 0, W, Hh);
  // top cornice
  g.fillStyle = col(1.35); g.fillRect(0, 0, W, 10);
  g.fillStyle = col(0.7); g.fillRect(0, 10, W, 6);
  g.fillStyle = col(1.15); g.fillRect(0, 16, W, 12);
  // dentils
  for (let x = 0; x < W; x += 16) { g.fillStyle = col(1.25); g.fillRect(x + 2, 30, 10, 14); g.fillStyle = col(0.72); g.fillRect(x + 12, 30, 4, 14); }
  // name band
  const nb0 = 50, nb1 = 118;
  g.fillStyle = col(0.9); g.fillRect(0, nb0, W, nb1 - nb0);
  g.fillStyle = col(1.3); g.fillRect(0, nb0, W, 3); g.fillRect(0, nb1 - 3, W, 3);
  if (withNames) {
    const n = names.length, cell = W / n;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 38px "Didot","Bodoni 72","Playfair Display","Times New Roman",serif';
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * cell;
      // rosette separators
      g.fillStyle = '#c9a45a';
      g.beginPath(); g.arc(i * cell, (nb0 + nb1) / 2, 5, 0, Math.PI * 2); g.fill();
      // engraved shadow + gilded letters
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillText(names[i], cx + 1.5, (nb0 + nb1) / 2 + 2, cell - 16);
      const grad = g.createLinearGradient(0, nb0 + 10, 0, nb1 - 10);
      grad.addColorStop(0, '#f3dc97'); grad.addColorStop(0.5, '#d6ae5a'); grad.addColorStop(1, '#9c7632');
      g.fillStyle = grad;
      g.fillText(names[i], cx, (nb0 + nb1) / 2, cell - 16);
    }
  }
  // lower molding
  g.fillStyle = col(1.25); g.fillRect(0, nb1 + 4, W, 8);
  g.fillStyle = col(0.75); g.fillRect(0, nb1 + 12, W, 5);
  // consoles
  const cw = W / 40;
  for (let i = 0; i < 40; i++) {
    const x = i * cw;
    g.fillStyle = col(0.62); g.fillRect(x, nb1 + 17, cw, Hh - nb1 - 17);
    const gr = g.createLinearGradient(x + cw * 0.3, 0, x + cw * 0.7, 0);
    gr.addColorStop(0, col(1.35)); gr.addColorStop(1, col(0.85));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x + cw * 0.28, nb1 + 17);
    g.lineTo(x + cw * 0.72, nb1 + 17);
    g.quadraticCurveTo(x + cw * 0.66, Hh - 50, x + cw * 0.56, Hh - 8);
    g.lineTo(x + cw * 0.44, Hh - 8);
    g.quadraticCurveTo(x + cw * 0.34, Hh - 50, x + cw * 0.28, nb1 + 17);
    g.fill();
    g.fillStyle = col(1.4);
    g.beginPath(); g.arc(x + cw * 0.5, Hh - 14, cw * 0.1, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = col(0.55); g.fillRect(0, Hh - 6, W, 6);
  return toTexture(cv, { repeat: false });
}

/** Rotated rectangle (diagonal frame) → xz polygon. */
function holePoly(rail, h) {
  return [rail.toXZ(h.u0, -h.v), rail.toXZ(h.u1, -h.v), rail.toXZ(h.u1, h.v), rail.toXZ(h.u0, h.v)];
}

function ringShape(outer, inner, holes) {
  const s = new THREE.Shape();
  s.moveTo(-outer, -outer); s.lineTo(outer, -outer); s.lineTo(outer, outer); s.lineTo(-outer, outer); s.closePath();
  const hi = new THREE.Path();
  const ix = typeof inner === 'number' ? inner : inner.x, iz = typeof inner === 'number' ? inner : inner.z;
  hi.moveTo(-ix, -iz); hi.lineTo(-ix, iz); hi.lineTo(ix, iz); hi.lineTo(ix, -iz); hi.closePath();
  s.holes.push(hi);
  for (const poly of holes) {
    const p = new THREE.Path();
    p.moveTo(poly[0][0], poly[0][1]);
    for (let i = poly.length - 1; i >= 1; i--) p.lineTo(poly[i][0], poly[i][1]);
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

function slab(shape, yTop, thick, topMat, bodyMat, uvScale = 1) {
  const g = new THREE.Group();
  const body = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  body.rotateX(Math.PI / 2);
  body.translate(0, yTop - 0.02, 0);
  const mb = new THREE.Mesh(body, bodyMat);
  mb.castShadow = mb.receiveShadow = true;
  const top = new THREE.ShapeGeometry(shape, 1);
  top.rotateX(Math.PI / 2);
  // ShapeGeometry faces +z → after rotation they face -y: flip to face up
  top.scale(1, -1, 1);
  top.translate(0, yTop, 0);
  const uv = top.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  flipWinding(top);
  const mt = new THREE.Mesh(top, topMat);
  mt.receiveShadow = true;
  g.add(mb, mt);
  return g;
}

function flipWinding(geo) {
  const idx = geo.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  }
  const n = geo.attributes.normal;
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
}

/** A straight fence: posts + panel (glass or mesh) + rails, returns meshes to merge. */
class Batch {
  constructor() { this.boxes = []; }
  box(cx, cy, cz, sx, sy, sz, ry = 0) { this.boxes.push([cx, cy, cz, sx, sy, sz, ry]); }
  build(mat, { cast = true } = {}) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.InstancedMesh(geo, mat, this.boxes.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.boxes.forEach((b, i) => {
      e.set(0, b[6], 0); q.setFromEuler(e);
      M.compose(new THREE.Vector3(b[0], b[1], b[2]), q, new THREE.Vector3(b[3], b[4], b[5]));
      m.setMatrixAt(i, M);
    });
    m.castShadow = cast; m.receiveShadow = true;
    m.computeBoundingSphere();
    return m;
  }
}

function planeStrip(points2d, y0, y1, uPerM, vRepeat) {
  // vertical strip through consecutive xz points
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < points2d.length; i++) {
    const [x, z] = points2d[i];
    if (i > 0) acc += Math.hypot(x - points2d[i - 1][0], z - points2d[i - 1][1]);
    pos.push(x, y0, z, x, y1, z);
    uv.push(acc * uPerM, 0, acc * uPerM, vRepeat);
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildFloors({ group, collision, rails, materials }) {
  const paint = materials;
  const deckTex = deckTexture();
  const deckMat = new THREE.MeshStandardMaterial({ name: 'deck', map: deckTex, roughness: 0.82, metalness: 0 });
  const steelMat = new THREE.MeshStandardMaterial({ name: 'deck-steel', color: paintAt(new THREE.Color(), 80, 0.9), roughness: 0.62, metalness: 0.06 });
  const steelMat2 = new THREE.MeshStandardMaterial({ name: 'deck-steel2', color: paintAt(new THREE.Color(), 116, 0.95), roughness: 0.62, metalness: 0.06 });
  const glassMat = new THREE.MeshStandardMaterial({
    name: 'glass', color: 0x8fa3a6, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.12,
    depthWrite: false, envMapIntensity: 0.7, side: THREE.DoubleSide,
  });
  const floorGlassMat = new THREE.MeshStandardMaterial({
    name: 'glass-floor', color: 0xb5d0cc, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.16,
    depthWrite: false, envMapIntensity: 1.2,
  });
  const fenceTex = fenceMeshTexture();
  const fenceMat = new THREE.MeshStandardMaterial({
    name: 'fence-mesh', map: fenceTex, color: paintAt(new THREE.Color(), 116, 1.15), roughness: 0.55, metalness: 0.2,
    transparent: true, depthWrite: false, alphaTest: 0.01, side: THREE.DoubleSide,
  });
  FENCES.add(fenceMat);
  const out = { holes: {}, landings: {} };

  // ---------------------------------------------------------------- arch bands & fringes
  {
    const { bands, fringes } = archBandGeometries();
    const mk = (list) => {
      const g = new THREE.BufferGeometry();
      const pos = [], uv = [], idx = [];
      let base = 0;
      for (const b of list) {
        pos.push(...b.pos); uv.push(...b.uv);
        idx.push(...b.idx.map((i) => i + base));
        base += b.pos.length / 3;
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const bandMat = new THREE.MeshStandardMaterial({
      name: 'arch-band', map: latticeTextures.archBand(), color: paintAt(new THREE.Color(), 30, 1.05),
      roughness: 0.6, metalness: 0.06, alphaTest: 0.5, side: THREE.DoubleSide,
    });
    const fringeMat = new THREE.MeshStandardMaterial({
      name: 'arch-fringe', map: latticeTextures.fringe(), color: paintAt(new THREE.Color(), 30, 1.1),
      roughness: 0.6, metalness: 0.06, alphaTest: 0.5, side: THREE.DoubleSide,
    });
    const band = new THREE.Mesh(mk(bands), bandMat);
    const fringe = new THREE.Mesh(mk(fringes), fringeMat);
    band.castShadow = fringe.castShadow = true;
    band.receiveShadow = true;
    group.add(band, fringe);
  }

  // ---------------------------------------------------------------- 1st floor
  {
    const holes = [];
    for (const [name, rail] of Object.entries(rails)) {
      const h = rail.holeAt(L1);
      out.holes[name + '1'] = { rail, h, y: L1 };
      holes.push(holePoly(rail, h));
    }
    const glassW = 2.3;
    const shape = ringShape(L1_HALF, L1_VOID + glassW, holes);
    const deck = slab(shape, L1, 1.1, deckMat, steelMat, 0.9);
    group.add(deck);
    // glass floor ring around the void, on a steel grid
    const gShape = ringShape(L1_VOID + glassW, L1_VOID, []);
    const gTop = new THREE.ShapeGeometry(gShape);
    gTop.rotateX(-Math.PI / 2);
    gTop.translate(0, L1 - 0.03, 0);
    const gm = new THREE.Mesh(gTop, floorGlassMat);
    gm.renderOrder = 2;
    group.add(gm);
    const grid = new Batch();
    for (const f of FACES) {
      for (let t = -L1_VOID - glassW; t <= L1_VOID + glassW + 0.01; t += 1.25) {
        const r = L1_VOID + glassW / 2;
        if (f.ax === 'z') grid.box(t, L1 - 0.18, f.s * r, 0.08, 0.3, glassW, 0);
        else grid.box(f.s * r, L1 - 0.18, t, glassW, 0.3, 0.08, 0);
      }
      const r0 = L1_VOID + 0.02, r1 = L1_VOID + glassW;
      for (const r of [r0, r1]) {
        if (f.ax === 'z') grid.box(0, L1 - 0.2, f.s * r, 2 * r, 0.34, 0.14);
        else grid.box(f.s * r, L1 - 0.2, 0, 0.14, 0.34, 2 * r);
      }
    }
    // void balustrade: glass + handrail + posts
    const bal = new Batch(), balGlass = [];
    for (const f of FACES) {
      const r = L1_VOID - 0.05;
      const a = f.ax === 'z' ? [-r, f.s * r] : [f.s * r, -r];
      const b = f.ax === 'z' ? [r, f.s * r] : [f.s * r, r];
      balGlass.push(planeStrip([a, b], L1, L1 + 1.1, 1, 1));
      if (f.ax === 'z') bal.box(0, L1 + 1.12, f.s * r, 2 * r, 0.07, 0.09);
      else bal.box(f.s * r, L1 + 1.12, 0, 0.09, 0.07, 2 * r);
      for (let t = -r; t <= r + 0.01; t += 1.6) {
        if (f.ax === 'z') bal.box(t, L1 + 0.56, f.s * r, 0.06, 1.12, 0.06);
        else bal.box(f.s * r, L1 + 0.56, t, 0.06, 1.12, 0.06);
      }
      collision.addSeg(a[0], a[1], b[0], b[1], 0.12, L1, L1 + 1.2);
    }
    for (const g of balGlass) { const m = new THREE.Mesh(g, glassMat); m.renderOrder = 3; group.add(m); }
    group.add(grid.build(steelMat), bal.build(steelMat2));

    // outer promenade: the perimeter gallery — slender posts carrying a canopy
    // beam 5.4 m up, glass screens below (the band that gives the 1st floor its
    // weight when seen from the Champ de Mars)
    const scr = new Batch(), glassStrips = [];
    const R = L1_HALF - 0.25;
    const GH = 5.4;
    for (const f of FACES) {
      const a = f.ax === 'z' ? [-R, f.s * R] : [f.s * R, -R];
      const b = f.ax === 'z' ? [R, f.s * R] : [f.s * R, R];
      glassStrips.push(planeStrip([a, b], L1 + 0.1, L1 + 2.7, 1, 1));
      for (let t = -R; t <= R + 0.01; t += 70.69 / 30) {
        if (f.ax === 'z') scr.box(t, L1 + GH / 2, f.s * R, 0.16, GH, 0.2);
        else scr.box(f.s * R, L1 + GH / 2, t, 0.2, GH, 0.16);
      }
      if (f.ax === 'z') {
        scr.box(0, L1 + GH, f.s * R, 2 * R + 0.4, 0.55, 0.5);
        scr.box(0, L1 + GH - 0.6, f.s * (R - 1.1), 2 * R - 1.6, 0.25, 2.2);
        scr.box(0, L1 + 2.75, f.s * R, 2 * R, 0.14, 0.3);
        scr.box(0, L1 + 1.05, f.s * R, 2 * R, 0.06, 0.1);
      } else {
        scr.box(f.s * R, L1 + GH, 0, 0.5, 0.55, 2 * R + 0.4);
        scr.box(f.s * (R - 1.1), L1 + GH - 0.6, 0, 2.2, 0.25, 2 * R - 1.6);
        scr.box(f.s * R, L1 + 2.75, 0, 0.3, 0.14, 2 * R);
        scr.box(f.s * R, L1 + 1.05, 0, 0.1, 0.06, 2 * R);
      }
      collision.addSeg(a[0], a[1], b[0], b[1], 0.2, L1, L1 + 3);
    }
    for (const g of glassStrips) { const m = new THREE.Mesh(g, glassMat); m.renderOrder = 3; group.add(m); }
    group.add(scr.build(steelMat2));

    // frieze with the 72 names, one textured band per façade
    for (const f of FACES) {
      const key = (f.s > 0 ? '+' : '-') + f.ax;
      const tex = friezeTexture(FACE_NAMES[key], G1.frieze0, G1.frieze1);
      const mat = new THREE.MeshStandardMaterial({ name: 'frieze', map: tex, roughness: 0.58, metalness: 0.08 });
      const w = 2 * L1_HALF + 0.6, hgt = G1.frieze1 - G1.frieze0 - 0.02, d = 0.9;
      const geo = new THREE.BoxGeometry(w, hgt, d);
      const m = new THREE.Mesh(geo, [steelMat, steelMat, steelMat, steelMat, mat, steelMat]);
      m.position.set(0, (G1.frieze0 + G1.frieze1) / 2 - 0.01, 0);
      if (f.ax === 'z') { m.position.z = f.s * (L1_HALF - d / 2 + 0.3); if (f.s < 0) m.rotation.y = Math.PI; }
      else { m.position.x = f.s * (L1_HALF - d / 2 + 0.3); m.rotation.y = f.s > 0 ? Math.PI / 2 : -Math.PI / 2; }
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }

    // glass pavilions on three sides (the SE side stays an open terrace)
    const pav = new THREE.Group();
    const inner = new THREE.MeshStandardMaterial({ color: 0x3b3129, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 0.7, metalness: 0.1 });
    const mull = new Batch();
    for (const f of FACES) {
      if (f.ax === 'z' && f.s > 0) continue;
      const hw = 8.4, r0 = L1_VOID + glassW + 3.2, r1 = L1_HALF - 3.6, h = 6.0;
      const along = 2 * hw, depth = r1 - r0, mid = (r0 + r1) / 2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(along - 0.4, h - 0.3, depth - 0.4), inner);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(along, h, depth), glassMat);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(along + 0.8, 0.45, depth + 0.8), roofMat);
      for (const m of [box, shell]) m.position.y = L1 + h / 2;
      roof.position.y = L1 + h + 0.2;
      const g = new THREE.Group();
      g.add(box, shell, roof);
      shell.renderOrder = 3;
      if (f.ax === 'z') g.position.z = f.s * mid; else { g.position.x = f.s * mid; g.rotation.y = Math.PI / 2; }
      box.castShadow = roof.castShadow = true;
      pav.add(g);
      // mullions on the long sides
      for (let t = -hw; t <= hw + 0.01; t += 1.6) {
        for (const rr of [r0, r1]) {
          if (f.ax === 'z') mull.box(t, L1 + h / 2, f.s * rr, 0.1, h, 0.14);
          else mull.box(f.s * rr, L1 + h / 2, t, 0.14, h, 0.1);
        }
      }
      if (f.ax === 'z') collision.addBox(-hw, hw, f.s * r0, f.s * r1, L1, L1 + h);
      else collision.addBox(f.s * r0, f.s * r1, -hw, hw, L1, L1 + h);
    }
    pav.add(mull.build(roofMat));
    group.add(pav);

    // walkable surface (the void & shafts are holes)
    collision.addRect(-L1_HALF, L1_HALF, L1_VOID, L1_HALF, L1, 'L1');
    collision.addRect(-L1_HALF, L1_HALF, -L1_HALF, -L1_VOID, L1, 'L1');
    collision.addRect(L1_VOID, L1_HALF, -L1_VOID, L1_VOID, L1, 'L1');
    collision.addRect(-L1_HALF, -L1_VOID, -L1_VOID, L1_VOID, L1, 'L1');
    for (const k of Object.keys(out.holes)) if (k.endsWith('1')) registerShaft({ collision, group, material: steelMat2 }, out.holes[k], L1);
  }

  // ---------------------------------------------------------------- 2nd floor
  {
    const holes = [];
    for (const [name, rail] of Object.entries(rails)) {
      const h = rail.holeAt(L2);
      out.holes[name + '2'] = { rail, h, y: L2 };
      holes.push(holePoly(rail, h));
    }
    // the summit lifts' shaft opens into a shallow pit: the cabin floors never
    // sit flush with (and flicker against) the deck
    const pitX = TOP_LIFT.x[1] + TOP_LIFT.size / 2 + 0.1, pitZ = TOP_LIFT.size / 2 + 0.12;
    const shape = ringShape(L2_HALF, { x: pitX, z: pitZ }, holes);
    group.add(slab(shape, L2, 0.9, deckMat, steelMat2, 0.9));
    const pitFloor = new THREE.Mesh(new THREE.BoxGeometry(2 * pitX, 0.1, 2 * pitZ), steelMat2);
    pitFloor.position.set(0, L2 - 0.35, 0);
    pitFloor.receiveShadow = true;
    group.add(pitFloor);

    // flared cornice with consoles, one band per face
    const tex = friezeTexture([], G2.yt, L2, false);
    const cm = new THREE.MeshStandardMaterial({ name: 'frieze-cornice', map: tex, roughness: 0.6, metalness: 0.08, side: THREE.DoubleSide });
    for (const f of FACES) {
      const y0 = G2.yt, y1 = L2 - 0.05;
      const r0 = H(y0) + 0.8, r1 = L2_HALF + 0.1;
      const pos = [], uv = [];
      const corners = [[-r0, y0, r0], [r0, y0, r0], [r1, y1, r1], [-r1, y1, r1]];
      for (const [u, y, r] of corners) {
        pos.push(...(f.ax === 'z' ? [u, y, f.s * r] : [f.s * r, y, u]));
      }
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(f.s > 0 === (f.ax === 'z') ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, cm);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }

    // hanging lace panel between the legs (fine diamond lattice)
    const lace = latticeTextures.diamond();
    const laceMat = new THREE.MeshStandardMaterial({
      name: 'tower-lace', map: lace, color: paintAt(new THREE.Color(), 96, 1.1), roughness: 0.62, metalness: 0.06,
      alphaTest: 0.5, side: THREE.DoubleSide,
    });
    lace.repeat.set(1, 1);
    for (const f of FACES) {
      const yb = G2.box0, yt = G2.strip1;
      const cb = C(yb), ct = C(yt) + 0.8;
      const off = 0.4;
      const P = (u, y) => (f.ax === 'z' ? [u, y, f.s * (H(y) + off)] : [f.s * (H(y) + off), y, u]);
      const pos = [...P(-cb, yb), ...P(cb, yb), ...P(ct, yt), ...P(-ct, yt)];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const rep = (2 * cb) / 1.6;
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, rep, 0, rep, (yt - yb) / 1.6, 0, (yt - yb) / 1.6], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, laceMat);
      m.castShadow = true;
      group.add(m);
    }

    // protective mesh fence (3 m, bent inwards at the top)
    const fenceGeo = [];
    const posts = new Batch();
    const R = L2_HALF - 0.3;
    for (const f of FACES) {
      const a = f.ax === 'z' ? [-R, f.s * R] : [f.s * R, -R];
      const b = f.ax === 'z' ? [R, f.s * R] : [f.s * R, R];
      fenceGeo.push(planeStrip([a, b], L2 + 0.05, L2 + 2.5, 1 / 0.6, 2.45 / 0.6));
      for (let t = -R; t <= R + 0.01; t += 2.05) {
        if (f.ax === 'z') { posts.box(t, L2 + 1.3, f.s * R, 0.1, 2.6, 0.1); posts.box(t, L2 + 2.85, f.s * (R - 0.35), 0.08, 0.9, 0.08); }
        else { posts.box(f.s * R, L2 + 1.3, t, 0.1, 2.6, 0.1); posts.box(f.s * (R - 0.35), L2 + 2.85, t, 0.08, 0.9, 0.08); }
      }
      if (f.ax === 'z') { posts.box(0, L2 + 1.05, f.s * R, 2 * R, 0.07, 0.12); posts.box(0, L2 + 2.55, f.s * R, 2 * R, 0.08, 0.1); }
      else { posts.box(f.s * R, L2 + 1.05, 0, 0.12, 0.07, 2 * R); posts.box(f.s * R, L2 + 2.55, 0, 0.1, 0.08, 2 * R); }
      collision.addSeg(a[0], a[1], b[0], b[1], 0.2, L2, L2 + 3);
    }
    for (const g of fenceGeo) group.add(new THREE.Mesh(g, fenceMat));
    group.add(posts.build(steelMat2));

    // central building: boarding hall of the summit lifts
    const core = new THREE.Group();
    const hall = new THREE.MeshStandardMaterial({ color: 0x3e342c, roughness: 0.8 });
    const hGlass = glassMat;
    const hh = 3.9, cw = L2_CORE;
    const walls = new Batch();
    for (const f of FACES) {
      // two wall pieces leaving a 3 m doorway in the middle of each side
      for (const s of [-1, 1]) {
        const u0 = s * 1.5, u1 = s * cw;
        const cu = (u0 + u1) / 2, lu = Math.abs(u1 - u0);
        if (f.ax === 'z') walls.box(cu, L2 + hh / 2, f.s * cw, lu, hh, 0.25);
        else walls.box(f.s * cw, L2 + hh / 2, cu, 0.25, hh, lu);
        if (f.ax === 'z') collision.addBox(Math.min(u0, u1), Math.max(u0, u1), f.s * cw - 0.15, f.s * cw + 0.15, L2, L2 + hh);
        else collision.addBox(f.s * cw - 0.15, f.s * cw + 0.15, Math.min(u0, u1), Math.max(u0, u1), L2, L2 + hh);
      }
      if (f.ax === 'z') walls.box(0, L2 + hh - 0.4, f.s * cw, 3, 0.8, 0.25);
      else walls.box(f.s * cw, L2 + hh - 0.4, 0, 0.25, 0.8, 3);
    }
    const wm = walls.build(hall);
    core.add(wm);
    // the roof is open over the lift shaft
    const roofGeo = new THREE.ExtrudeGeometry(ringShape(cw + 0.4, 3.0, []), { depth: 0.35, bevelEnabled: false });
    roofGeo.rotateX(Math.PI / 2); roofGeo.translate(0, L2 + hh + 0.35, 0);
    const roofM = new THREE.Mesh(roofGeo, steelMat2);
    roofM.castShadow = true;
    core.add(roofM);
    // glazing band above the doors
    const band = new Batch();
    for (const f of FACES) {
      if (f.ax === 'z') band.box(0, L2 + hh - 1.1, f.s * (cw + 0.14), 2 * cw, 0.5, 0.05);
      else band.box(f.s * (cw + 0.14), L2 + hh - 1.1, 0, 0.05, 0.5, 2 * cw);
    }
    const bm = band.build(new THREE.MeshStandardMaterial({ color: 0xe9d7a8, emissive: 0x6b5a33, emissiveIntensity: 0.4, roughness: 0.4 }), { cast: false });
    core.add(bm);
    group.add(core);
    void hGlass;

    // walkable 2nd floor ring (the lift core interior is walkable too)
    collision.addRect(-L2_HALF, L2_HALF, -L2_HALF, L2_HALF, L2, 'L2');
    for (const k of Object.keys(out.holes)) if (k.endsWith('2')) registerShaft({ collision, group, material: steelMat2 }, out.holes[k], L2);
  }
  return out;
}

/** Guard rails around a lift shaft opening (the doorway is gated by the lift itself) + the floor hole. */
function registerShaft({ collision, group, material }, { rail }, y) {
  const { poly } = shaftLanding(rail, y);
  buildShaftRailing({ rail, y, collision, material, group });
  collision.addPolyHole(poly, y - 1, y + 0.5);
}
