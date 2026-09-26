// Elevator paths.
//
// Ground → 2nd floor (East & West pillars, like the 1899 Fives-Lille lifts):
// the cabin runs on rails along the centre line of the curved leg, the incline
// changing from ≈54° at the base to ≈76-79° near the 2nd floor, while the cabin
// floor is kept level.  Path length ≈ 129 m (the real one is 128 m).
//
// 2nd floor → summit (Otis "duolift", 1983): two vertical cabins in the central
// shaft that counterbalance each other — when one climbs, the other descends.
import * as THREE from 'three';
import { L1, L2, L3, legCentre } from './profile.js';

export const STATION_Y = 0.45;   // cabin floor at the ground station (raised platform)
export const CABIN = { along: 4.0, across: 3.5, height: 2.9 };
export const RAIL_V = 2.15;      // the two rails run beside the cabin, clear of its 3.5 m width
export const SHAFT_V = RAIL_V + 0.4; // half-width of every opening the lift passes (rails, chassis, wheels)
const FLOOR_T = 0.22;            // cabin floor slab under the walking surface

export class InclineRail {
  constructor(sx, sz) {
    this.sx = sx; this.sz = sz;
    this.dirOut = new THREE.Vector3(sx, 0, sz).normalize();       // horizontal, away from the centre
    this.dirAcross = new THREE.Vector3(sx, 0, -sz).normalize();
    const pts = [];
    const ys = [];
    for (let y = -2; y < L2 - 0.1; y += 3) ys.push(y);
    ys.push(L1, L2, L2 + 3);
    ys.sort((a, b) => a - b);
    for (const y of ys) {
      const d = legCentre(Math.min(y, L2 + 3));
      pts.push(new THREE.Vector3(sx * d, y, sz * d));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    // lookup: height → arc-length parameter
    const N = 1200;
    this.lutY = new Float32Array(N + 1);
    this.lutU = new Float32Array(N + 1);
    const p = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      this.curve.getPointAt(u, p);
      this.lutY[i] = p.y; this.lutU[i] = u;
    }
    this.length = this.curve.getLength();
  }
  uAtHeight(y) {
    const Y = this.lutY;
    let lo = 0, hi = Y.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (Y[m] < y) lo = m; else hi = m;
    }
    const t = (y - Y[lo]) / Math.max(1e-6, Y[hi] - Y[lo]);
    return this.lutU[lo] + (this.lutU[hi] - this.lutU[lo]) * Math.min(1, Math.max(0, t));
  }
  pointAtHeight(y, out = new THREE.Vector3()) { return this.curve.getPointAt(this.uAtHeight(y), out); }
  tangentAtHeight(y, out = new THREE.Vector3()) { return this.curve.getTangentAt(this.uAtHeight(y), out); }
  /** Distance travelled along the rail between two heights. */
  distance(y0, y1) { return Math.abs(this.uAtHeight(y1) - this.uAtHeight(y0)) * this.length; }
  /** Horizontal distance of the rail from the tower axis along the diagonal. */
  radial(y) {
    const p = this.pointAtHeight(y);
    return Math.hypot(p.x, p.z);
  }
  /**
   * Plan-view rectangle (diagonal coordinates) to cut from a floor slab whose
   * top is at the landing height yS.  The rail climbs inwards, so:
   *  - door side (u0): the cabin only crosses the slab plane from below, and
   *    once its floor has risen FLOOR_T above the landing it clears the deck —
   *    the opening stops right at the door sill, leaving no gap to fall into;
   *  - far side (u1): everything the cabin sweeps while still under the slab;
   *  - sides (v): rails, chassis frames and wheels.
   */
  holeAt(yS, pad = 0.12) {
    const A = CABIN.along / 2 + 0.07; // roof overhang
    const u0 = this.radial(yS + FLOOR_T) - A - pad;
    let u1 = this.radial(yS) + A;
    for (let y = yS; y >= Math.max(STATION_Y, yS - CABIN.height - 2.6); y -= 0.2) u1 = Math.max(u1, this.radial(y) + A);
    return { u0, u1: u1 + pad, v: SHAFT_V };
  }
  /** Door sill line of a landing (diagonal u) and the doorway half-width. */
  sillAt(yS) { return this.radial(yS) - CABIN.along / 2; }
  /** Converts diagonal-frame (u along, v across) to world x/z. */
  toXZ(u, v) {
    return [this.dirOut.x * u + this.dirAcross.x * v, this.dirOut.z * u + this.dirAcross.z * v];
  }
}

export const TOP_LIFT = {
  x: [-1.55, 1.55],   // two cabins side by side in the shaft core
  z: 0,
  size: 2.5,
  height: 2.7,
  bottom: L2,
  top: L3,
};
