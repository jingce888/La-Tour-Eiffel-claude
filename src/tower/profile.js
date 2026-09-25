// Real-scale geometry of the Eiffel Tower (metres, y up, origin = tower centre at
// ground level; the four faces are aligned with ±x / ±z).
//
// Sources
//  · toureiffel.paris / fr.wikipedia « Données techniques de la tour Eiffel »:
//    base 124.90 m (outer), 74.24 m between the pillars, 1st floor 57.63 m
//    (70.69 m square), 2nd floor 115.73 m (40.96 m), 3rd floor 276.13 m
//    (18.65 m), 330 m to the antenna tip, decorative arches 74 m span / 39 m rise.
//  · The outer silhouette follows the engineering outline of Wikimedia's
//    "Eiffelturm-outline.svg" (two piece-wise exponentials, as shown by
//    Weidman & Pinelis, C. R. Mécanique 2004), minus half a chord width.
//  · Inner-chord convergence (legs merge on each face at ≈194 m) and elevator
//    inclinations (54° → 76°) were cross-checked against photographs.

export const L1 = 57.63;          // 1st floor deck
export const L2 = 115.73;         // 2nd floor deck
export const L3 = 276.13;         // 3rd floor (top) deck
export const L3_UP = 279.7;       // open-air upper terrace of the summit
export const L1_HALF = 35.35;     // 70.69 m square
export const L2_HALF = 20.48;     // 40.96 m square
export const L3_HALF = 9.33;      // 18.65 m square
export const L1_VOID = 11.2;      // half-width of the central void of the 1st floor
export const L2_CORE = 6.2;       // half-width of the 2nd-floor central lift building
export const IRON_TOP = 300.5;    // top of the iron lantern (original 300 m tower)
export const ANTENNA_TOP = 330;   // antenna tip (2022)
export const MERGE_Y = 194;       // inner chords of adjacent legs meet on each face

/** Monotone piece-wise cubic (Fritsch–Carlson / PCHIP) interpolant. */
export function pchip(xs, ys) {
  const n = xs.length;
  const h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    d[i] = (ys[i + 1] - ys[i]) / h[i];
  }
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

// Outer corner-chord centre line (half-width of the square section).
export const H = pchip(
  [0, 10, 20, 30, 40, 50, L1, 70, 85, 100, L2, 130, 150, 175, 200, 225, 250, L3, 290, 300.5],
  [61.5, 56.3, 51.1, 45.9, 40.7, 35.6, 32.6, 28.4, 24.3, 20.3, 16.95, 14.7, 11.7, 9.9, 8.5, 7.35, 6.15, 5.25, 4.2, 3.2]
);

// Inner "side" chords of each leg, as seen on a face: half the gap between two
// neighbouring legs. 38 m at the ground (74.24 m clear + chord), a sharp change
// of inclination at the first floor, then almost vertical up to the merge.
const Craw = pchip(
  [0, 20, 40, L1, 70, 85, 100, L2, 130, 150, 175, MERGE_Y],
  [38.0, 28.6, 19.4, 10.2, 8.9, 7.6, 6.5, 5.5, 4.5, 3.05, 1.25, 0]
);
export const C = (y) => (y >= MERGE_Y ? 0 : Math.max(0, Craw(y)));

/** Leg (corner column) width along a face. */
export const legWidth = (y) => H(y) - C(y);
/** Centre of a leg along each axis (the leg centre line lies on the diagonal). */
export const legCentre = (y) => (H(y) + C(y)) * 0.5;

/** Chord cross-section sizes (m) — the built-up box chords taper upwards. */
export const chordSize = (y) =>
  y < L1 ? 1.75 - 0.55 * (y / L1)
    : y < L2 ? 1.2 - 0.3 * ((y - L1) / (L2 - L1))
      : Math.max(0.42, 0.9 - 0.48 * ((y - L2) / (L3 - L2)));
export const braceSize = (y) => Math.max(0.24, 0.62 - 0.38 * Math.min(1, y / 260));

/** Heights of the horizontal panel ties. */
export function panelLevels() {
  const lv = [0];
  // below the first floor (the top of this zone is taken by the floor girders)
  for (const y of [6.8, 13.4, 19.8, 26.0, 32.0, 38.0, 43.6, 49.2]) lv.push(y);
  lv.push(L1);
  for (const y of [64.4, 71.2, 78.0, 84.8, 91.6, 98.4, 104.6, 110.2]) lv.push(y);
  lv.push(L2);
  // upper shaft: panel height shrinks with the face width
  let y = L2;
  while (y < L3 - 1) {
    const w = 2 * H(y);
    const p = Math.min(9.6, Math.max(5.2, 0.27 * w + 2.2));
    y = Math.min(L3, y + p);
    if (L3 - y < 3.5) y = L3;
    lv.push(+y.toFixed(2));
  }
  return lv;
}

/** Elevator rail centre line (inclined, inside the leg), sampled from 0 → L2. */
export function railPoint(y) {
  const d = legCentre(y);
  return [d, y, d];
}

/** Outer half-width of the silhouette including floor overhangs (for LOD / collision checks). */
export function silhouetteHalf(y) {
  if (Math.abs(y - L1) < 7) return L1_HALF;
  if (Math.abs(y - L2) < 5) return L2_HALF;
  if (y > L3 - 3 && y < L3_UP + 3) return L3_HALF;
  return H(y) + 1;
}
