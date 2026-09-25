// Ground level of the tower: masonry piers under every chord foot, the paved
// parvis, and the East / West pillar lift stations.
import * as THREE from 'three';
import { H, C } from './profile.js';
import { STATION_Y, CABIN } from './rails.js';
import { canvas, toTexture } from '../world/textures.js';

function signTexture(title, sub) {
  const cv = canvas(1024, 256), g = cv.getContext('2d');
  g.fillStyle = '#1d1a17'; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = '#c9a45a'; g.lineWidth = 6; g.strokeRect(10, 10, 1004, 236);
  g.fillStyle = '#f0e2bf'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 86px "Didot","Bodoni 72","Times New Roman",serif';
  g.fillText(title, 512, 100);
  g.fillStyle = '#c9a45a';
  g.font = '500 48px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
  g.fillText(sub, 512, 190);
  return toTexture(cv, { repeat: false });
}

export function buildBase({ group, collision, rails }) {
  // ---------------------------------------------------------------- masonry piers
  const stone = new THREE.MeshStandardMaterial({ color: 0xb3a791, roughness: 0.92 });
  const pierGeo = new THREE.BoxGeometry(1, 1, 1);
  const piers = new THREE.InstancedMesh(pierGeo, stone, 16 * 2);
  const M = new THREE.Matrix4();
  let n = 0;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    const pts = [[H(0), H(0)], [H(0), C(0)], [C(0), H(0)], [C(0), C(0)]];
    for (const [a, b] of pts) {
      const x = sx * a, z = sz * b;
      M.compose(new THREE.Vector3(x, 0.55, z), new THREE.Quaternion(), new THREE.Vector3(3.4, 1.1, 3.4));
      piers.setMatrixAt(n++, M);
      M.compose(new THREE.Vector3(x, 1.3, z), new THREE.Quaternion(), new THREE.Vector3(2.6, 0.4, 2.6));
      piers.setMatrixAt(n++, M);
      collision.addBox(x - 1.75, x + 1.75, z - 1.75, z + 1.75, 0, 1.5);
    }
  }
  piers.castShadow = piers.receiveShadow = true;
  group.add(piers);

  // ---------------------------------------------------------------- lift stations
  const plat = new THREE.MeshStandardMaterial({ color: 0x9c958a, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171512, roughness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.55, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xaac0c4, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 0.7 });
  const labels = { E: ['PILIER EST', '东塔柱 · 观光电梯'], W: ['PILIER OUEST', '西塔柱 · 观光电梯'] };
  const stations = {};
  for (const [name, rail] of Object.entries(rails)) {
    const sx = rail.sx, sz = rail.sz;
    const lo = C(0) + 5, hi = C(0) + 15.5;      // platform square inside the leg
    const x0 = sx * lo, x1 = sx * hi, z0 = sz * lo, z1 = sz * hi;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = hi - lo;
    // platform slab with the pit for the cabin carved as a separate dark box
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, STATION_Y, w), plat);
    slab.position.set(cx, STATION_Y / 2, cz);
    slab.receiveShadow = true;
    group.add(slab);
    collision.addRect(x0, x1, z0, z1, STATION_Y, 'station');
    // ramps towards the tower centre
    const rampLen = 3.2;
    const rx = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.1, w), plat);
    rx.position.set(sx * (lo - rampLen / 2), STATION_Y / 2 - 0.05, cz);
    rx.rotation.z = sx * Math.atan2(STATION_Y, rampLen);
    const rz = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, rampLen), plat);
    rz.position.set(cx, STATION_Y / 2 - 0.05, sz * (lo - rampLen / 2));
    rz.rotation.x = -sz * Math.atan2(STATION_Y, rampLen);
    rx.receiveShadow = rz.receiveShadow = true;
    group.add(rx, rz);
    collision.addRamp(sx * (lo - rampLen), sx * lo, z0, z1, 0, STATION_Y, 'x', 'ramp');
    collision.addRamp(x0, x1, sz * (lo - rampLen), sz * lo, 0, STATION_Y, 'z', 'ramp');
    // cabin pit: hole in the platform where the rails dive into the ground
    const r0 = rail.radial(STATION_Y);
    const hu0 = r0 - CABIN.along / 2 - 0.3, hu1 = r0 + CABIN.along / 2 + 3.5, hv = CABIN.across / 2 + 0.3;
    const pc = [rail.toXZ(hu0, -hv), rail.toXZ(hu1, -hv), rail.toXZ(hu1, hv), rail.toXZ(hu0, hv)];
    collision.addPolyHole(pc, -2, STATION_Y + 0.5);
    const pitShape = new THREE.Shape(pc.map(([x, z]) => new THREE.Vector2(x, z)));
    const pitGeo = new THREE.ShapeGeometry(pitShape);
    pitGeo.rotateX(Math.PI / 2);
    const idx = pitGeo.index;
    for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
    const pit = new THREE.Mesh(pitGeo, dark);
    pit.position.y = STATION_Y + 0.012;
    group.add(pit);
    // fences around the pit (the door side is gated by the lift)
    for (let i = 1; i < 4; i++) {
      const a = pc[i], b = pc[(i + 1) % 4];
      collision.addSeg(a[0], a[1], b[0], b[1], 0.08, STATION_Y, STATION_Y + 1.2);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const rail3d = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), steel);
      rail3d.position.set((a[0] + b[0]) / 2, STATION_Y + 1.05, (a[1] + b[1]) / 2);
      rail3d.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      group.add(rail3d);
      for (let t = 0; t <= 1.001; t += 0.25) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), steel);
        post.position.set(a[0] + (b[0] - a[0]) * t, STATION_Y + 0.52, a[1] + (b[1] - a[1]) * t);
        group.add(post);
      }
    }
    // canopy over the boarding area + sign
    const doorU = r0 - CABIN.along / 2;
    const cU = doorU - 2.8;
    const [ccx, ccz] = rail.toXZ(cU, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.2, 5.5), steel);
    roof.position.set(ccx, 3.9, ccz);
    roof.rotation.y = -Math.atan2(rail.dirOut.z, rail.dirOut.x);
    roof.castShadow = true;
    const roofGlass = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.05, 5.2), glass);
    roofGlass.position.set(ccx, 4.05, ccz); roofGlass.rotation.y = roof.rotation.y;
    group.add(roof, roofGlass);
    for (const [du, dv] of [[-3, -2.5], [-3, 2.5], [2.9, -2.5], [2.9, 2.5]]) {
      const [px, pz] = rail.toXZ(cU + du, dv);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.9, 8), steel);
      post.position.set(px, 1.95, pz);
      post.castShadow = true;
      group.add(post);
      collision.addSeg(px, pz, px, pz, 0.15, 0, 4);
    }
    const [title, sub] = labels[name] || ['ASCENSEUR', '观光电梯'];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: signTexture(title, sub), roughness: 0.6, emissive: 0xffffff, emissiveMap: signTexture(title, sub), emissiveIntensity: 0.25 }));
    const [sxp, szp] = rail.toXZ(cU - 2.95, 0);
    sign.position.set(sxp, 3.35, szp);
    sign.rotation.y = Math.atan2(-rail.dirOut.x, -rail.dirOut.z);
    group.add(sign);
    stations[name] = { door: rail.toXZ(doorU - 1.2, 0), sign: [sxp, szp] };
  }
  return { stations };
}
