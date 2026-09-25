// Lattice members of the tower.
//
// Every structural member (chord, brace, tie…) is one instance of a unit box.
// The Eiffel Tower's members are themselves riveted lattice girders, so the
// broad faces of each box are rendered with an alpha "lattice web" texture
// (flanges + St Andrew's crosses) repeated along the member.  Close up this
// reads as real latticework with parallax through both faces; far away the
// mip-mapped alpha drives alpha-to-coverage so the tower keeps its lace-like
// transparency instead of shimmering.
import * as THREE from 'three';
import { quality } from '../core/quality.js';

const CELL_ASPECT = 1.15; // lattice cell height / member width

// ---------------------------------------------------------------- textures
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Lattice girder web: RGB = grey-scale detail shading (multiplied onto the paint),
 * A = solid / hole.  u = across the member, v = along it (one cell per tile).
 */
function drawLattice(kind) {
  const S = 128;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  const flange = kind === 'chord' ? 0.2 : 0.15;
  const bar = kind === 'chord' ? 0.13 : 0.1;
  const f = flange * S, b = bar * S;
  const shade = (v) => `rgb(${v},${v},${v})`;

  // web: double lattice (X) + batten, drawn first so flanges overlap it
  g.lineCap = 'butt';
  g.strokeStyle = shade(214);
  g.lineWidth = b;
  const xa = f - b * 0.3, xb = S - f + b * 0.3;
  for (const dy of [-S, 0, S]) {
    g.beginPath();
    g.moveTo(xa, dy); g.lineTo(xb, dy + S);
    g.moveTo(xb, dy); g.lineTo(xa, dy + S);
    g.stroke();
  }
  // battens (horizontal plates at the cell ends)
  g.fillStyle = shade(226);
  g.fillRect(0, 0, S, b * 0.62);
  g.fillRect(0, S - b * 0.62, S, b * 0.62);
  if (kind === 'chord') {
    g.fillRect(0, S * 0.5 - b * 0.3, S, b * 0.6);
  }
  // gusset plates where diagonals cross
  g.fillStyle = shade(206);
  g.beginPath(); g.arc(S / 2, S / 2, b * 0.9, 0, Math.PI * 2); g.fill();
  // flanges (angle irons) with a lit edge and a darker inner lip
  const fl = g.createLinearGradient(0, 0, f, 0);
  fl.addColorStop(0, shade(250)); fl.addColorStop(0.55, shade(236)); fl.addColorStop(1, shade(196));
  g.fillStyle = fl;
  g.fillRect(0, 0, f, S);
  const fr = g.createLinearGradient(S - f, 0, S, 0);
  fr.addColorStop(0, shade(196)); fr.addColorStop(0.45, shade(236)); fr.addColorStop(1, shade(250));
  g.fillStyle = fr;
  g.fillRect(S - f, 0, f, S);
  // rivet heads catching the light along the flanges
  g.fillStyle = shade(255);
  for (let i = 0; i < 8; i++) {
    const y = (i + 0.5) * S / 8;
    g.beginPath(); g.arc(f * 0.5, y, 1.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(S - f * 0.5, y, 1.6, 0, Math.PI * 2); g.fill();
  }
  return cv;
}

/** Fine diamond mesh (the lace-like panels hanging under the 2nd floor, grilles…). */
function drawDiamond(cells = 4, barFrac = 0.16) {
  const S = 128;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgb(220,220,220)';
  g.lineWidth = (S / cells) * barFrac;
  for (let i = -cells; i <= cells * 2; i++) {
    const o = (i * S) / cells;
    g.beginPath(); g.moveTo(o, 0); g.lineTo(o + S, S); g.stroke();
    g.beginPath(); g.moveTo(o, S); g.lineTo(o + S, 0); g.stroke();
  }
  g.fillStyle = 'rgb(236,236,236)';
  g.fillRect(0, 0, S, 5); g.fillRect(0, S - 5, S, 5);
  return cv;
}

/** Decorative band of the great arches: plate with a row of round openings. */
function drawArchBand() {
  const W = 128, Hh = 128;
  const cv = makeCanvas(W, Hh);
  const g = cv.getContext('2d');
  g.fillStyle = 'rgb(222,222,222)';
  g.fillRect(0, 0, W, Hh);
  // chords
  g.fillStyle = 'rgb(246,246,246)';
  g.fillRect(0, 0, 14, Hh); g.fillRect(W - 14, 0, 14, Hh);
  // round openings with a lit rim
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(W / 2, Hh / 2, 38, 0, Math.PI * 2); g.fill();
  // small triangular openings in the corners
  for (const [x, y] of [[26, 8], [26, Hh - 8], [W - 26, 8], [W - 26, Hh - 8]]) {
    g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgb(252,252,252)';
  g.lineWidth = 5;
  g.beginPath(); g.arc(W / 2, Hh / 2, 40, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgb(200,200,200)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(W / 2, Hh / 2, 45, 0, Math.PI * 2); g.stroke();
  return cv;
}

/** Scalloped lambrequin fringe hanging under the arch intrados. */
function drawFringe() {
  const W = 128, Hh = 64;
  const cv = makeCanvas(W, Hh);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, Hh);
  g.fillStyle = 'rgb(226,226,226)';
  g.fillRect(0, 0, W, 10);
  g.strokeStyle = 'rgb(226,226,226)';
  g.lineWidth = 6;
  for (let i = 0; i < 2; i++) {
    const cx = W * (i + 0.5) / 2;
    g.beginPath(); g.arc(cx, 8, 26, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(cx, 8, 14, 0, Math.PI); g.stroke();
    g.beginPath(); g.moveTo(cx, 8); g.lineTo(cx, 50); g.stroke();
    g.beginPath(); g.arc(cx, 54, 5, 0, Math.PI * 2); g.fillStyle = 'rgb(230,230,230)'; g.fill();
  }
  return cv;
}

const texCache = new Map();
function canvasTexture(key, draw, { srgb = true, repeat = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const t = new THREE.CanvasTexture(draw());
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = quality.anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(key, t);
  return t;
}

export const latticeTextures = {
  brace: () => canvasTexture('brace', () => drawLattice('brace')),
  chord: () => canvasTexture('chord', () => drawLattice('chord')),
  diamond: () => {
    const t = canvasTexture('diamond', () => drawDiamond(4, 0.17));
    t.wrapS = THREE.RepeatWrapping;
    return t;
  },
  archBand: () => canvasTexture('archBand', drawArchBand),
  fringe: () => {
    const t = canvasTexture('fringe', drawFringe, { repeat: false });
    t.wrapS = THREE.RepeatWrapping;
    return t;
  },
};

// ---------------------------------------------------------------- alpha logic
// Crisp (sharpened) alpha edges when magnified, raw mip alpha when minified so
// alpha-to-coverage reproduces the lattice density at any distance.
const ALPHA_A2C = /* glsl */`
  float a2cA = diffuseColor.a;
  float a2cW = max(fwidth(a2cA), 1e-4);
  float a2cSharp = clamp((a2cA - 0.5) / a2cW + 0.5, 0.0, 1.0);
  vec2 a2cT = vMapUv * vec2(128.0);
  float a2cLod = 0.5 * log2(max(dot(dFdx(a2cT), dFdx(a2cT)), dot(dFdy(a2cT), dFdy(a2cT))));
  diffuseColor.a = mix(a2cSharp, a2cA, smoothstep(0.5, 2.5, a2cLod));
  if (diffuseColor.a < 0.02) discard;
`;
const ALPHA_TEST = /* glsl */`
  if (diffuseColor.a < 0.5) discard;
  diffuseColor.a = 1.0;
`;

/** Patches a material so the map repeats along each instance's length. */
export function patchInstancedRepeat(material, { alpha = true, cellAspect = CELL_ASPECT } = {}) {
  const useA2C = quality.msaa && alpha;
  material.alphaToCoverage = useA2C;
  material.alphaTest = alpha ? 0.5 : 0;
  material.customProgramCacheKey = () => `lat-${alpha}-${useA2C}-${cellAspect}`;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev && prev(shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #if defined(USE_INSTANCING) && defined(USE_MAP)
        float latSx = length(instanceMatrix[0].xyz);
        float latSy = length(instanceMatrix[1].xyz);
        vMapUv.y *= max(1.0, floor(latSy / (latSx * ${cellAspect.toFixed(3)}) + 0.5));
      #endif`);
    if (alpha) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
        useA2C ? ALPHA_A2C : ALPHA_TEST);
    }
  };
  return material;
}

/** Depth material for shadow casting that honours the lattice holes. */
export function latticeDepthMaterial(map, cellAspect = CELL_ASPECT, threshold = 0.38) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: threshold });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #if defined(USE_INSTANCING) && defined(USE_MAP)
        float latSx = length(instanceMatrix[0].xyz);
        float latSy = length(instanceMatrix[1].xyz);
        vMapUv.y *= max(1.0, floor(latSy / (latSx * ${cellAspect.toFixed(3)}) + 0.5));
      #endif`);
  };
  m.customProgramCacheKey = () => `latdepth-${cellAspect}`;
  return m;
}

// ---------------------------------------------------------------- unit member box
// x,z ∈ [-0.5, 0.5], y ∈ [0, 1]; the ±z faces carry the lattice web (u across
// x), the ±x faces are the flanges (u pinned inside the solid flange strip).
let _boxGeo = null;
export function memberGeometry() {
  if (_boxGeo) return _boxGeo;
  const pos = [], nor = [], uv = [], idx = [];
  const face = (corners, n, uvs) => {
    const base = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      pos.push(...corners[i]); nor.push(...n); uv.push(...uvs[i]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const F = 0.06; // u inside the flange strip
  // +z (front)
  face([[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // -z (back)
  face([[0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // +x
  face([[0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5]], [1, 0, 0], [[F, 0], [F, 0], [F, 1], [F, 1]]);
  // -x
  face([[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]], [-1, 0, 0], [[F, 0], [F, 0], [F, 1], [F, 1]]);
  // +y cap
  face([[-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5]], [0, 1, 0], [[F, 0], [F, 0], [F, 0.02], [F, 0.02]]);
  // -y cap
  face([[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]], [0, -1, 0], [[F, 0], [F, 0], [F, 0.02], [F, 0.02]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  _boxGeo = g;
  return g;
}

// ---------------------------------------------------------------- member sets
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
const _N = new THREE.Vector3();

/**
 * Collects members as (a, b, width, depth, face-normal, shade) records and turns
 * them into a single InstancedMesh.
 */
export class MemberSet {
  constructor(name) {
    this.name = name;
    this.rec = []; // ax ay az bx by bz w d nx ny nz shade
  }
  get count() { return this.rec.length / 12; }

  /** @param n face normal hint: the lattice web will face this direction. */
  add(a, b, w, d = w, n = null, shade = 1) {
    const nx = n ? n[0] : 0, ny = n ? n[1] : 0, nz = n ? n[2] : 0;
    this.rec.push(a[0], a[1], a[2], b[0], b[1], b[2], w, d, nx, ny, nz, shade);
  }

  /** Polyline helper. */
  poly(points, w, d = w, n = null, shade = 1) {
    for (let i = 0; i < points.length - 1; i++) this.add(points[i], points[i + 1], w, d, n, shade);
  }

  build(material, colorFn, { castShadow = true, receiveShadow = true, depthMaterial = null } = {}) {
    const n = this.count;
    const mesh = new THREE.InstancedMesh(memberGeometry(), material, n);
    mesh.name = this.name;
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const r = this.rec;
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      _Y.set(r[o + 3] - r[o], r[o + 4] - r[o + 1], r[o + 5] - r[o + 2]);
      const len = _Y.length();
      _Y.divideScalar(len || 1);
      // orientation: web (+z) faces the hint normal, else a stable fallback
      _N.set(r[o + 8], r[o + 9], r[o + 10]);
      if (_N.lengthSq() < 1e-6) {
        _N.set(0, 1, 0);
        if (Math.abs(_Y.y) > 0.9) _N.set(r[o] + r[o + 3], 0, r[o + 2] + r[o + 5]).normalize();
        if (_N.lengthSq() < 1e-6) _N.set(1, 0, 0);
      }
      _Z.copy(_N).addScaledVector(_Y, -_N.dot(_Y));
      if (_Z.lengthSq() < 1e-8) {
        _Z.set(0, 0, 1).addScaledVector(_Y, -_Y.z);
        if (_Z.lengthSq() < 1e-8) _Z.set(1, 0, 0).addScaledVector(_Y, -_Y.x);
      }
      _Z.normalize();
      _X.crossVectors(_Y, _Z).normalize();
      const w = r[o + 6], d = r[o + 7];
      m.set(
        _X.x * w, _Y.x * len, _Z.x * d, r[o],
        _X.y * w, _Y.y * len, _Z.y * d, r[o + 1],
        _X.z * w, _Y.z * len, _Z.z * d, r[o + 2],
        0, 0, 0, 1
      );
      mesh.setMatrixAt(i, m);
      if (colorFn) {
        colorFn(col, (r[o + 1] + r[o + 4]) * 0.5, r[o + 11], i);
        mesh.setColorAt(i, col);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    if (depthMaterial) mesh.customDepthMaterial = depthMaterial;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}
