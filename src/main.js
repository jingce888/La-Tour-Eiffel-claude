// La Tour Eiffel — boot sequence: progressive world generation behind a
// loader, then the start menu, then the game loop.
import * as THREE from 'three';
import { quality, QUALITY_LEVELS, storeQuality } from './core/quality.js';
import { createRenderer, ResolutionGovernor } from './core/renderer.js';
import { Input } from './core/input.js';
import { AudioFX } from './core/audio.js';
import { mergeStatic } from './core/merge.js';
import { Atmosphere, TIMES } from './world/atmosphere.js';
import { buildWorld } from './world/world.js';
import { MemberSet } from './tower/lattice.js';
import { buildStructure } from './tower/structure.js';
import { towerMaterials, paintAt } from './tower/materials.js';
import { buildFloors } from './tower/floors.js';
import { buildSummit } from './tower/summit.js';
import { buildBase } from './tower/base.js';
import { InclineRail } from './tower/rails.js';
import { TOWER_NIGHT, addTowerGlow, buildSparkles, buildBeacon } from './tower/night.js';
import { L1, L2, L3, L3_UP } from './tower/profile.js';
import { CollisionWorld } from './game/collision.js';
import { InclineLift, DuoLift } from './game/elevators.js';
import { Game, makePlaces } from './game/game.js';
import { Hud } from './ui/hud.js';

const TOWER_BEARING_Z = 134.2; // compass bearing of the tower's +z axis (towards École Militaire)
const Q = new URLSearchParams(location.search);
const SHOT = Q.has('shot');
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function progress(frac, text) {
  $('ld-fill').style.width = `${Math.round(frac * 100)}%`;
  $('ld-status').textContent = text;
  document.querySelector('.ld-tower').style.setProperty('--draw', String(1 - frac));
}

async function boot() {
  progress(0.02, '初始化渲染器…');
  await nextFrame();
  const renderer = createRenderer($('app'));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 60000);
  const collision = new CollisionWorld();
  const atmo = new Atmosphere(renderer, scene, TOWER_BEARING_Z);
  atmo.setTime(Q.get('time') || 'golden');

  // ---------------------------------------------------------------- tower
  progress(0.08, '计算塔身曲线 · 真实比例 330 m');
  await nextFrame();
  const tower = new THREE.Group();
  tower.name = 'tower';
  scene.add(tower);
  const rails = { E: new InclineRail(1, 1), W: new InclineRail(-1, -1) };
  const sets = { chords: new MemberSet('chords'), braces: new MemberSet('braces') };
  buildStructure(sets, { elevatorLegs: ['E', 'W'] });
  const M = towerMaterials();
  const color = (out, y, shade, i) => paintAt(out, y, shade, i);
  tower.add(sets.chords.build(M.chords, color, { depthMaterial: M.chordsDepth }));
  tower.add(sets.braces.build(M.braces, color, { depthMaterial: M.bracesDepth }));
  const memberCount = sets.chords.count + sets.braces.count;
  progress(0.2, `生成格构杆件 · ${memberCount.toLocaleString()} 根`);
  await nextFrame();

  buildFloors({ group: tower, collision, rails, materials: M });
  progress(0.28, '一层、二层平台与 72 位科学家的名字');
  await nextFrame();
  buildSummit({ group: tower, collision, towerBearingZ: TOWER_BEARING_Z });
  const base = buildBase({ group: tower, collision, rails });
  const merged = mergeStatic(tower);
  // night illumination: every painted tower surface glows gold from within
  const glowDone = new Set();
  tower.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (glowDone.has(m) || m.transparent || !/^(tower-|arch-|frieze)/.test(m.name || '')) continue;
      glowDone.add(m);
      addTowerGlow(m);
    }
  });
  const sparkles = buildSparkles(scene, [...sets.chords.rec, ...sets.braces.rec]);
  const beacon = buildBeacon(scene);
  progress(0.34, `塔顶与天线 · 合并为 ${merged} 个批次`);
  await nextFrame();

  // collision for the members crossing every walkable level
  for (const lvl of [0, L1, L2, L3, L3_UP]) {
    collision.addMembersAtLevel(sets.chords.rec, lvl);
    collision.addMembersAtLevel(sets.braces.rec, lvl);
  }

  // ---------------------------------------------------------------- lifts
  const liftGlass = new THREE.MeshStandardMaterial({ color: 0xb8cdd0, roughness: 0.03, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 0.8, side: THREE.DoubleSide });
  const lifts = [
    new InclineLift({ name: 'E', label: '东塔柱电梯', rail: rails.E, color: 0xc4952f, collision, scene, glassMat: liftGlass }),
    new InclineLift({ name: 'W', label: '西塔柱电梯', rail: rails.W, color: 0x9a3b2c, collision, scene, glassMat: liftGlass }),
  ];
  const duo = new DuoLift({ collision, scene, glassMat: liftGlass });
  progress(0.4, '安装斜行电梯与塔顶双厢电梯');
  await nextFrame();

  // ---------------------------------------------------------------- Paris
  const world = await buildWorld({ scene, renderer, collision, atmo, progress: (f, t) => progress(0.4 + f * 0.5, t), nextFrame, groundHoles: Object.values(base.stations).map((st) => st.pit) });

  // ---------------------------------------------------------------- game
  const input = new Input(renderer.domElement);
  const hud = new Hud();
  const audio = new AudioFX();
  const places = makePlaces(base.stations);
  const game = new Game({
    renderer, scene, camera, atmo, collision, lifts, duo, hud, input, audio, places, world,
    landmarks: world.landmarks, bearingZ: TOWER_BEARING_Z, governor: SHOT ? null : new ResolutionGovernor(renderer),
  });
  if (world.landmarks) hud.setCompassLandmarks(world.landmarks.compassList());
  game.spawn(Q.get('spawn') || 'champ');
  if (Q.get('cam')) {
    const c = Q.get('cam').split(',').map(Number);
    game.player.teleport(c[0], c[1], c[2], c[3] || 0, c[4] || 0);
    game.player.eyeSmooth = c.length > 5 ? c[5] : 1.64;
  }
  if (Q.get('fov')) game.player.fovBase = game.player.fov = +Q.get('fov');
  // test hooks: park a lift somewhere with the player inside
  if (Q.get('ride')) {
    const [name, y] = Q.get('ride').split(':');
    const l = name === 'top' ? duo : lifts.find((x) => x.name === name);
    if (l === duo) {
      duo.state.y = +y || L2; duo.mode = 'moving'; duo.target = 1; duo.door = 0; duo.sync();
      game.player.teleport(duo.cabins[0].pos.x, duo.cabins[0].pos.y, 0.3, Math.PI, 0);
    } else if (l) {
      l.state.y = +y || 20; l.mode = 'moving'; l.target = 2; l.door = 0; l.sync();
      game.player.teleport(l.pos.x + l.rail.dirOut.x * 0.8, l.pos.y, l.pos.z + l.rail.dirOut.z * 0.8, Math.atan2(l.rail.dirOut.x, l.rail.dirOut.z), 0.1);
    }
    game.player.groundTag = null;
  }
  // test hook: park a lift at one of its stops with the doors open (?park=E:1)
  if (Q.get('park')) {
    const [name, i] = Q.get('park').split(':');
    const l = lifts.find((x) => x.name === name);
    if (l && l.stops[+i]) { l.state.y = l.stops[+i].y; l.stopIndex = +i; l.mode = 'open'; l.door = 1; l.target = null; l.sync(); }
  }

  progress(0.94, '编译着色器…');
  await nextFrame();
  try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
  progress(1, '准备就绪');

  // time-of-day cycling
  const times = Object.keys(TIMES);
  function setTime(name) {
    atmo.setTime(name);
    world.setTime && world.setTime(name);
    const night = name === 'night';
    TOWER_NIGHT.glow.value = night ? 1 : 0;
    beacon.visible = night;
    sparkles.visible = night;
    document.querySelectorAll('#chips-time .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === name));
  }
  game.onCycleTime = () => {
    const i = (times.indexOf(atmo.preset) + 1) % times.length;
    setTime(times[i]);
    hud.toast(`时间：${TIMES[times[i]].label}`);
  };
  setTime(atmo.preset);
  // night show: the tower sparkles for 20 s at the start of every minute
  game.onFrame = (dt, t) => {
    TOWER_NIGHT.time.value = t;
    beacon.rotation.y += dt * 0.42;
    const cyc = t % 60;
    TOWER_NIGHT.sparkle.value = cyc < 20 ? Math.min(1, cyc / 1.5, (20 - cyc) / 1.5) : 0;
  };

  // ---------------------------------------------------------------- menu
  const chips = (id, items, current, onPick) => {
    const box = $(id);
    box.innerHTML = '';
    for (const [v, label] of items) {
      const b = document.createElement('button');
      b.className = 'chip' + (v === current ? ' on' : '');
      b.dataset.v = v;
      b.textContent = label;
      b.addEventListener('click', () => { onPick(v); box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); });
      box.append(b);
    }
  };
  chips('chips-time', times.map((k) => [k, TIMES[k].label]), atmo.preset, (v) => setTime(v));
  const qLabels = { low: '流畅', medium: '均衡', high: '高清', ultra: '极致' };
  chips('chips-quality', QUALITY_LEVELS.map((k) => [k, qLabels[k]]), quality.level, (v) => {
    if (v === quality.level) return;
    storeQuality(v);
    const u = new URL(location.href); u.searchParams.delete('quality');
    location.replace(u.toString());
  });
  chips('chips-spawn', Object.entries(places).map(([k, p]) => [k, p.label]), Q.get('spawn') || 'champ', (v) => game.spawn(v));
  $('mn-note').textContent = `画质：${qLabels[quality.level]} · 塔身杆件 ${memberCount.toLocaleString()} 根${world.stats ? ' · ' + world.stats : ''}`;

  let started = false;
  const menu = $('menu');
  const showMenu = (v) => {
    menu.classList.toggle('hidden', !v);
    game.running = !v;
    input.enabled = !v;
    $('touch').classList.toggle('on', !v && input.isTouch);
    if (!v) game.clock.getDelta();
  };
  $('btn-start').addEventListener('click', () => {
    audio.start();
    if (!started) {
      started = true;
      $('start-hint').textContent = 'Reprendre la visite';
      $('btn-start').querySelector('span').textContent = '继续游览';
    }
    showMenu(false);
    input.requestLock();
    hud.show(true);
  });
  input.onLockChange = (locked) => { if (!locked && game.running && !input.isTouch) showMenu(true); };
  addEventListener('keydown', (e) => {
    if (e.code === 'F3') $('fps').classList.toggle('hidden');
  });
  $('touch').addEventListener('touchstart', (e) => {
    const b = e.target.closest && e.target.closest('[data-act="Escape"]');
    if (b) showMenu(true);
  }, { passive: true });
  input.attachTouch(document.body);
  renderer.domElement.addEventListener('click', () => { if (game.running && !input.locked) input.requestLock(); });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    game.governor && game.governor.resize();
  });

  // loader → menu
  if (SHOT) $('loader').remove();
  else {
    $('loader').classList.add('out');
    setTimeout(() => $('loader').remove(), 1000);
  }
  if (SHOT) {
    hud.show(!Q.has('nohud'));
    game.running = true;
    input.enabled = true;
    const frames = +(Q.get('frames') || 3);
    for (let i = 0; i < frames; i++) game.frame();
    window.__info = { members: memberCount, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ...(world.info || {}) };
    window.__ready = true;
    window.__game = game;
    return;
  }
  menu.classList.remove('hidden');
  renderer.setAnimationLoop(() => game.frame());
}

boot().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
  const s = document.getElementById('ld-status');
  if (s) s.textContent = '加载失败：' + (e && e.message ? e.message : e);
});
