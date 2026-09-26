// Ground level of the tower: masonry piers under every chord foot, the paved
// parvis, and the East / West pillar lift stations.
import * as THREE from 'three';
import { H, C } from './profile.js';
import { STATION_Y } from './rails.js';
import { shaftLanding, buildShaftRailing } from './shaft.js';
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
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.55, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xaac0c4, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 0.7 });
  const labels = { E: ['PILIER EST', '东塔柱 · 观光电梯'], W: ['PILIER OUEST', '西塔柱 · 观光电梯'] };
  const stations = {};
  for (const [name, rail] of Object.entries(rails)) {
    const sx = rail.sx, sz = rail.sz;
    const lo = C(0) + 5, hi = C(0) + 15.5;      // platform square inside the leg
    const x0 = sx * lo, x1 = sx * hi, z0 = sz * lo, z1 = sz * hi;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = hi - lo;
    // cabin pit: the opening the cabin rises out of (rails, chassis and the
    // lower half of the running gear stay below the platform while boarding)
    const { poly: pc, hole, sill } = shaftLanding(rail, STATION_Y);
    // platform slab with the pit cut out
    const shape = new THREE.Shape([new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1)]);
    shape.holes.push(new THREE.Path(pc.map(([x, z]) => new THREE.Vector2(x, z))));
    const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: STATION_Y, bevelEnabled: false, curveSegments: 1 });
    slabGeo.rotateX(Math.PI / 2);          // shape (x, y) → world (x, z); extrusion goes down
    slabGeo.translate(0, STATION_Y, 0);
    const slab = new THREE.Mesh(slabGeo, plat);
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
    collision.addPolyHole(pc, -2, STATION_Y + 0.5);
    // pit lining: concrete walls and floor, 3 m deep
    const PIT = 3.0;
    const ry = -Math.atan2(rail.dirOut.z, rail.dirOut.x);
    const pitWalls = [];
    const um = (hole.u0 + hole.u1) / 2, ul = hole.u1 - hole.u0;
    for (const [du, dv, lu, lv] of [[0, -hole.v - 0.1, ul + 0.4, 0.2], [0, hole.v + 0.1, ul + 0.4, 0.2], [-ul / 2 - 0.1, 0, 0.2, 2 * hole.v], [ul / 2 + 0.1, 0, 0.2, 2 * hole.v]]) {
      const [px, pz] = rail.toXZ(um + du, dv);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(lu, PIT, lv), pitMat);
      wall.position.set(px, -PIT / 2, pz);
      wall.rotation.y = ry;
      pitWalls.push(wall);
    }
    const [fx, fz] = rail.toXZ(um, 0);
    const pitFloor = new THREE.Mesh(new THREE.BoxGeometry(ul + 0.4, 0.2, 2 * hole.v + 0.4), pitMat);
    pitFloor.position.set(fx, -PIT - 0.1, fz);
    pitFloor.rotation.y = ry;
    for (const m of [...pitWalls, pitFloor]) { m.receiveShadow = true; group.add(m); }
    // guard rails on three sides + returns beside the doorway (the lift gates the rest)
    buildShaftRailing({ rail, y: STATION_Y, collision, material: steel, group });
    // canopy over the waiting area — kept clear of the cabin, which rises
    // inwards over the landing as it climbs the curved leg
    const doorU = sill;
    const cU = doorU - 5.4;
    const [ccx, ccz] = rail.toXZ(cU, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 5.5), steel);
    roof.position.set(ccx, 3.9, ccz);
    roof.rotation.y = ry;
    roof.castShadow = true;
    const roofGlass = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.05, 5.2), glass);
    roofGlass.position.set(ccx, 4.05, ccz); roofGlass.rotation.y = ry;
    group.add(roof, roofGlass);
    for (const [du, dv] of [[-2.1, -2.5], [-2.1, 2.5], [2.0, -2.5], [2.0, 2.5]]) {
      const [px, pz] = rail.toXZ(cU + du, dv);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.9, 8), steel);
      post.position.set(px, 1.95, pz);
      post.castShadow = true;
      group.add(post);
      collision.addSeg(px, pz, px, pz, 0.15, 0, 4);
    }
    const [title, sub] = labels[name] || ['ASCENSEUR', '观光电梯'];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: signTexture(title, sub), roughness: 0.6, emissive: 0xffffff, emissiveMap: signTexture(title, sub), emissiveIntensity: 0.25 }));
    const [sxp, szp] = rail.toXZ(cU - 2.35, 0);
    sign.position.set(sxp, 3.35, szp);
    sign.rotation.y = Math.atan2(-rail.dirOut.x, -rail.dirOut.z);
    group.add(sign);
    stations[name] = { door: rail.toXZ(doorU - 1.2, 0), sign: [sxp, szp], pit: pc };
  }
  return { stations };
}
