// Landing of an inclined lift: the opening the cabin passes through a floor,
// guard rails on its three closed sides and short return rails beside the
// doorway, with matching collision.  Shared by the ground stations and the
// 1st / 2nd floors so the opening, the railings and the walls always agree.
import * as THREE from 'three';
import { CABIN } from './rails.js';

const RAIL_H = 1.1;

/**
 * Opening + railings of the landing at floor height y.
 * Returns { hole, poly, sill, gateU } in diagonal (u, v) / world xz coordinates.
 */
export function shaftLanding(rail, y) {
  const hole = rail.holeAt(y);
  const sill = rail.sillAt(y);
  // the lift's own landing gate stands 0.35 m in front of the door sill
  const gateU = sill - 0.35;
  const P = (u, v) => rail.toXZ(u, v);
  const poly = [P(hole.u0, -hole.v), P(hole.u1, -hole.v), P(hole.u1, hole.v), P(hole.u0, hole.v)];
  return { hole, poly, sill, gateU, P };
}

/** Guard rails (visual + collision) around a landing opening. */
export function buildShaftRailing({ rail, y, collision, material, group }) {
  const { hole, gateU, P } = shaftLanding(rail, y);
  const v = hole.v + 0.06;           // just outside the opening, on the deck
  const u0 = Math.min(hole.u0, gateU) - 0.04, u1 = hole.u1 + 0.06;
  // returns beside the doorway, in line with the lift's landing gate: they
  // start just outside the cabin's width (+ roof overhang), because the cabin
  // swings inwards over the landing as soon as it starts to climb
  const B = CABIN.across / 2 + 0.15;
  const runs = [
    [[u0, -v], [u1, -v]],            // side
    [[u1, -v], [u1, v]],             // far end
    [[u1, v], [u0, v]],              // side
    [[u0, -B], [u0, -v]],            // returns
    [[u0, B], [u0, v]],
  ];
  const geos = [];
  const box = (cx, cy, cz, sx, sy, sz, ry) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.rotateY(ry);
    g.translate(cx, cy, cz);
    geos.push(g);
  };
  for (const [a2, b2] of runs) {
    const a = P(a2[0], a2[1]), b = P(b2[0], b2[1]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ry = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    box(mx, y + RAIL_H - 0.03, mz, len + 0.06, 0.06, 0.06, ry);     // handrail
    box(mx, y + 0.12, mz, len, 0.1, 0.03, ry);                      // kick plate
    box(mx, y + 0.55, mz, len, 0.035, 0.035, ry);                   // mid rail
    const n = Math.max(1, Math.round(len / 1.3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box(a[0] + (b[0] - a[0]) * t, y + RAIL_H / 2, a[1] + (b[1] - a[1]) * t, 0.06, RAIL_H, 0.06, ry);
    }
    collision.addSeg(a[0], a[1], b[0], b[1], 0.08, y, y + RAIL_H + 0.1);
  }
  const g = mergeBoxes(geos);
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function mergeBoxes(geos) {
  let vc = 0, ic = 0;
  for (const g of geos) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count;
    io += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
