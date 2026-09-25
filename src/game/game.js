import * as THREE from 'three';
import { L1, L2, L3, L3_UP } from '../tower/profile.js';
import { Player } from './player.js';

const yawToward = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));

export function makePlaces(stations) {
  const e = stations.E ? stations.E.door : [46, 46];
  return {
    champ: { label: '战神广场', pos: [0, 0, 262], yaw: 0, pitch: 0.22 },
    base: { label: '塔下', pos: [22, 0, 27], yaw: yawToward(22, 27, e[0], e[1]), pitch: 0.34 },
    L1: { label: '一层', pos: [0, L1, 30.6], yaw: Math.PI, pitch: -0.08 },
    L2: { label: '二层', pos: [3, L2, 17.4], yaw: Math.PI, pitch: -0.12 },
    top: { label: '塔顶', pos: [0, L3_UP, 7.3], yaw: Math.PI, pitch: -0.2 },
  };
}

const FACTS = {
  L1: ['Premier étage · 57 m', '一层观景台', '脚下是透明玻璃地板，57 米下方即塔底广场。外侧檐口镌刻着 72 位法国科学家与工程师的名字。'],
  L2: ['Deuxième étage · 115 m', '二层观景台', '在中央大厅换乘直达塔顶的双厢电梯 —— 两部轿厢互为配重，一升一降。'],
  L3: ['Le Sommet · 276 m', '塔顶观景廊', '东南方是战神广场与军事学校，西北方隔塞纳河是夏乐宫。沿楼梯可登上露天平台。'],
  L3UP: ['La Terrasse · 280 m', '塔顶露天平台', '古斯塔夫·埃菲尔的私人公寓就在这里。按住右键可用望远镜眺望远处地标。'],
};

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // renderer, scene, camera, atmo, collision, lifts, duo, hud, input, audio, landmarks, places
    this.player = new Player(this.camera, this.collision);
    this.player.onStep = (tag, speed) => {
      const surface = tag === 'ground' || tag === 'ramp' || tag === 'station' ? 'ground' : (tag && (tag.delta || tag.cabins)) ? 'lift' : 'deck';
      this.audio.step(surface, speed);
    };
    this.clock = new THREE.Clock();
    this.t = 0;
    this.running = false;
    this.labelsOn = true;
    this.fpsAcc = 0; this.fpsN = 0;
    this.lastZone = null;
    this.insideLift = null;
    this.visited = new Set();
  }

  spawn(name) {
    const p = this.places[name] || this.places.champ;
    this.player.teleport(p.pos[0], p.pos[1], p.pos[2], p.yaw, p.pitch);
    this.lastZone = null;
  }

  zoneOf() {
    const p = this.player.pos;
    const y = p.y;
    if (this.insideLift) return { key: 'lift', fr: this.insideLift.fr, cn: this.insideLift.cn };
    if (y > L3_UP - 0.6) return { key: 'L3UP', fr: 'SOMMET · TERRASSE', cn: '塔顶露天平台' };
    if (y > L3 - 0.8) return { key: 'L3', fr: 'SOMMET · 276 M', cn: '塔顶观景廊' };
    if (y > L2 - 0.8) return { key: 'L2', fr: 'DEUXIÈME ÉTAGE', cn: '二层观景台' };
    if (y > L1 - 0.8) return { key: 'L1', fr: 'PREMIER ÉTAGE', cn: '一层观景台' };
    const r = Math.hypot(p.x, p.z);
    if (r < 72) return { key: 'parvis', fr: 'PARVIS', cn: '塔底广场' };
    if (p.z > 60 && Math.abs(p.x) < 180 && p.z < 1050) return { key: 'champ', fr: 'CHAMP DE MARS', cn: '战神广场' };
    if (p.z < -60) return { key: 'seine', fr: 'QUAI BRANLY', cn: '塞纳河畔' };
    return { key: 'paris', fr: 'PARIS · 7E', cn: '巴黎第七区' };
  }

  // ------------------------------------------------------------ lifts
  liftInfoFor(p) {
    for (const l of this.lifts) {
      if (l.contains(p.x, p.z, p.y + 0.5, 0.02)) return { type: 'incline', lift: l };
    }
    if (this.duo) {
      const c = this.duo.riding(p, p.y + 0.5);
      if (c) return { type: 'duo', lift: this.duo, cabin: c };
    }
    return null;
  }

  selectStop(info, i) {
    if (info.type === 'incline') {
      if (info.lift.request(i)) this.audio.doors();
    } else {
      const wantTop = i === 1;
      const target = info.cabin.i === 0 ? (wantTop ? 1 : 0) : (wantTop ? 0 : 1);
      if (info.lift.request(target)) this.audio.doors();
    }
  }

  nearestLanding() {
    const p = this.player.pos;
    let best = null;
    for (const l of this.lifts) {
      l.stops.forEach((s, i) => {
        if (Math.abs(p.y - s.y) > 1.6) return;
        const pt = l.rail.pointAtHeight(s.y);
        const gx = pt.x - l.rail.dirOut.x * 3.6, gz = pt.z - l.rail.dirOut.z * 3.6;
        const d = Math.hypot(p.x - gx, p.z - gz);
        if (d < 4.2 && (!best || d < best.d)) best = { d, lift: l, i, type: 'incline' };
      });
    }
    if (this.duo) {
      for (const lvl of [L2, L3]) {
        if (Math.abs(p.y - lvl) > 1.6) continue;
        for (const c of this.duo.cabins) {
          const d = Math.hypot(p.x - c.x, p.z - 2.6);
          if (d < 3.4 && (!best || d < best.d)) best = { d, lift: this.duo, lvl, cabin: c, type: 'duo' };
        }
      }
    }
    return best;
  }

  updateInteraction() {
    const p = this.player.pos, input = this.input, hud = this.hud;
    const info = this.liftInfoFor(p);
    const wasInside = this.insideLift;
    if (info) {
      const l = info.lift;
      const name = info.type === 'incline' ? l.label : '塔顶直达电梯';
      this.insideLift = { fr: info.type === 'incline' ? 'ASCENSEUR ' + (l.name === 'E' ? 'EST' : 'OUEST') : 'ASCENSEUR DU SOMMET', cn: name };
      const stops = info.type === 'incline'
        ? l.stops.map((s) => ({ short: s.short, btn: s.label.split(' · ')[0], tick: s.short === '0' ? '0 m' : s.label.split(' · ')[1] }))
        : [{ short: '2', btn: '二层', tick: '115 m' }, { short: '3', btn: '塔顶', tick: '276 m' }];
      // current stop index from the player's cabin perspective
      let cur, dest = null, alt, prog;
      if (info.type === 'incline') {
        cur = l.stopIndex; dest = l.target; alt = l.altitude;
        prog = (l.rail.distance(l.stops[0].y, alt)) / l.rail.distance(l.stops[0].y, l.stops[2].y);
      } else {
        alt = info.cabin.pos.y;
        cur = alt > (L2 + L3) / 2 ? 1 : 0;
        if (l.target !== null) {
          const aUp = l.target === 1;
          dest = (info.cabin.i === 0) === aUp ? 1 : 0;
        }
        prog = (alt - L2) / (L3 - L2);
      }
      const moving = l.mode === 'moving';
      const state = moving ? (this.input.running() ? '▲▼ 运行中 · 加速 ×3' : '运行中 · 按住 Shift 加速')
        : l.mode === 'closing' ? '关门中…' : l.mode === 'opening' ? '开门中…' : '请选择楼层';
      hud.liftPanel({
        key: name, name, stops, current: moving ? -1 : cur, dest, alt, speed: l.speed,
        angle: info.type === 'incline' ? THREE.MathUtils.radToDeg(l.inclination || 0) : 90,
        progress: Math.max(0, Math.min(1, prog)), state,
        onSelect: (i) => this.selectStop(this.liftInfoFor(this.player.pos) || info, i),
      });
      // keyboard floor selection
      const keys = info.type === 'incline' ? ['Digit0', 'Digit1', 'Digit2'] : ['Digit2', 'Digit3'];
      const alt2 = info.type === 'incline' ? ['Numpad0', 'Numpad1', 'Numpad2'] : ['Numpad2', 'Numpad3'];
      keys.forEach((k, i) => { if (input.hit(k) || input.hit(alt2[i])) this.selectStop(info, i); });
      if (input.hit('KeyE') && !moving) {
        const n = stops.length;
        const next = cur === n - 1 ? 0 : cur + 1;
        this.selectStop(info, next);
      }
      hud.prompt(moving ? null : `<kbd>${info.type === 'incline' ? '0 1 2' : '2 3'}</kbd>选择楼层 &nbsp; <kbd>E</kbd>下一站`);
      if (!wasInside) hud.toast(info.type === 'incline' ? '已进入电梯 · 按 1 / 2 前往一层或二层' : '已进入塔顶电梯 · 按 3 直达塔顶');
      return info;
    }
    this.insideLift = null;
    hud.liftPanel(null);
    const land = this.nearestLanding();
    if (land) {
      const l = land.lift;
      let docked;
      if (land.type === 'incline') docked = l.mode !== 'moving' && l.stopIndex === land.i && l.door > 0.5;
      else docked = l.mode !== 'moving' && Math.abs(land.cabin.pos.y - land.lvl) < 0.05 && l.door > 0.5;
      const title = land.type === 'incline' ? l.label : '塔顶直达电梯';
      if (docked) hud.prompt(`${title} · 门已开启，请进入`);
      else if (l.mode === 'moving' || l.mode === 'closing') hud.prompt(`${title} · 电梯运行中，请稍候…`);
      else hud.prompt(`<kbd>E</kbd>呼叫${title}`);
      if (input.hit('KeyE') && !docked) {
        if (land.type === 'incline') l.request(land.i);
        else l.callTo(land.lvl);
        this.audio.tone(988, 0.25, 0.05);
        hud.toast('已呼叫电梯');
      }
    } else {
      hud.prompt(null);
    }
    return null;
  }

  onLiftEvents(l) {
    if (!l.events || !l.events.length) return;
    const p = this.player.pos;
    for (const ev of l.events) {
      if (ev === 'arrive') {
        this.audio.chime();
        this.audio.doors();
        const rider = this.liftInfoFor(p);
        if (rider && rider.lift === l) {
          const y = rider.type === 'incline' ? l.altitude : rider.cabin.pos.y;
          const key = y > L3 - 1 ? 'L3' : y > L2 - 1 ? 'L2' : y > L1 - 1 ? 'L1' : null;
          if (key) this.hud.caption(...FACTS[key]);
          else this.hud.caption('Parvis · 0 m', '塔底广场', '欢迎再次光临。');
        }
      }
    }
  }

  // ------------------------------------------------------------ frame
  frame() {
    const dtRaw = this.clock.getDelta();
    const dt = Math.min(dtRaw, 1 / 20);
    this.t += dt;
    const input = this.input;
    if (this.running) {
      const zoomK = this.input.zoomHeld ? 0.3 : 1;
      const l = input.consumeLook();
      this.player.look(l.x, l.y, input.sensitivity, zoomK);
      const speedUp = input.running() && this.insideLift ? 3 : 1;
      for (const lift of this.lifts) { lift.update(dt, speedUp); this.onLiftEvents(lift); }
      if (this.duo) { this.duo.update(dt, speedUp); this.onLiftEvents(this.duo); }
      this.player.update(dt, input);
      const info = this.updateInteraction();
      // lift feel: acceleration + vibration
      if (info) {
        const acc = info.type === 'incline' ? info.lift.state.a : (info.cabin.i === 0 ? 1 : -1) * info.lift.state.a;
        this.player.liftFeel(dt, acc, info.lift.speed);
      } else this.player.liftFeel(dt, 0, 0);
      if (input.hit('KeyL')) { this.labelsOn = !this.labelsOn; this.hud.toast(this.labelsOn ? '地标标注：开' : '地标标注：关'); }
      if (input.hit('KeyH')) this.hud.toggleHidden();
      if (input.hit('KeyT')) this.onCycleTime && this.onCycleTime();
      // zone captions (first visit)
      const z = this.zoneOf();
      if (z.key !== this.lastZone) {
        if (FACTS[z.key] && !this.visited.has(z.key) && this.lastZone !== null && this.lastZone !== 'lift') {
          this.hud.caption(...FACTS[z.key]);
        }
        if (FACTS[z.key]) this.visited.add(z.key);
        this.lastZone = z.key;
      }
      this.hud.location(z.fr, z.cn, Math.max(0, this.player.pos.y));
      this.audio.update(dt, {
        altitude: this.player.pos.y, liftSpeed: info ? info.lift.speed : 0, liftActive: !!info && info.lift.mode === 'moving',
        night: this.atmo.preset === 'night', underTower: Math.hypot(this.player.pos.x, this.player.pos.z) < 70,
      });
    }
    this.player.applyCamera(this.t, this.running && this.input.zoomHeld);
    this.hud.scope(this.running && this.input.zoomHeld);
    // compass: heading from yaw, north-based
    const heading = this.bearingOfYaw(this.player.yaw);
    this.hud.compass(heading, (lm) => this.bearingTo(lm.pos));
    this.world && this.world.update && this.world.update(dt, this.camera, this);
    this.landmarks && this.landmarks.update(this.camera, this.labelsOn || this.input.zoomHeld, this.player.pos);
    this.atmo.update(dt, this.camera);
    this.governor && this.governor.frame(dtRaw * 1000);
    this.renderer.render(this.scene, this.camera);
    input.endFrame();
    this.fpsAcc += dtRaw; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      const r = this.renderer.info.render;
      this.hud.fps(`${Math.round(this.fpsN / this.fpsAcc)} fps · ${r.calls} dc · ${(r.triangles / 1e6).toFixed(2)} M△`);
      this.fpsAcc = 0; this.fpsN = 0;
    }
  }

  /** Compass bearing (deg, clockwise from north) of the camera heading. */
  bearingOfYaw(yaw) {
    // forward = (-sin yaw, -cos yaw) in tower frame; +z has bearing BZ
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    return this.bearingOfVec(fx, fz);
  }
  bearingOfVec(x, z) {
    // tower frame: bearing(+z) = BZ, bearing(+x) = BZ - 90
    const rel = Math.atan2(-x, z) * 180 / Math.PI; // angle from +z towards -x (clockwise from above)
    return ((this.bearingZ + rel) % 360 + 360) % 360;
  }
  bearingTo(pos) { return this.bearingOfVec(pos[0] - this.player.pos.x, pos[2] - this.player.pos.z); }
}
