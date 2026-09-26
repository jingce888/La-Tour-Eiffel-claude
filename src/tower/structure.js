// Primary iron structure: the four curved lattice legs, the upper shaft, the
// four decorative arches (Sauvestre's arcs), the first/second floor girders and
// friezes.  Everything is emitted as members into MemberSets; the caller turns
// them into a handful of instanced draw calls.
import {
  H, C, L1, L2, L3, L1_HALF, L2_HALF, MERGE_Y,
  chordSize, braceSize, panelLevels, legCentre,
} from './profile.js';

const LEGS = [[1, 1], [1, -1], [-1, -1], [-1, 1]]; // E, N, W, S pillars
export const PILLARS = { E: [1, 1], N: [1, -1], W: [-1, -1], S: [-1, 1] };

const lerp = (a, b, t) => a + (b - a) * t;
const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];

/** Point on a tower face: face = {ax: 'x'|'z', s: ±1}; u = coordinate along the face. */
function facePt(face, u, y, off = 0) {
  const w = H(y) + off;
  return face.ax === 'x' ? [face.s * w, y, u] : [u, y, face.s * w];
}
const FACES = [
  { ax: 'z', s: 1, n: [0, 0, 1] }, { ax: 'x', s: 1, n: [1, 0, 0] },
  { ax: 'z', s: -1, n: [0, 0, -1] }, { ax: 'x', s: -1, n: [-1, 0, 0] },
];
export { FACES, facePt };

export function buildStructure(sets, opts = {}) {
  const { chords, braces } = sets;
  const elevatorLegs = opts.elevatorLegs || [];
  const levels = panelLevels();
  const lower = levels.filter((y) => y <= L2 + 0.01);
  const upper = levels.filter((y) => y >= L2 - 0.01);

  // ------------------------------------------------------------ legs (0 → L2)
  for (const [sx, sz] of LEGS) {
    const O = (y) => [sx * H(y), y, sz * H(y)];
    const S1 = (y) => [sx * H(y), y, sz * C(y)];
    const S2 = (y) => [sx * C(y), y, sz * H(y)];
    const I = (y) => [sx * C(y), y, sz * C(y)];
    const diag = [sx * Math.SQRT1_2, 0, sz * Math.SQRT1_2];
    const nX = [sx, 0, 0], nZ = [0, 0, sz];
    const nXi = [-sx, 0, 0], nZi = [0, 0, -sz];

    // chords: follow the curvature with 2-3 segments per panel
    for (let k = 0; k < lower.length - 1; k++) {
      const y0 = lower[k], y1 = lower[k + 1];
      const steps = y1 - y0 > 6 ? 3 : 2;
      for (let s = 0; s < steps; s++) {
        const a = lerp(y0, y1, s / steps), b = lerp(y0, y1, (s + 1) / steps);
        const cw = chordSize((a + b) / 2);
        chords.add(O(a), O(b), cw * 1.08, cw * 1.08, diag, 1);
        chords.add(S1(a), S1(b), cw, cw * 0.9, nX, 1);
        chords.add(S2(a), S2(b), cw, cw * 0.9, nZ, 1);
        chords.add(I(a), I(b), cw * 0.92, cw * 0.85, [-diag[0], 0, -diag[2]], 0.96);
      }
    }

    // the four faces of the leg box
    const legFaces = [
      [O, S1, nX], [S2, O, nZ], [I, S2, nXi], [S1, I, nZi],
    ];
    for (let k = 0; k < lower.length - 1; k++) {
      const y0 = lower[k], y1 = lower[k + 1];
      const bw = braceSize((y0 + y1) / 2);
      for (let fi = 0; fi < legFaces.length; fi++) {
        const [P, Q, n] = legFaces[fi];
        if (k === 0 && fi >= 2) continue; // inner faces open at ground level: the pillar entrances
        const A0 = P(y0), B0 = Q(y0), A1 = P(y1), B1 = Q(y1);
        const width = Math.hypot(A0[0] - B0[0], A0[2] - B0[2]);
        if (y0 > 0.5) braces.add(A0, B0, bw * 1.05, bw * 0.8, n);
        // bays of ≈6.5 m, each with its St Andrew's cross; secondary uprights between bays
        const nb = Math.max(1, Math.round(width / 6.5));
        const at = (Pt0, Pt1, t) => [Pt0[0] + (Pt1[0] - Pt0[0]) * t, Pt0[1] + (Pt1[1] - Pt0[1]) * t, Pt0[2] + (Pt1[2] - Pt0[2]) * t];
        for (let b = 0; b < nb; b++) {
          const t0 = b / nb, t1 = (b + 1) / nb;
          const a0 = at(A0, B0, t0), b0 = at(A0, B0, t1), a1 = at(A1, B1, t0), b1 = at(A1, B1, t1);
          braces.add(a0, b1, bw, bw * 0.75, n);
          braces.add(b0, a1, bw, bw * 0.75, n);
          if (b > 0) braces.add(a0, a1, bw * 1.1, bw * 0.85, n);
        }
        // intermediate strut at mid height
        if (y1 - y0 > 4.5) {
          const ym = (y0 + y1) / 2;
          braces.add(P(ym), Q(ym), bw * 0.72, bw * 0.55, n, 0.97);
        }
      }
      // horizontal diaphragm: a diamond joining the mid-sides keeps the leg
      // square while leaving the centre free for the inclined elevator
      if (k % 2 === 1 || elevatorLegs.length === 0) {
        const y = y0;
        const m1 = mid(O(y), S1(y)), m2 = mid(S1(y), I(y)), m3 = mid(I(y), S2(y)), m4 = mid(S2(y), O(y));
        const up = [0, 1, 0];
        braces.poly([m1, m2, m3, m4, m1], bw * 0.8, bw * 0.6, up, 0.94);
      }
    }
    // closing tie at the 2nd floor
    for (const [P, Q, n] of legFaces) braces.add(P(L2), Q(L2), braceSize(L2) * 1.1, braceSize(L2) * 0.9, n);
  }

  // ------------------------------------------------------------ upper shaft (L2 → L3)
  // corner chords + face chords (the legs' inner side chords, meeting at MERGE_Y)
  for (let k = 0; k < upper.length - 1; k++) {
    const y0 = upper[k], y1 = upper[k + 1];
    const steps = 2;
    for (let s = 0; s < steps; s++) {
      const a = lerp(y0, y1, s / steps), b = lerp(y0, y1, (s + 1) / steps);
      const cw = chordSize((a + b) / 2);
      for (const [sx, sz] of LEGS) {
        const diag = [sx * Math.SQRT1_2, 0, sz * Math.SQRT1_2];
        chords.add([sx * H(a), a, sz * H(a)], [sx * H(b), b, sz * H(b)], cw * 1.1, cw * 1.1, diag, 1);
      }
      for (const f of FACES) {
        const merged = (a + b) / 2 >= MERGE_Y - 0.5;
        if (merged) {
          chords.add(facePt(f, 0, a), facePt(f, 0, b), cw * 0.95, cw * 0.85, f.n, 1);
        } else {
          for (const sgn of [1, -1]) {
            chords.add(facePt(f, sgn * C(a), a), facePt(f, sgn * C(b), b), cw * 0.9, cw * 0.8, f.n, 1);
          }
        }
      }
    }
  }
  // face lattice: 3 bays (corner column | central bay | corner column), then 2
  for (let k = 0; k < upper.length - 1; k++) {
    const y0 = upper[k], y1 = upper[k + 1];
    const bw = braceSize((y0 + y1) / 2);
    for (const f of FACES) {
      const us0 = C(y0) > 0.35 ? [-H(y0), -C(y0), C(y0), H(y0)] : [-H(y0), 0, H(y0)];
      const us1 = C(y0) > 0.35 ? [-H(y1), -C(y1), C(y1), H(y1)] : [-H(y1), 0, H(y1)];
      for (let b = 0; b < us0.length - 1; b++) {
        const A0 = facePt(f, us0[b], y0), B0 = facePt(f, us0[b + 1], y0);
        braces.add(A0, B0, bw * 1.1, bw * 0.85, f.n);
        const bayW = Math.abs(us0[b + 1] - us0[b]);
        if (bayW < 0.8) continue;
        const ns = Math.max(1, Math.round(bayW / 5.4));
        for (let j = 0; j < ns; j++) {
          const ua0 = lerp(us0[b], us0[b + 1], j / ns), ub0 = lerp(us0[b], us0[b + 1], (j + 1) / ns);
          const ua1 = lerp(us1[b], us1[b + 1], j / ns), ub1 = lerp(us1[b], us1[b + 1], (j + 1) / ns);
          braces.add(facePt(f, ua0, y0), facePt(f, ub1, y1), bw, bw * 0.75, f.n);
          braces.add(facePt(f, ub0, y0), facePt(f, ua1, y1), bw, bw * 0.75, f.n);
          if (j > 0) braces.add(facePt(f, ua0, y0), facePt(f, ua1, y1), bw * 0.95, bw * 0.75, f.n);
        }
      }
      if (y1 - y0 > 5) {
        const ym = (y0 + y1) / 2;
        braces.add(facePt(f, -H(ym), ym), facePt(f, H(ym), ym), bw * 0.7, bw * 0.55, f.n, 0.97);
      }
    }
    // plan bracing ("spokes") every other panel: corner → lift-shaft frame.
    // Not at the 2nd floor itself (the deck girders brace it, and the spokes
    // would cross the inclined lifts' arrival); the frame clears both summit
    // cabins and their guide rails.
    if (k % 2 === 0 && k > 0) {
      const y = y0, cf = 3.3;
      const frame = [[cf, y, cf], [cf, y, -cf], [-cf, y, -cf], [-cf, y, cf]];
      braces.poly([...frame, frame[0]], bw * 0.8, bw * 0.6, [0, 1, 0], 0.92);
      for (const [sx, sz] of LEGS) {
        braces.add([sx * H(y), y, sz * H(y)], [sx * cf, y, sz * cf], bw * 0.85, bw * 0.6, [0, 1, 0], 0.92);
      }
    }
  }
  // top ring under the 3rd floor
  for (const f of FACES) {
    braces.add(facePt(f, -H(L3), L3 - 0.2), facePt(f, H(L3), L3 - 0.2), 0.7, 0.6, f.n);
  }

  // ------------------------------------------------------------ great arches
  buildArches(sets);
  // ------------------------------------------------------------ 1st & 2nd floor girders
  buildFirstFloorGirders(sets);
  buildSecondFloorGirders(sets);
}

// ================================================================ arches
export const ARCH = { R: 37.15, yc: 1.85, depthApex: 5.4, depthFoot: 3.4, off: 0.9 };
export function archPoint(face, theta, inset, off = ARCH.off) {
  const r = ARCH.R - inset;
  const u = r * Math.cos(theta), y = ARCH.yc + r * Math.sin(theta);
  return facePt(face, face.ax === 'x' ? -face.s * u : u, y, off);
}
export const archDepth = (theta) => lerp(ARCH.depthFoot, ARCH.depthApex, Math.sin(Math.max(0, Math.min(Math.PI, theta))));

function buildArches({ chords, braces }) {
  const N = 44;
  const t0 = -0.05, t1 = Math.PI + 0.05;
  for (const f of FACES) {
    const outer = [], inner = [], mids = [];
    for (let i = 0; i <= N; i++) {
      const th = lerp(t0, t1, i / N);
      const d = archDepth(th);
      outer.push(archPoint(f, th, 0));
      inner.push(archPoint(f, th, d));
      mids.push(archPoint(f, th, d * 0.5));
    }
    chords.poly(outer, 1.25, 1.5, f.n, 1.02);
    chords.poly(inner, 1.0, 1.3, f.n, 1.0);
    // a second, rear rib gives the arch its depth when seen from below
    const rear = [];
    for (let i = 0; i <= N; i++) {
      const th = lerp(t0, t1, i / N);
      rear.push(archPoint(f, th, archDepth(th) * 0.55, ARCH.off - 1.6));
    }
    braces.poly(rear, 0.55, 0.55, f.n, 0.95);
    for (let i = 0; i <= N; i += 4) braces.add(mids[i], rear[i], 0.35, 0.35, [0, 1, 0], 0.95);
  }
}

// ================================================================ 1st floor girders
export const G1 = { yb: 44.2, yt: 51.4, frieze0: 51.4, frieze1: L1 };
function buildFirstFloorGirders({ chords, braces }) {
  const { yb, yt } = G1;
  const off = 0.55;
  for (const f of FACES) {
    const hb = H(yb) + 0.8, ht = H(yt) + 0.8;
    // top & bottom chords spanning the whole face
    chords.add(facePt(f, -hb, yb, off), facePt(f, hb, yb, off), 1.3, 1.2, f.n, 1.02);
    chords.add(facePt(f, -ht, yt, off), facePt(f, ht, yt, off), 1.3, 1.2, f.n, 1.02);
    const ym = (yb + yt) / 2;
    const hm = H(ym) + 0.8;
    braces.add(facePt(f, -hm, ym, off), facePt(f, hm, ym, off), 0.55, 0.5, f.n, 0.98);
    // verticals + St Andrew's crosses; cells of ~3.53 m (20 per face)
    const cells = 20;
    for (let i = 0; i <= cells; i++) {
      const ub = lerp(-hb, hb, i / cells), ut = lerp(-ht, ht, i / cells);
      braces.add(facePt(f, ub, yb, off), facePt(f, ut, yt, off), 0.72, 0.6, f.n);
      if (i < cells) {
        const ub1 = lerp(-hb, hb, (i + 1) / cells), ut1 = lerp(-ht, ht, (i + 1) / cells);
        braces.add(facePt(f, ub, yb, off), facePt(f, ut1, yt, off), 0.6, 0.5, f.n);
        braces.add(facePt(f, ub1, yb, off), facePt(f, ut, yt, off), 0.6, 0.5, f.n);
      }
    }
    // small arcades hanging below the girder towards the legs
    const archR = 1.7, pitch = 3.56;
    for (let i = -10; i <= 10; i++) {
      const u0 = i * pitch;
      if (Math.abs(u0) < 21 || Math.abs(u0) > H(yb) - 1) continue;
      const pts = [];
      for (let j = 0; j <= 6; j++) {
        const a = Math.PI * (j / 6);
        pts.push(facePt(f, u0 + Math.cos(a) * archR, yb - 2.2 + Math.sin(a) * 2.0, off));
      }
      braces.poly(pts, 0.3, 0.3, f.n, 1.0);
    }
    // spandrels between the arch extrados and the girder
    const pitchS = 3.56;
    for (let i = -6; i <= 6; i++) {
      const u = i * pitchS;
      const yE = archExtrados(u);
      if (yE === null || yb - yE > 16) continue;
      braces.add(facePt(f, u, yE, off), facePt(f, u, yb, off), 0.42, 0.4, f.n);
      if (i < 6) {
        const u1 = (i + 1) * pitchS, yE1 = archExtrados(u1);
        if (yE1 !== null && yb - yE1 <= 16) {
          braces.add(facePt(f, u, yE, off), facePt(f, u1, yb, off), 0.32, 0.3, f.n);
          braces.add(facePt(f, u1, yE1, off), facePt(f, u, yb, off), 0.32, 0.3, f.n);
        }
      }
    }
  }
  // underside grid of the 1st floor (visible from the parvis)
  const yU = L1 - 1.6;
  for (let v = -L1_HALF + 2; v <= L1_HALF - 2; v += 5.9) {
    if (Math.abs(v) < 11) continue;
    gridLine(braces, 'x', v, -L1_HALF + 1, L1_HALF - 1, yU, 0.9, 1.4);
    gridLine(braces, 'z', v, -L1_HALF + 1, L1_HALF - 1, yU, 0.9, 1.4);
  }
  // deep girders around the central void
  for (const f of FACES) {
    const a = f.ax === 'x' ? [f.s * 11.2, yU - 2, -11.2] : [-11.2, yU - 2, f.s * 11.2];
    const b = f.ax === 'x' ? [f.s * 11.2, yU - 2, 11.2] : [11.2, yU - 2, f.s * 11.2];
    chords.add(a, b, 1.0, 1.0, f.n, 0.95);
    for (let t = 0; t <= 1.0001; t += 1 / 6) {
      const p = [lerp(a[0], b[0], t), yU - 2, lerp(a[2], b[2], t)];
      braces.add(p, [p[0], yU + 1, p[2]], 0.4, 0.4, f.n, 0.95);
    }
  }
}

/** Height of the arch extrados at along-face coordinate u (null outside). */
export function archExtrados(u) {
  const r = ARCH.R + 0.6;
  if (Math.abs(u) >= r) return null;
  return ARCH.yc + Math.sqrt(r * r - u * u);
}

// ================================================================ 2nd floor girders
export const G2 = { box0: 90.5, box1: 102.2, strip1: 104.4, yt: 110.4 };
function buildSecondFloorGirders({ chords, braces }) {
  const off = 0.5;
  for (const f of FACES) {
    const y0 = G2.strip1, y1 = G2.yt;
    const h0 = H(y0) + 0.6, h1 = H(y1) + 0.6;
    chords.add(facePt(f, -h0, y0, off), facePt(f, h0, y0, off), 0.8, 0.9, f.n, 1.02);
    chords.add(facePt(f, -h1, y1, off), facePt(f, h1, y1, off), 0.8, 0.9, f.n, 1.02);
    chords.add(facePt(f, -H(G2.box1) - 0.6, G2.box1, off), facePt(f, H(G2.box1) + 0.6, G2.box1, off), 0.6, 0.7, f.n, 1.0);
    const cells = 12;
    for (let i = 0; i <= cells; i++) {
      const ua = lerp(-h0, h0, i / cells), ub = lerp(-h1, h1, i / cells);
      braces.add(facePt(f, ua, y0, off), facePt(f, ub, y1, off), 0.42, 0.42, f.n);
      if (i < cells) {
        const ua1 = lerp(-h0, h0, (i + 1) / cells), ub1 = lerp(-h1, h1, (i + 1) / cells);
        braces.add(facePt(f, ua, y0, off), facePt(f, ub1, y1, off), 0.32, 0.3, f.n);
        braces.add(facePt(f, ua1, y0, off), facePt(f, ub, y1, off), 0.32, 0.3, f.n);
      }
    }
    // hanging lattice box between the legs: edge members (the fine mesh is a textured panel)
    const cb = C(G2.box0), ct = C(G2.box1);
    chords.add(facePt(f, -cb, G2.box0, off), facePt(f, cb, G2.box0, off), 0.7, 0.8, f.n, 1.0);
    for (const s of [-1, 1]) braces.add(facePt(f, s * cb, G2.box0, off), facePt(f, s * ct, G2.box1, off), 0.5, 0.5, f.n);
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      braces.add(facePt(f, lerp(-cb, cb, t), G2.box0, off), facePt(f, lerp(-ct, ct, t), G2.box1, off), 0.28, 0.28, f.n);
    }
  }
  // 2nd floor underside grid
  const yU = L2 - 1.2;
  for (let v = -L2_HALF + 2; v <= L2_HALF - 2; v += 4.6) {
    if (Math.abs(v) < 6) continue;
    gridLine(braces, 'x', v, -L2_HALF + 1, L2_HALF - 1, yU, 0.7, 1.0);
    gridLine(braces, 'z', v, -L2_HALF + 1, L2_HALF - 1, yU, 0.7, 1.0);
  }
}

/**
 * A straight underside beam along `axis` at offset v, interrupted where the
 * inclined lift shafts pass through the floor (all four legs, to stay symmetric).
 */
function gridLine(set, axis, v, a, b, y, w, d) {
  const lc = legCentre(y);
  const gaps = [];
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      // shaft centre in (along-line, across-line) coordinates
      const along = s1 * lc, across = s2 * lc;
      if (Math.abs(across - v) < 4.6) gaps.push([along - 4.6, along + 4.6]);
    }
  }
  gaps.sort((p, q) => p[0] - q[0]);
  let cur = a;
  const emit = (t0, t1) => {
    if (t1 - t0 < 1) return;
    const A = axis === 'x' ? [t0, y, v] : [v, y, t0];
    const B = axis === 'x' ? [t1, y, v] : [v, y, t1];
    set.add(A, B, w, d, [0, 1, 0], 0.9);
  };
  for (const [g0, g1] of gaps) {
    if (g1 < cur || g0 > b) continue;
    emit(cur, Math.max(cur, g0));
    cur = Math.max(cur, g1);
  }
  emit(cur, b);
}

/** Leg-centre position (x = z along the diagonal) for elevator paths. */
export function legDiagonal(y) { return legCentre(y); }

/**
 * The decorative band of the four great arches (a plate pierced by a row of
 * round openings) and the scalloped lambrequin fringe along the intrados.
 */
export function archBandGeometries() {
  const bands = [], fringes = [];
  const N = 88, t0 = -0.02, t1 = Math.PI + 0.02;
  for (const f of FACES) {
    const pos = [], uv = [], idx = [];
    const fpos = [], fuv = [], fidx = [];
    let v = 0, vf = 0, prevMid = null;
    for (let i = 0; i <= N; i++) {
      const th = lerp(t0, t1, i / N);
      const d = archDepth(th);
      const o = archPoint(f, th, 0.45, ARCH.off - 0.1);
      const inn = archPoint(f, th, d - 0.45, ARCH.off - 0.1);
      const m = archPoint(f, th, d / 2, ARCH.off - 0.1);
      if (prevMid) {
        const ds = Math.hypot(m[0] - prevMid[0], m[1] - prevMid[1], m[2] - prevMid[2]);
        v += ds / Math.max(2.2, d - 0.9);
        vf += ds / 2.4;
      }
      prevMid = m;
      pos.push(...o, ...inn);
      uv.push(0, v, 1, v);
      // the lambrequin hangs from the crown of the arch only: towards the feet,
      // where the intrados turns vertical, its pendants would stick out sideways
      const s = Math.min(1, Math.max(0, (Math.sin(th) - 0.3) / 0.4)), k = s * s * (3 - 2 * s);
      const fi0 = archPoint(f, th, d - 0.2, ARCH.off - 0.2);
      const fi1 = archPoint(f, th, d - 0.2 + 1.45 * k, ARCH.off - 0.2);
      fpos.push(...fi0, ...fi1);
      fuv.push(vf, 1, vf, 0);
      if (i > 0) {
        const b = (i - 1) * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        fidx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    bands.push({ pos, uv, idx });
    fringes.push({ pos: fpos, uv: fuv, idx: fidx });
  }
  return { bands, fringes };
}
