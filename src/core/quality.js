// Quality presets. The preset is chosen once before the world is generated
// (it changes geometry density and shader variants); resolution scaling is
// dynamic at runtime.
const PRESETS = {
  low: {
    msaa: false, anisotropy: 2, shadowMapSize: 1024, maxPixelRatio: 1,
    cityRadius: 1600, farCity: 0.5, trees: 0.45, people: 0, groundTex: 2048, mansards: false,
  },
  medium: {
    msaa: true, anisotropy: 4, shadowMapSize: 2048, maxPixelRatio: 1.25,
    cityRadius: 2600, farCity: 0.8, trees: 0.75, people: 120, groundTex: 2048, mansards: true,
  },
  high: {
    msaa: true, anisotropy: 8, shadowMapSize: 2048, maxPixelRatio: 1.75,
    cityRadius: 3400, farCity: 1, trees: 1, people: 260, groundTex: 4096, mansards: true,
  },
  ultra: {
    msaa: true, anisotropy: 16, shadowMapSize: 4096, maxPixelRatio: 2,
    cityRadius: 3400, farCity: 1.25, trees: 1, people: 420, groundTex: 4096, mansards: true,
  },
};

function detectDefault() {
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
  if (mobile) return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

function readStored() {
  try {
    const q = new URLSearchParams(location.search).get('quality');
    if (q && PRESETS[q]) return q;
    const s = localStorage.getItem('eiffel.quality');
    if (s && PRESETS[s]) return s;
  } catch (e) { /* storage unavailable */ }
  return null;
}

export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'];
const level = readStored() || detectDefault();
export const quality = { level, ...PRESETS[level] };

export function storeQuality(lvl) {
  try { localStorage.setItem('eiffel.quality', lvl); } catch (e) { /* ignore */ }
}
