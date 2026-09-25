// The tower by night: golden sodium illumination from inside the structure,
// the 20,000 sparkling bulbs (five minutes every hour — here every minute) and
// the rotating beacon at the summit.
import * as THREE from 'three';
import { H, C, L1, L2, L3, IRON_TOP } from './profile.js';

export const TOWER_NIGHT = { glow: { value: 0 }, sparkle: { value: 0 }, time: { value: 0 } };

/** Adds the golden night glow to a tower material (emissive, strongest on inner faces). */
export function addTowerGlow(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.uTowerGlow = TOWER_NIGHT.glow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTGW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vTGW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vTGW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTowerGlow;\nvarying vec3 vTGW;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uTowerGlow > 0.0) {
          // projectors sit inside the legs and shaft: faces turned towards the
          // tower axis and the undersides of the platforms are brightest
          vec3 axisDir = normalize(vec3(-vTGW.x, 0.0, -vTGW.z) + 1e-4);
          vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float inward = clamp(dot(wN, axisDir) * 0.5 + 0.5, 0.0, 1.0);
          float under = clamp(-wN.y, 0.0, 1.0);
          float band = 0.75 + 0.25 * sin(vTGW.y * 0.09);
          float fall = mix(1.0, 0.72, clamp(vTGW.y / 320.0, 0.0, 1.0));
          totalEmissiveRadiance += diffuseColor.rgb * vec3(2.6, 1.55, 0.62) * uTowerGlow * (0.35 + 0.65 * inward + 0.5 * under) * band * fall;
        }`);
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => key + '|glow';
  return material;
}

/** Sparkle bulbs scattered over the lattice. */
export function buildSparkles(scene, memberRec) {
  const pts = [];
  const rnd = mulberry(4);
  for (let o = 0; o < memberRec.length; o += 12) {
    const ax = memberRec[o], ay = memberRec[o + 1], az = memberRec[o + 2];
    const bx = memberRec[o + 3], by = memberRec[o + 4], bz = memberRec[o + 5];
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.floor(len / 3.2);
    for (let k = 0; k < n; k++) {
      if (rnd() > 0.42) continue;
      const t = rnd();
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      // keep bulbs on the outer skin of the tower
      const skin = Math.max(Math.abs(x), Math.abs(z));
      if (y < L2 && skin < H(y) - 1.5 && Math.min(Math.abs(x), Math.abs(z)) > C(y) + 1.5) continue;
      pts.push(x, y, z, rnd());
    }
  }
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(pts);
  const pos = new Float32Array(arr.length / 4 * 3), seed = new Float32Array(arr.length / 4);
  for (let i = 0; i < arr.length / 4; i++) {
    pos[i * 3] = arr[i * 4]; pos[i * 3 + 1] = arr[i * 4 + 1]; pos[i * 3 + 2] = arr[i * 4 + 2]; seed[i] = arr[i * 4 + 3];
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: TOWER_NIGHT.time, uOn: TOWER_NIGHT.sparkle, uScale: { value: innerHeight * 0.5 } },
    vertexShader: /* glsl */`
      attribute float seed;
      uniform float uTime, uOn, uScale;
      varying float vA;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float ph = fract(uTime * (0.9 + seed * 1.7) + seed * 17.0);
        float flash = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.1, 0.22, ph));
        vA = flash * uOn;
        gl_PointSize = vA > 0.01 ? clamp(uScale * 0.55 / -mv.z, 1.5, 9.0) : 0.0;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float core = smoothstep(0.5, 0.0, d);
        float star = max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.0) + max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.0);
        float a = (core * core + star * 0.5) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * 3.0, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.visible = false;
  p.renderOrder = 5;
  scene.add(p);
  addEventListener('resize', () => { m.uniforms.uScale.value = innerHeight * 0.5; });
  return p;
}

/** Rotating beacon: two opposed light beams sweeping the sky from the summit. */
export function buildBeacon(scene) {
  const len = 3200;
  const geo = new THREE.ConeGeometry(160, len, 32, 1, true);
  geo.translate(0, -len / 2, 0);
  geo.rotateZ(Math.PI / 2); // along +x, apex at origin
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOn: TOWER_NIGHT.glow },
    vertexShader: /* glsl */`
      varying float vT;
      varying vec3 vN, vV;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vT = position.x / ${len.toFixed(1)};
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying float vT;
      varying vec3 vN, vV;
      uniform float uOn;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float edge = pow(abs(dot(vN, vV)), 1.6);
        float a = edge * pow(1.0 - clamp(vT, 0.0, 1.0), 2.2) * 0.22 * uOn;
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const g = new THREE.Group();
  const b1 = new THREE.Mesh(geo, mat);
  const b2 = new THREE.Mesh(geo, mat);
  b2.rotation.y = Math.PI;
  g.add(b1, b2);
  g.position.set(0, IRON_TOP - 6.5, 0);
  g.rotation.z = 0.06;
  g.visible = false;
  g.renderOrder = 6;
  g.traverse((o) => { o.frustumCulled = false; });
  scene.add(g);
  return g;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { L1, L3 };
