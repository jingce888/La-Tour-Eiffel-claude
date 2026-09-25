// Tower materials & the three-tone paint.
//
// The 20th repainting (2019-2024) returned the tower to the yellow-brown
// ("brun-jaune") Gustave Eiffel chose in 1907.  As always it is applied in
// three shades — darkest at the base, lightest at the top — so the tower reads
// as one colour against the sky.
import * as THREE from 'three';
import { latticeTextures, patchInstancedRepeat, latticeDepthMaterial } from './lattice.js';

const PAINT = {
  base: new THREE.Color('#634a37'),
  mid: new THREE.Color('#775a40'),
  top: new THREE.Color('#8e7053'),
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Paint colour at height y (linear colour space), with per-member jitter. */
export function paintAt(out, y, shade = 1, seed = 0) {
  const t1 = smooth(40, 80, y);    // base → middle around the 1st floor
  const t2 = smooth(115, 190, y);  // middle → top above the 2nd floor
  out.copy(PAINT.base).lerp(PAINT.mid, t1).lerp(PAINT.top, t2);
  const h = Math.sin(seed * 12.9898 + y * 0.137) * 43758.5453;
  const j = 0.955 + 0.075 * (h - Math.floor(h));
  return out.multiplyScalar(shade * j);
}

let cache = null;
export function towerMaterials() {
  if (cache) return cache;
  const chordTex = latticeTextures.chord();
  const braceTex = latticeTextures.brace();
  const chords = patchInstancedRepeat(new THREE.MeshStandardMaterial({
    name: 'tower-chords', map: chordTex, roughness: 0.6, metalness: 0.06, side: THREE.DoubleSide,
  }), { alpha: true, cellAspect: 1.3 });
  const braces = patchInstancedRepeat(new THREE.MeshStandardMaterial({
    name: 'tower-braces', map: braceTex, roughness: 0.62, metalness: 0.06, side: THREE.DoubleSide,
  }), { alpha: true, cellAspect: 1.15 });
  const solid = new THREE.MeshStandardMaterial({ name: 'tower-solid', color: 0xffffff, roughness: 0.6, metalness: 0.06 });
  const paint = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62, metalness: 0.06 });
  cache = {
    chords, braces, solid,
    chordsDepth: latticeDepthMaterial(chordTex, 1.3, 0.3),
    bracesDepth: latticeDepthMaterial(braceTex, 1.15, 0.35),
    paintBase: paint(new THREE.Color().copy(PAINT.base)),
    paintMid: paint(new THREE.Color().copy(PAINT.mid)),
    paintTop: paint(new THREE.Color().copy(PAINT.top)),
  };
  return cache;
}
