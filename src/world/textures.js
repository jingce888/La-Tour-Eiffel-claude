// Procedural canvas textures (no external assets).
import * as THREE from 'three';
import { quality } from '../core/quality.js';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toTexture(cv, { srgb = true, repeat = true, aniso = true, mip = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso ? quality.anisotropy : 1;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

// deterministic PRNG
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/** Wooden deck boards of the tower platforms (warm grey, weathered). */
export function deckTexture() {
  return cached('deck', () => {
    const S = 512, cv = canvas(S, S), g = cv.getContext('2d');
    const R = rng(7);
    g.fillStyle = '#6f665c';
    g.fillRect(0, 0, S, S);
    const boards = 8, bw = S / boards;
    for (let i = 0; i < boards; i++) {
      let y = -R() * S;
      while (y < S) {
        const len = S * (0.45 + R() * 0.6);
        const v = 92 + R() * 30;
        g.fillStyle = `rgb(${v + 14},${v + 6},${v - 8})`;
        g.fillRect(i * bw + 1, y + 1, bw - 2, len - 2);
        // grain
        g.globalAlpha = 0.18;
        for (let k = 0; k < 7; k++) {
          g.fillStyle = R() > 0.5 ? '#5c5046' : '#b8a996';
          g.fillRect(i * bw + 2 + R() * (bw - 6), y + R() * len, 1, len * (0.2 + R() * 0.5));
        }
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(40,32,26,0.55)';
        g.fillRect(i * bw, y, bw, 2);
        y += len;
      }
      g.fillStyle = 'rgba(30,24,20,0.7)';
      g.fillRect(i * bw, 0, 2, S);
    }
    return toTexture(cv);
  });
}

/** Dressed limestone paving of the parvis. */
export function pavingTexture() {
  return cached('paving', () => {
    const S = 512, cv = canvas(S, S), g = cv.getContext('2d');
    const R = rng(11);
    g.fillStyle = '#b9b1a3';
    g.fillRect(0, 0, S, S);
    const rows = 8, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = -R() * 60;
      while (x < S) {
        const w = 50 + R() * 70;
        const v = 168 + R() * 30;
        g.fillStyle = `rgb(${v},${v - 5},${v - 14})`;
        g.fillRect(x + 1.5, r * rh + 1.5, w - 3, rh - 3);
        x += w;
      }
    }
    // speckle & stains
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (R() - 0.5) * 18;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    return toTexture(cv);
  });
}

/** Tiling noise used for detail variation (grayscale). */
export function noiseTexture() {
  return cached('noise', () => {
    const S = 256, cv = canvas(S, S), g = cv.getContext('2d');
    const img = g.createImageData(S, S), d = img.data;
    const R = rng(3);
    const base = new Float32Array(S * S);
    // value noise, 3 octaves, tileable
    for (const [cells, amp] of [[8, 0.5], [32, 0.3], [128, 0.2]]) {
      const grid = [];
      for (let i = 0; i < cells * cells; i++) grid.push(R());
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const fx = (x / S) * cells, fy = (y / S) * cells;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = fx - x0, ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const g00 = grid[(y0 % cells) * cells + (x0 % cells)];
          const g10 = grid[(y0 % cells) * cells + ((x0 + 1) % cells)];
          const g01 = grid[((y0 + 1) % cells) * cells + (x0 % cells)];
          const g11 = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
          base[y * S + x] += amp * ((g00 * (1 - sx) + g10 * sx) * (1 - sy) + (g01 * (1 - sx) + g11 * sx) * sy);
        }
      }
    }
    for (let i = 0; i < S * S; i++) {
      const v = Math.max(0, Math.min(255, base[i] * 255));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return toTexture(cv, { srgb: false });
  });
}

/** Fine welded wire mesh for the protective fences (alpha). One tile ≈ 0.6 m. */
export function fenceMeshTexture() {
  return cached('fence', () => {
    const S = 256, cv = canvas(S, S), g = cv.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgb(205,205,205)';
    const n = 6, step = S / n;
    for (let i = 0; i < n; i++) g.fillRect(i * step + step / 2 - 1.5, 0, 3, S);   // vertical wires
    for (let i = 0; i < n * 2; i++) g.fillRect(0, i * step / 2 + step / 4 - 1, S, 2); // horizontal wires
    return toTexture(cv);
  });
}
