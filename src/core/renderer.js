import * as THREE from 'three';
import { quality } from './quality.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: quality.msaa,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true, // 0.05 m railings and 20 km horizons in one frustum
    stencil: false,
    preserveDrawingBuffer: /[?&]shot/.test(location.search),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.id = 'gl';
  container.appendChild(renderer.domElement);
  // alpha-to-coverage only helps with a real multisampled framebuffer
  const gl = renderer.getContext();
  const samples = gl.getParameter(gl.SAMPLES) || 0;
  quality.samples = samples;
  if (samples < 2) quality.msaa = false;
  return renderer;
}

/**
 * Keeps the frame rate smooth by scaling the render resolution:
 * drops quickly when frames get slow, recovers slowly when there is headroom.
 */
export class ResolutionGovernor {
  constructor(renderer, { min = 0.55, target = 1000 / 58 } = {}) {
    this.r = renderer;
    this.max = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
    this.min = Math.min(this.max, Math.max(min, this.max * 0.5));
    this.scale = this.max;
    this.avg = 16.7;
    this.cool = 2;
    this.target = target;
    this.enabled = !/[?&]shot/.test(location.search);
  }
  frame(dtMs) {
    if (!this.enabled) return;
    this.avg += (Math.min(dtMs, 100) - this.avg) * 0.05;
    this.cool -= dtMs / 1000;
    if (this.cool > 0) return;
    let next = this.scale;
    if (this.avg > this.target * 1.25) next = Math.max(this.min, this.scale * 0.85);
    else if (this.avg < this.target * 0.8) next = Math.min(this.max, this.scale * 1.06);
    if (Math.abs(next - this.scale) > 0.01) {
      this.scale = next;
      this.r.setPixelRatio(next);
      this.r.setSize(window.innerWidth, window.innerHeight);
      this.cool = next < this.scale ? 1.5 : 3;
    } else {
      this.cool = 1;
    }
  }
  resize() {
    this.max = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
    this.scale = Math.min(this.scale, this.max);
    this.r.setPixelRatio(this.scale);
  }
}
