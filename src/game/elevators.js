// Elevators: geometry, motion and interaction.
//
// InclineLift — one per equipped pillar. The chassis rides two rails bent to the
// leg's curve, the cabin stays level (as the real "tangent screw" mechanism
// does). Stops: parvis, 1st floor, 2nd floor.
// DuoLift — two glass cabins in the central shaft from the 2nd floor to the
// summit that counterbalance each other: one rises while the other descends,
// so riders see their twin cabin sweep past half-way up.
import * as THREE from 'three';
import { L1, L2, L3, legWidth } from '../tower/profile.js';
import { STATION_Y, CABIN, TOP_LIFT, RAIL_V } from '../tower/rails.js';
import { paintAt } from '../tower/materials.js';
import { canvas, toTexture } from '../world/textures.js';
import { mergeStatic } from '../core/merge.js';

const DOOR_TIME = 1.6;
const DWELL = 0; // doors stay open until the player acts

function easeMotion(state, target, dt, vmax, amax) {
  // jerk-limited-ish trapezoidal profile: v follows the braking curve
  const dist = target - state.y;
  const dir = Math.sign(dist);
  const brake = Math.sqrt(2 * amax * 0.9 * Math.abs(dist));
  const want = dir * Math.min(vmax, brake);
  const dv = THREE.MathUtils.clamp(want - state.v, -amax * dt, amax * dt);
  const prevV = state.v;
  state.v += dv;
  state.a = (state.v - prevV) / Math.max(dt, 1e-4);
  state.y += state.v * dt;
  if (Math.abs(target - state.y) < 0.004 || (dir !== 0 && Math.sign(target - state.y) !== dir)) {
    state.y = target; state.v = 0; state.a = 0;
    return true;
  }
  return false;
}

function makeDoorLeaf(w, h, frameMat, glassMat) {
  const g = new THREE.Group();
  const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), frameMat);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.16, h - 0.5), glassMat);
  glass.rotation.y = Math.PI / 2;
  glass.position.set(0.035, 0.15, 0);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, w), frameMat);
  bar.position.y = -h / 2 + 0.9;
  f.scale.set(1, 1, 1);
  // frame as 4 bars rather than a solid slab
  const fr = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, w), frameMat); top.position.y = h / 2 - 0.06;
  const bot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, w), frameMat); bot.position.y = -h / 2 + 0.225;
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.08), frameMat); s1.position.z = w / 2 - 0.04;
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.08), frameMat); s2.position.z = -w / 2 + 0.04;
  fr.add(top, bot, s1, s2, bar);
  g.add(fr, glass);
  glass.userData.keep = true;
  mergeStatic(fr);
  return g;
}

let PANEL_MAT = null;
/** Brushed-steel push-button panel (one shared texture for every cabin). */
function panelMaterial() {
  if (PANEL_MAT) return PANEL_MAT;
  const cv = canvas(96, 200), c = cv.getContext('2d');
  const gr = c.createLinearGradient(0, 0, 96, 0);
  gr.addColorStop(0, '#8d8a84'); gr.addColorStop(0.5, '#b3afa7'); gr.addColorStop(1, '#85827c');
  c.fillStyle = gr; c.fillRect(0, 0, 96, 200);
  for (let y = 0; y < 200; y += 2) { c.fillStyle = `rgba(255,255,255,${0.03 + 0.04 * Math.random()})`; c.fillRect(0, y, 96, 1); }
  c.fillStyle = '#16120e'; c.fillRect(18, 14, 60, 30);                  // floor indicator
  c.fillStyle = '#ffb347'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('▲', 48, 30);
  ['3', '2', '1', '0'].forEach((t, i) => {
    const y = 72 + i * 32;
    c.beginPath(); c.arc(48, y, 12, 0, Math.PI * 2); c.fillStyle = '#5b5852'; c.fill();
    c.beginPath(); c.arc(48, y, 9.5, 0, Math.PI * 2); c.fillStyle = '#d9d5cc'; c.fill();
    c.fillStyle = '#2a2621'; c.font = 'bold 13px sans-serif'; c.fillText(t, 48, y + 1);
  });
  const tex = toTexture(cv, { repeat: false });
  PANEL_MAT = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.38, emissive: 0x2a1c08, emissiveMap: tex, emissiveIntensity: 0.25 });
  return PANEL_MAT;
}

/** Shared cabin interior light + panel look. */
function cabinShell({ along, across, height, color, glassMat, doorSide = -1 }) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x3a2f27, roughness: 0.5, metalness: 0.4 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x4b3a2c, roughness: 0.85 });
  const ceil = new THREE.MeshStandardMaterial({ color: 0xd6ccb8, roughness: 0.8 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff4de, emissive: 0xffe6b5, emissiveIntensity: 1.5, roughness: 0.5 });
  const A = along, B = across, Hh = height;
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(A, 0.22, B), floor, 0, -0.11, 0);
  add(new THREE.BoxGeometry(A + 0.14, 0.28, B + 0.14), paint, 0, Hh + 0.14, 0);        // roof
  add(new THREE.BoxGeometry(A - 0.3, 0.04, B - 0.3), ceil, 0, Hh - 0.03, 0);           // ceiling board
  for (const z of [-B / 4, B / 4]) add(new THREE.BoxGeometry(A - 0.9, 0.02, 0.18), lamp, 0, Hh - 0.06, z); // light strips
  // lower painted band (dado) + glass above, on the three closed sides
  const dado = 1.0;
  const sides = [
    { n: [1, 0], len: B, at: [A / 2, 0] }, { n: [0, 1], len: A, at: [0, B / 2] }, { n: [0, -1], len: A, at: [0, -B / 2] },
  ];
  for (const s of sides) {
    const isX = s.n[0] !== 0;
    const w = isX ? 0.08 : s.len, d = isX ? s.len : 0.08;
    add(new THREE.BoxGeometry(w, dado, d), paint, s.at[0], dado / 2, s.at[1]);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(s.len - 0.1, Hh - dado - 0.1), glassMat);
    gl.position.set(s.at[0], dado + (Hh - dado) / 2, s.at[1]);
    if (isX) gl.rotation.y = Math.PI / 2;
    gl.renderOrder = 4;
    g.add(gl);
    // handrail
    const hr = new THREE.Mesh(new THREE.BoxGeometry(isX ? 0.05 : s.len - 0.3, 0.05, isX ? s.len - 0.3 : 0.05), frame);
    hr.position.set(s.at[0] - s.n[0] * 0.12, 1.02, s.at[1] - s.n[1] * 0.12);
    g.add(hr);
  }
  // corner posts
  for (const [x, z] of [[A / 2, B / 2], [A / 2, -B / 2], [-A / 2, B / 2], [-A / 2, -B / 2]]) {
    add(new THREE.BoxGeometry(0.12, Hh, 0.12), paint, x, Hh / 2, z);
  }
  // door wall (x = -A/2) with lintel; leaves are separate
  add(new THREE.BoxGeometry(0.1, 0.35, B), paint, -A / 2, Hh - 0.175, 0);
  add(new THREE.BoxGeometry(0.1, Hh, 0.35), paint, -A / 2, Hh / 2, B / 2 - 0.175);
  add(new THREE.BoxGeometry(0.1, Hh, 0.35), paint, -A / 2, Hh / 2, -B / 2 + 0.175);
  // control panel beside the door
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.24), panelMaterial());
  panel.position.set(-A / 2 + 0.1, 1.35, B / 2 - 0.5);
  g.add(panel);
  const doorW = B - 0.7;
  const leafL = makeDoorLeaf(doorW / 2, Hh - 0.35, paint, glassMat);
  const leafR = makeDoorLeaf(doorW / 2, Hh - 0.35, paint, glassMat);
  leafL.position.set(-A / 2 + 0.02, (Hh - 0.35) / 2, doorW / 4);
  leafR.position.set(-A / 2 + 0.02, (Hh - 0.35) / 2, -doorW / 4);
  g.add(leafL, leafR);
  g.traverse((o) => { if (o.isMesh && o.material !== glassMat) { o.castShadow = true; o.receiveShadow = true; } });
  for (const leaf of [leafL, leafR]) leaf.traverse((o) => { if (o.isMesh) o.userData.keep = true; });
  mergeStatic(g);
  void doorSide;
  return { group: g, leafL, leafR, doorW };
}

// ================================================================== incline lift
export class InclineLift {
  constructor({ name, label, rail, color, collision, scene, glassMat }) {
    this.name = name; this.label = label; this.rail = rail;
    this.stops = [
      { y: STATION_Y, label: '地面 · Parvis', short: '0' },
      { y: L1, label: '一层 · 57 m', short: '1' },
      { y: L2, label: '二层 · 115 m', short: '2' },
    ];
    this.state = { y: STATION_Y, v: 0, a: 0 };
    this.stopIndex = 0;
    this.target = null;
    this.mode = 'open';      // open | closing | moving | opening | idle(closed)
    this.door = 1;           // 0 closed … 1 open
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.yaw = Math.atan2(-rail.dirOut.z, rail.dirOut.x); // local +x → dirOut
    this.axisZ = new THREE.Vector3(-rail.dirOut.z, 0, rail.dirOut.x);   // local +z in world
    this.root = new THREE.Group();
    this.root.name = 'lift-' + name;
    const shell = cabinShell({ ...CABIN, color, glassMat });
    this.shell = shell;
    this.cabin = shell.group;
    this.root.add(this.cabin);
    // chassis: two side frames running on the rails beside the cabin, tilted with the track
    this.chassis = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0x2f2822, roughness: 0.6, metalness: 0.5 });
    for (const s of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.32, 0.18), cm);
      beam.position.set(0, 0, s * RAIL_V);
      this.chassis.add(beam);
      for (const e of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 14), cm);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(e * 2.9, -0.2, s * (RAIL_V + 0.12));
        this.chassis.add(wheel);
      }
    }
    this.chassis.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // short arms from the cabin corners to the side frames (stay level with the cabin)
    for (const s of [-1, 1]) {
      for (const e of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, RAIL_V - CABIN.across / 2 + 0.05), cm);
        arm.position.set(e * (CABIN.along / 2 - 0.3), 0.25, s * (CABIN.across / 2 + (RAIL_V - CABIN.across / 2) / 2));
        this.cabin.add(arm);
      }
    }
    this.root.add(this.chassis);
    // bridge plate: slides out over the landing edge as the doors open
    this.sillPlate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, shell.doorW + 0.2),
      new THREE.MeshStandardMaterial({ color: 0x6a655d, metalness: 0.7, roughness: 0.35 }));
    this.sillPlate.receiveShadow = true;
    this.cabin.add(this.sillPlate);
    scene.add(this.root);
    this.buildRails(scene);
    this.sync(0);
    this.prevPos.copy(this.pos);
    collision.dynamic.push(this);
  }

  buildRails(scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b3129, roughness: 0.55, metalness: 0.45 });
    const geos = [];
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    const across = this.rail.dirAcross;
    const seg = (a, b, w) => {
      const len = a.distanceTo(b);
      const g = new THREE.BoxGeometry(w, len, w);
      g.translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
      g.translate(a.x, a.y, a.z);
      geos.push(g);
    };
    // below the ground station the rails continue straight into the pit
    const p0 = this.rail.pointAtHeight(STATION_Y), t0 = this.rail.tangentAtHeight(STATION_Y);
    for (const s of [-1, 1]) {
      let prev = null;
      for (let y = STATION_Y - 3.3; y <= L2 + 1.2; y += 1.5) {
        if (y < STATION_Y) p.copy(p0).addScaledVector(t0, (y - STATION_Y) / t0.y);
        else this.rail.pointAtHeight(Math.min(L2, y), p);
        p.y = y - 0.2;
        p.addScaledVector(across, s * RAIL_V);
        if (prev) seg(prev, p.clone(), 0.2);
        prev = p.clone();
      }
    }
    // side brackets every ~4 m tying the rails to the leg faces (outside the
    // cabin's sweep) — none across the 1st-floor landing, where people walk
    for (let y = 4; y < L2 - 1; y += 4) {
      if (y - 0.25 > L1 - 1.3 && y - 0.25 < L1 + 3.6) continue;
      this.rail.pointAtHeight(y, p);
      const half = legWidth(y) * 0.5 - 0.5;
      for (const s of [-1, 1]) {
        const a = p.clone().addScaledVector(across, s * (RAIL_V + 0.15)); a.y = y - 0.25;
        const b = p.clone().addScaledVector(across, s * half); b.y = y - 0.25;
        if (half > RAIL_V + 0.6) seg(a, b, 0.2);
      }
    }
    const merged = new THREE.Mesh(mergeList(geos), mat);
    merged.name = 'lift-rails-' + this.name;
    merged.castShadow = true;
    merged.receiveShadow = true;
    scene.add(merged);
  }

  sync(dt) {
    this.rail.pointAtHeight(this.state.y, this.pos);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    // chassis follows the rail inclination
    const t = this.rail.tangentAtHeight(this.state.y);
    const horiz = Math.hypot(t.x, t.z);
    const incl = Math.atan2(t.y, horiz); // angle above horizontal, rail goes inward-up
    this.chassis.rotation.set(0, 0, -incl);
    this.chassis.position.set(0, -0.2, 0);
    // doors
    const slide = this.door * (this.shell.doorW / 2 - 0.05);
    this.shell.leafL.position.z = this.shell.doorW / 4 + slide;
    this.shell.leafR.position.z = -this.shell.doorW / 4 - slide;
    const ext = 0.4 * this.door;
    this.sillPlate.visible = ext > 0.01;
    this.sillPlate.scale.x = Math.max(ext, 0.001);
    this.sillPlate.position.set(-CABIN.along / 2 - ext / 2, -0.015, 0); // top 5 mm proud of the floor
    this.inclination = incl;
    void dt;
  }

  /** World → cabin-local (x along, z across). */
  toLocal(x, z) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const o = this.rail.dirOut, a = this.axisZ;
    return [dx * o.x + dz * o.z, dx * a.x + dz * a.z];
  }
  contains(x, z, y, margin = 0) {
    const [lx, lz] = this.toLocal(x, z);
    return Math.abs(lx) <= CABIN.along / 2 - margin && Math.abs(lz) <= CABIN.across / 2 - margin &&
      y > this.pos.y - 0.6 && y < this.pos.y + CABIN.height;
  }
  floorAt(x, z) {
    const [lx, lz] = this.toLocal(x, z);
    // docked with the doors open, the sill plate bridges the few centimetres
    // between the cabin floor and the landing edge
    const sill = this.mode !== 'moving' && this.door > 0.3 ? 0.45 : 0.05;
    if (lx <= CABIN.along / 2 + 0.05 && lx >= -CABIN.along / 2 - sill && Math.abs(lz) <= CABIN.across / 2 + 0.05) return this.pos.y;
    return null;
  }
  /** Walls of the cabin (+ door when closed) and landing gates. */
  collide(p, r, y0, y1) {
    let hit = false;
    const A = CABIN.along / 2, B = CABIN.across / 2;
    // cabin walls in local space
    if (y1 > this.pos.y && y0 < this.pos.y + CABIN.height) {
      const [lx, lz] = this.toLocal(p.x, p.z);
      const inside = Math.abs(lx) < A && Math.abs(lz) < B;
      let nx = lx, nz = lz;
      const doorOpen = this.door > 0.85;
      const halfDoor = this.shell.doorW / 2 * this.door;
      if (inside) {
        // keep inside: clamp to walls except through an open door
        if (nx > A - r) nx = A - r;
        if (nz > B - r) nz = B - r;
        if (nz < -B + r) nz = -B + r;
        if (nx < -A + r && !(doorOpen && Math.abs(lz) < halfDoor - r * 0.5)) nx = -A + r;
      } else {
        // outside: push away from the box, door gap is passable when open
        const cx = Math.max(-A, Math.min(lx, A)), cz = Math.max(-B, Math.min(lz, B));
        const ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
        const throughDoor = doorOpen && lx < -A + 0.01 && Math.abs(lz) < halfDoor - r * 0.5;
        if (d < r && !throughDoor) {
          if (d > 1e-6) { nx = cx + ex / d * r; nz = cz + ez / d * r; }
          else nx = -A - r;
        }
      }
      if (nx !== lx || nz !== lz) {
        const o = this.rail.dirOut, a = this.axisZ;
        p.x = this.pos.x + o.x * nx + a.x * nz;
        p.z = this.pos.z + o.z * nx + a.z * nz;
        hit = true;
      }
    }
    // landing gates: the doorway line at each stop is closed unless docked & open
    // (they only concern people walking on a landing, never the cabin's riders)
    const [rx, rz] = this.toLocal(p.x, p.z);
    if (Math.abs(rx) < A && Math.abs(rz) < B && y0 < this.pos.y + CABIN.height && y1 > this.pos.y) return hit;
    for (let i = 0; i < this.stops.length; i++) {
      const sy = this.stops[i].y;
      if (y0 < sy - 0.2 || y0 > sy + 1.0) continue; // y0 = feet + step height
      const docked = this.mode !== 'moving' && this.stopIndex === i && this.door > 0.85;
      if (docked) continue;
      const pt = this.rail.pointAtHeight(sy);
      // gate: segment across the door plane at the landing
      const o = this.rail.dirOut, a = this.axisZ;
      const gx = pt.x - o.x * (A + 0.35), gz = pt.z - o.z * (A + 0.35);
      const ax = gx + a.x * B, az = gz + a.z * B, bx = gx - a.x * B, bz = gz - a.z * B;
      const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
      const tRaw = ((p.x - ax) * dx + (p.z - az) * dz) / L;
      const along = (p.x - gx) * o.x + (p.z - gz) * o.z; // > 0: shaft side
      if (tRaw > 0 && tRaw < 1) {
        // in front of the doorway: keep the walker on the landing side — also
        // anyone caught between the gate and a cabin that just closed its doors
        // (riders inside the cabin are more than 0.6 m past the gate)
        if (along > -(r + 0.05) && along < 0.6) {
          const push = r + 0.05 + along;
          p.x -= o.x * push; p.z -= o.z * push; hit = true;
        }
      } else {
        const t = Math.max(0, Math.min(1, tRaw));
        const qx = ax + dx * t, qz = az + dz * t;
        const ex = p.x - qx, ez = p.z - qz, d = Math.hypot(ex, ez);
        if (d < r + 0.05 && d > 1e-6) {
          const push = r + 0.05 - d;
          p.x += ex / d * push; p.z += ez / d * push; hit = true;
        }
      }
    }
    return hit;
  }

  request(i) {
    if (i === this.stopIndex && this.mode !== 'moving') {
      if (this.mode !== 'open') this.mode = 'opening';
      return false;
    }
    this.target = i;
    if (this.mode === 'open' || this.mode === 'opening') this.mode = 'closing';
    else if (this.mode === 'idle') this.mode = 'moving';
    return true;
  }

  update(dt, speedUp = 1) {
    this.prevPos.copy(this.pos);
    const prevDoor = this.door;
    this.events = [];
    if (this.mode === 'closing') {
      this.door = Math.max(0, this.door - dt / DOOR_TIME);
      if (this.door === 0) { this.mode = this.target !== null ? 'moving' : 'idle'; if (this.mode === 'moving') this.events.push('depart'); }
    } else if (this.mode === 'opening') {
      this.door = Math.min(1, this.door + dt / DOOR_TIME);
      if (this.door === 1) this.mode = 'open';
    } else if (this.mode === 'moving') {
      const ty = this.stops[this.target].y;
      // speed along the rail ≈ 3.2 m/s → vertical speed depends on inclination
      const incl = Math.max(0.5, Math.sin(this.inclination || 1));
      const vmax = 3.2 * incl * speedUp, amax = 0.55 * speedUp;
      const done = easeMotion(this.state, ty, dt, vmax, amax);
      if (done) {
        this.stopIndex = this.target;
        this.target = null;
        this.mode = 'opening';
        this.events.push('arrive');
      }
    }
    if (prevDoor !== this.door && this.door > 0 && prevDoor === 0) this.events.push('doorsOpening');
    this.sync(dt);
    this.delta.subVectors(this.pos, this.prevPos);
    void DWELL;
  }

  get speed() { return Math.abs(this.state.v) / Math.max(0.2, Math.sin(this.inclination || 1)); }
  get altitude() { return this.state.y; }
}

// ================================================================== duolift
export class DuoLift {
  constructor({ collision, scene, glassMat }) {
    this.stops = [{ y: L2, label: '二层 · 115 m', short: '2' }, { y: L3, label: '塔顶 · 276 m', short: '3' }];
    this.state = { y: L2, v: 0, a: 0 };   // cabin A floor height; B = L2 + L3 - A
    this.mode = 'open';
    this.door = 1;
    this.target = null;
    this.stopIndex = 0;
    this.cabins = [];
    const colors = [0x6f5a45, 0x6f5a45];
    for (let i = 0; i < 2; i++) {
      const shell = cabinShell({ along: TOP_LIFT.size, across: TOP_LIFT.size, height: TOP_LIFT.height, color: colors[i], glassMat });
      const root = new THREE.Group();
      root.add(shell.group);
      // doors face +z: rotate so local -x (door side) → world +z
      shell.group.rotation.y = Math.PI / 2;
      scene.add(root);
      this.cabins.push({
        i, shell, root, x: TOP_LIFT.x[i], pos: new THREE.Vector3(TOP_LIFT.x[i], L2, TOP_LIFT.z),
        prev: new THREE.Vector3(), delta: new THREE.Vector3(),
      });
    }
    this.buildShaft(scene);
    this.sync();
    for (const c of this.cabins) c.prev.copy(c.pos);
    collision.dynamic.push(this);
  }

  buildShaft(scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b3129, roughness: 0.5, metalness: 0.5 });
    const cable = new THREE.MeshStandardMaterial({ color: 0x1b1916, roughness: 0.4, metalness: 0.8 });
    const geos = [], cgeos = [];
    const h = L3 + 3.3 - L2;
    for (const x0 of TOP_LIFT.x) {
      for (const dx of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.16, h, 0.12);
        g.translate(x0 + dx * (TOP_LIFT.size / 2 + 0.12), L2 + h / 2, 0);
        geos.push(g);
      }
    }
    for (let y = L2 + 6; y < L3; y += 6) {
      const g = new THREE.BoxGeometry(2 * (Math.abs(TOP_LIFT.x[0]) + TOP_LIFT.size / 2 + 0.3), 0.14, 0.14);
      g.translate(0, y, -TOP_LIFT.size / 2 - 0.2);
      geos.push(g);
    }
    // cables from both cabins up to the pulley room
    for (const c of this.cabins) {
      for (const dz of [-0.25, 0, 0.25]) {
        const g = new THREE.CylinderGeometry(0.018, 0.018, 1, 4);
        g.translate(0, 0.5, 0);
        const m = new THREE.Mesh(g, cable);
        m.position.set(c.x + 0.1, 0, dz);
        m.userData.cable = c.i;
        m.name = 'duo-cable';
        scene.add(m);
        cgeos.push(m);
      }
    }
    this.cables = cgeos;
    const merged = new THREE.Mesh(mergeList(geos), mat);
    merged.name = 'duo-shaft';
    merged.castShadow = true;
    scene.add(merged);
  }

  cabinY(i) { return i === 0 ? this.state.y : L2 + L3 - this.state.y; }
  sync() {
    for (const c of this.cabins) {
      c.pos.set(c.x, this.cabinY(c.i), TOP_LIFT.z);
      c.root.position.copy(c.pos);
      const slide = this.doorFor(c.i) * (c.shell.doorW / 2 - 0.05);
      c.shell.leafL.position.z = c.shell.doorW / 4 + slide;
      c.shell.leafR.position.z = -c.shell.doorW / 4 - slide;
    }
    const top = L3 + 3.2;
    for (const m of this.cables) {
      const y = this.cabinY(m.userData.cable) + TOP_LIFT.height + 0.3;
      m.position.y = y;
      m.scale.y = Math.max(0.01, top - y);
    }
  }
  doorFor(i) { return this.door; void i; }

  riding(p, y) {
    for (const c of this.cabins) {
      if (Math.abs(p.x - c.pos.x) < TOP_LIFT.size / 2 && Math.abs(p.z - c.pos.z) < TOP_LIFT.size / 2 &&
          y > c.pos.y - 0.6 && y < c.pos.y + TOP_LIFT.height) return c;
    }
    return null;
  }
  floorAt(x, z) {
    let best = null;
    for (const c of this.cabins) {
      if (Math.abs(x - c.pos.x) <= TOP_LIFT.size / 2 + 0.05 && Math.abs(z - c.pos.z) <= TOP_LIFT.size / 2 + 0.05) {
        best = best === null ? c.pos.y : Math.max(best, c.pos.y);
      }
    }
    return best;
  }
  collide(p, r, y0, y1) {
    let hit = false;
    const S = TOP_LIFT.size / 2;
    const open = this.door > 0.85;
    for (const c of this.cabins) {
      if (y1 < c.pos.y || y0 > c.pos.y + TOP_LIFT.height) continue;
      const lx = p.x - c.pos.x, lz = p.z - c.pos.z;
      const inside = Math.abs(lx) < S && Math.abs(lz) < S;
      let nx = lx, nz = lz;
      const halfDoor = c.shell.doorW / 2 * this.door;
      if (inside) {
        if (nx > S - r) nx = S - r;
        if (nx < -S + r) nx = -S + r;
        if (nz < -S + r) nz = -S + r;
        if (nz > S - r && !(open && Math.abs(lx) < halfDoor - r * 0.5)) nz = S - r;
      } else {
        const cx = Math.max(-S, Math.min(lx, S)), cz = Math.max(-S, Math.min(lz, S));
        const ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
        const through = open && lz > S - 0.01 && Math.abs(lx) < halfDoor - r * 0.5;
        if (d < r && !through) { if (d > 1e-6) { nx = cx + ex / d * r; nz = cz + ez / d * r; } else nz = S + r; }
      }
      if (nx !== lx || nz !== lz) { p.x = c.pos.x + nx; p.z = c.pos.z + nz; hit = true; }
    }
    // landing gates in front of each shaft at both levels
    for (const lvl of [L2, L3]) {
      if (y1 < lvl || y0 > lvl + 2.2) continue;
      for (const c of this.cabins) {
        const docked = this.mode !== 'moving' && Math.abs(c.pos.y - lvl) < 0.05 && open;
        if (docked) continue;
        const gz = S + 0.3;
        if (Math.abs(p.x - c.pos.x) < S && Math.abs(p.z - gz) < r + 0.05) {
          p.z = p.z > gz ? gz + r + 0.05 : gz - r - 0.05;
          hit = true;
        }
      }
    }
    return hit;
  }

  request(i) {
    // i: 0 → cabin A at L2, 1 → cabin A at L3 (the twin goes the other way)
    if (i === this.stopIndex && this.mode !== 'moving') { if (this.mode !== 'open') this.mode = 'opening'; return false; }
    this.target = i;
    if (this.mode === 'open' || this.mode === 'opening') this.mode = 'closing';
    else if (this.mode === 'idle') this.mode = 'moving';
    return true;
  }
  /** The player calls: move so that a cabin is docked at their level. */
  callTo(level) {
    for (const c of this.cabins) if (Math.abs(this.cabinY(c.i) - level) < 0.05) { if (this.mode !== 'open') this.mode = 'opening'; return false; }
    return this.request(this.stopIndex === 0 ? 1 : 0);
  }

  update(dt, speedUp = 1) {
    for (const c of this.cabins) c.prev.copy(c.pos);
    this.events = [];
    if (this.mode === 'closing') {
      this.door = Math.max(0, this.door - dt / DOOR_TIME);
      if (this.door === 0) { this.mode = this.target !== null ? 'moving' : 'idle'; if (this.mode === 'moving') this.events.push('depart'); }
    } else if (this.mode === 'opening') {
      this.door = Math.min(1, this.door + dt / DOOR_TIME);
      if (this.door === 1) this.mode = 'open';
    } else if (this.mode === 'moving') {
      const ty = this.target === 0 ? L2 : L3;
      const done = easeMotion(this.state, ty, dt, 6.0 * speedUp, 0.7 * speedUp);
      if (done) { this.stopIndex = this.target; this.target = null; this.mode = 'opening'; this.events.push('arrive'); }
    }
    this.sync();
    for (const c of this.cabins) c.delta.subVectors(c.pos, c.prev);
  }
  get speed() { return Math.abs(this.state.v); }
}

function mergeList(geos) {
  // tiny local merge (all BoxGeometry-like, indexed)
  let vcount = 0, icount = 0;
  for (const g of geos) { vcount += g.attributes.position.count; icount += g.index.count; }
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2);
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export const LIFT_COLORS = {
  E: paintAt(new THREE.Color(), 0, 1).set('#c89b3c'),
  W: new THREE.Color('#9c3a2c'),
};
