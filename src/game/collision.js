// Lightweight collision world for a walking player.
//
//  floors : walkable horizontal surfaces (rects / ramps / convex polys) + the
//           terrain height function for everything else;
//  walls  : vertical obstacles in plan view — capsules (2D segments with a
//           radius) and axis-aligned boxes — each with a vertical extent.
// A uniform spatial hash keeps queries O(nearby).
const CELL = 8;

export class CollisionWorld {
  constructor() {
    this.floors = [];
    this.walls = [];
    this.grid = new Map();
    this.terrain = () => 0;
    this.dynamic = []; // objects with .collide(p, r, y0, y1) (elevator cabins…)
  }

  // ------------------------------------------------------------ floors
  addRect(x0, x1, z0, z1, y, tag = null) {
    this.floors.push({ k: 0, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y, tag });
  }
  /** Ramp/stair rising along `axis` ('x' | 'z') from y0 at the low end to y1. */
  addRamp(x0, x1, z0, z1, y0, y1, axis, tag = null) {
    this.floors.push({ k: 1, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, axis, rev: axis === 'x' ? x1 < x0 : z1 < z0, tag });
  }
  /** Removes floor under an area (holes: elevator shafts, voids). */
  addHole(x0, x1, z0, z1, yMin, yMax) {
    this.floors.push({ k: 2, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), yMin, yMax });
  }

  /** Highest walkable surface at (x,z) that is not above `maxY`. */
  groundAt(x, z, maxY) {
    let best = -Infinity, tag = null;
    const t = this.terrain(x, z);
    if (t <= maxY && !this.inHole(x, z, t)) { best = t; tag = 'ground'; }
    for (const f of this.floors) {
      if (f.k === 4) {
        if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1 || !pointInRing(f.flat, x, z)) continue;
        if (f.y <= maxY && f.y > best && !this.inHole(x, z, f.y)) { best = f.y; tag = f.tag; }
        continue;
      }
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      if (f.k >= 2) continue;
      let y;
      if (f.k === 0) y = f.y;
      else {
        const t2 = f.axis === 'x' ? (x - f.x0) / (f.x1 - f.x0) : (z - f.z0) / (f.z1 - f.z0);
        y = f.y0 + (f.y1 - f.y0) * (f.rev ? 1 - t2 : t2);
      }
      if (y <= maxY && y > best && !this.inHole(x, z, y)) { best = y; tag = f.tag; }
    }
    for (const d of this.dynamic) {
      if (!d.floorAt) continue;
      const y = d.floorAt(x, z);
      if (y !== null && y <= maxY && y > best) { best = y; tag = d; }
    }
    return { y: best, tag };
  }

  /** Convex polygon hole (xz corners, any winding). */
  addPolyHole(poly, yMin, yMax) { this.floors.push({ k: 3, poly, yMin, yMax }); }
  /** Arbitrary polygon (flat [x,z,…] array) hole, even-odd rule. */
  addRingHole(flat, yMin, yMax) {
    const bb = ringBox(flat);
    this.floors.push({ k: 5, flat, yMin, yMax, ...bb });
  }
  /** Arbitrary polygon (flat array) walkable floor at height y. */
  addPolyFloor(flat, y, tag = null) {
    const bb = ringBox(flat);
    this.floors.push({ k: 4, flat, y, tag, ...bb });
  }

  inHole(x, z, y) {
    for (const f of this.floors) {
      if (f.k === 2) {
        if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && y >= f.yMin && y <= f.yMax) return true;
      } else if (f.k === 5) {
        if (y < f.yMin || y > f.yMax || x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
        if (pointInRing(f.flat, x, z)) return true;
      } else if (f.k === 3) {
        if (y < f.yMin || y > f.yMax) continue;
        const P = f.poly;
        let sign = 0, inside = true;
        for (let i = 0; i < P.length; i++) {
          const a = P[i], b = P[(i + 1) % P.length];
          const c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
          if (c === 0) continue;
          const sg = c > 0 ? 1 : -1;
          if (sign === 0) sign = sg; else if (sg !== sign) { inside = false; break; }
        }
        if (inside) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ walls
  _insert(w) {
    const i = this.walls.length;
    this.walls.push(w);
    const cx0 = Math.floor((w.minX - 1) / CELL), cx1 = Math.floor((w.maxX + 1) / CELL);
    const cz0 = Math.floor((w.minZ - 1) / CELL), cz1 = Math.floor((w.maxZ + 1) / CELL);
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 4000) return; // absurdly large → skip
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 73856093 ^ cz * 19349663;
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(i);
      }
    }
  }
  /** Capsule wall: segment a→b in plan, radius r, vertical extent y0..y1. */
  addSeg(ax, az, bx, bz, r, y0, y1, tag = null) {
    this._insert({
      k: 0, ax, az, bx, bz, r, y0, y1, tag,
      minX: Math.min(ax, bx) - r, maxX: Math.max(ax, bx) + r, minZ: Math.min(az, bz) - r, maxZ: Math.max(az, bz) + r,
    });
  }
  addBox(x0, x1, z0, z1, y0, y1, tag = null) {
    this._insert({ k: 1, minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), y0, y1, tag });
  }
  /** Closed polygon outline as capsule walls. */
  addPolyWalls(pts, r, y0, y1, closed = true) {
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      this.addSeg(a[0], a[1], b[0], b[1], r, y0, y1);
    }
  }

  /** Adds colliders for 3D members (a→b, thickness w) crossing a walkable band. */
  addMembersAtLevel(rec, level, band = 1.9, pad = 0.12) {
    const lo = level + 0.25, hi = level + band;
    for (let o = 0; o < rec.length; o += 12) {
      let ax = rec[o], ay = rec[o + 1], az = rec[o + 2];
      let bx = rec[o + 3], by = rec[o + 4], bz = rec[o + 5];
      if (ay > by) { [ax, bx] = [bx, ax]; [ay, by] = [by, ay]; [az, bz] = [bz, az]; }
      if (by < lo || ay > hi) continue;
      const r = Math.max(rec[o + 6], rec[o + 7]) * 0.5 + pad;
      const dy = by - ay;
      let t0 = 0, t1 = 1;
      if (dy > 1e-6) {
        t0 = Math.max(0, (lo - ay) / dy);
        t1 = Math.min(1, (hi - ay) / dy);
      }
      const px = ax + (bx - ax) * t0, pz = az + (bz - az) * t0;
      const qx = ax + (bx - ax) * t1, qz = az + (bz - az) * t1;
      this.addSeg(px, pz, qx, qz, r, Math.max(ay, lo), Math.min(by, hi));
    }
  }

  query(x, z, rad, cb) {
    const cx0 = Math.floor((x - rad) / CELL), cx1 = Math.floor((x + rad) / CELL);
    const cz0 = Math.floor((z - rad) / CELL), cz1 = Math.floor((z + rad) / CELL);
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const arr = this.grid.get(cx * 73856093 ^ cz * 19349663);
        if (!arr) continue;
        for (const i of arr) {
          if (seen.has(i)) continue;
          seen.add(i);
          cb(this.walls[i]);
        }
      }
    }
  }

  /**
   * Pushes a vertical capsule (centre p.x/p.z, radius r, feet y0, head y1) out
   * of all walls. Mutates p. Returns true if anything was hit.
   */
  resolve(p, r, y0, y1) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.query(p.x, p.z, r + 2, (w) => {
        if (w.y1 < y0 || w.y0 > y1) return;
        if (w.k === 0) {
          const dx = w.bx - w.ax, dz = w.bz - w.az;
          const L2 = dx * dx + dz * dz;
          let t = L2 > 1e-9 ? ((p.x - w.ax) * dx + (p.z - w.az) * dz) / L2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = w.ax + dx * t, cz = w.az + dz * t;
          const ex = p.x - cx, ez = p.z - cz;
          const d2 = ex * ex + ez * ez, R = r + w.r;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1e-6;
            const push = R - d;
            const nx = d2 > 1e-12 ? ex / d : 1, nz = d2 > 1e-12 ? ez / d : 0;
            p.x += nx * push; p.z += nz * push;
            moved = hit = true;
          }
        } else {
          const cx = Math.max(w.minX, Math.min(p.x, w.maxX));
          const cz = Math.max(w.minZ, Math.min(p.z, w.maxZ));
          const ex = p.x - cx, ez = p.z - cz;
          const d2 = ex * ex + ez * ez;
          if (d2 < r * r) {
            if (d2 > 1e-10) {
              const d = Math.sqrt(d2);
              p.x += (ex / d) * (r - d); p.z += (ez / d) * (r - d);
            } else {
              // centre inside the box: push out along the smallest axis
              const l = p.x - w.minX, rr = w.maxX - p.x, b = p.z - w.minZ, f = w.maxZ - p.z;
              const m = Math.min(l, rr, b, f);
              if (m === l) p.x = w.minX - r; else if (m === rr) p.x = w.maxX + r;
              else if (m === b) p.z = w.minZ - r; else p.z = w.maxZ + r;
            }
            moved = hit = true;
          }
        }
      });
      for (const d of this.dynamic) if (d.collide && d.collide(p, r, y0, y1)) moved = hit = true;
      if (!moved) break;
    }
    return hit;
  }
}

function ringBox(flat) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i], z = flat[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return { x0, x1, z0, z1 };
}
function pointInRing(flat, x, z) {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], zi = flat[i * 2 + 1], xj = flat[j * 2], zj = flat[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
