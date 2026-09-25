// Sky, sun, image-based lighting and aerial perspective.
//
// · Sky: Preetham analytic daylight + a drifting fbm cloud deck (adapted from
//   three.js' Sky example, MIT) with a night mode (stars, moon glow).
// · Sun: three.js r186 SunLight with two cascaded shadow maps; the shadow range
//   follows the player's altitude (crisp at the parvis, city-wide at the top).
// · IBL: the sky (without sun disc) is rendered into a cube map → PMREM.
// · Fog: the global fog chunks are replaced by exponential height fog with
//   sun in-scattering, so the city melts into a believable Parisian haze.
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { quality } from '../core/quality.js';

// ---------------------------------------------------------------- shared fog uniforms
// Float32Arrays are shared by reference through UniformsUtils.clone, so a
// single write updates every material in the scene.
export const FOG = {
  params: new Float32Array([0.00022, 1 / 900, 0.6, 0.985]), // density, height falloff, sun glow, max
  sunDir: new Float32Array([0, 1, 0]),
  sunColor: new Float32Array([1, 0.8, 0.6]),
};

let fogInstalled = false;
export function installFog() {
  if (fogInstalled) return;
  fogInstalled = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif`;
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogWorldPos = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec4 fogParams;
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  varying vec3 vFogWorldPos;
  vec4 aerialPerspective(vec3 worldPos) {
    vec3 ray = worldPos - cameraPosition;
    float dist = length(ray);
    float h0 = max(cameraPosition.y, -10.0);
    float tau = fogParams.x * exp(-fogParams.y * h0) * dist;
    float k = fogParams.y * ray.y;
    if (abs(k) > 1e-4) tau *= (1.0 - exp(-k)) / k;
    float f = min(1.0 - exp(-tau), fogParams.w);
    vec3 v = ray / max(dist, 1e-3);
    float s = max(dot(v, fogSunDir), 0.0);
    vec3 col = fogColor + fogSunColor * (pow(s, 8.0) * fogParams.z + pow(s, 64.0) * fogParams.z);
    return vec4(col, f);
  }
#endif`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  vec4 fogAP = aerialPerspective(vFogWorldPos);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogAP.rgb, fogAP.a);
#endif`;
  const extra = {
    fogParams: { value: FOG.params },
    fogSunDir: { value: FOG.sunDir },
    fogSunColor: { value: FOG.sunColor },
  };
  Object.assign(THREE.UniformsLib.fog, extra);
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[k].uniforms;
    if (u && u.fogColor) Object.assign(u, extra);
  }
}
export function fogUniforms() {
  return {
    fogColor: { value: new THREE.Color() },
    fogParams: { value: FOG.params },
    fogSunDir: { value: FOG.sunDir },
    fogSunColor: { value: FOG.sunColor },
  };
}

// ---------------------------------------------------------------- sky shader
const SKY_VERT = /* glsl */`
uniform vec3 sunPosition;
uniform float rayleigh;
uniform float turbidity;
uniform float mieCoefficient;
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
const float e = 2.718281828459045;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;
float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}
vec3 totalMie(float T) {
  float c = (0.2 * T) * 10E-18;
  return 0.434 * c * MieConst;
}
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
  vSunDirection = normalize(sunPosition);
  vSunE = sunIntensity(vSunDirection.y);
  vSunfade = 1.0 - clamp(1.0 - exp((sunPosition.y / 450000.0)), 0.0, 1.0);
  float rayleighCoefficient = rayleigh - (1.0 * (1.0 - vSunfade));
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie(turbidity) * mieCoefficient;
}`;

const SKY_FRAG = /* glsl */`
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
uniform float mieDirectionalG;
uniform float cloudCoverage;
uniform float cloudDensity;
uniform float time;
uniform float showSunDisc;
uniform float skyExposure;
uniform float skySaturation;
uniform float night;
uniform vec3 moonDir;
uniform vec3 hazeColor;
uniform float hazeAmount;

vec2 gradient(vec2 i) {
  vec3 p = fract(i.xyx * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.xx + p.yz) * p.zy) * 2.0 - 1.0;
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(gradient(i), f);
  float b = dot(gradient(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(gradient(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(gradient(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.6;
}
float fbm(vec2 p, float drift) {
  float r = 0.0, a = 1.0;
  for (int i = 0; i < 5; i++) { r += a * noise(p); a *= 0.5; p = p * 2.03 + drift; }
  return r;
}
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

const float pi = 3.141592653589793;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.99995;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;
float rayleighPhase(float cosTheta) { return THREE_OVER_SIXTEENPI * (1.0 + cosTheta * cosTheta); }
float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  return ONE_OVER_FOURPI * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5));
}

void main() {
  vec3 direction = normalize(vWorldPosition - cameraPosition);
  vec3 dirUp = vec3(direction.x, max(direction.y, 0.0), direction.z);
  float zenithAngle = acos(max(0.0, direction.y));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));
  float cosTheta = dot(direction, vSunDirection);
  float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase(cosTheta, mieDirectionalG);
  vec3 betaMTheta = vBetaM * mPhase;
  vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(0.5)),
             clamp(pow(1.0 - vSunDirection.y, 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float sundisc = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta) * showSunDisc;
  vec3 col = (Lin + L0) * 0.04 + (760.0 * sundisc) * min(vSunE * Fex, vec3(80.0)) * 0.04 * 0.3 + vec3(0.0, 0.0003, 0.00075);

  // ---- night: deep blue gradient, stars, moon halo
  if (night > 0.0) {
    vec3 nsky = mix(vec3(0.0035, 0.006, 0.013), vec3(0.0008, 0.0014, 0.004), pow(max(direction.y, 0.0), 0.5));
    vec3 sd = floor(direction * 420.0);
    float st = hash3(sd);
    float star = step(0.9965, st) * smoothstep(0.02, 0.25, direction.y) * (0.5 + 0.5 * hash3(sd + 7.0));
    nsky += vec3(0.9, 0.93, 1.0) * star * 0.05;
    float md = max(dot(direction, moonDir), 0.0);
    nsky += vec3(0.55, 0.6, 0.72) * (pow(md, 900.0) * 1.2 + pow(md, 12.0) * 0.004);
    // the city's light dome: Paris skies are never black
    nsky += vec3(0.06, 0.036, 0.018) * exp(-max(direction.y, 0.0) * 7.0) * 0.55;
    col = mix(col, nsky, night);
  }

  // ---- clouds
  if (direction.y > 0.0 && cloudCoverage > 0.0) {
    vec2 cuv = direction.xz / (direction.y * 0.55 + 0.035);
    cuv = cuv * 0.28 + vec2(time * 0.0016, time * 0.0007);
    float evolve = time * 0.004;
    float n = clamp(fbm(cuv, evolve) * 0.62 + 0.5, 0.0, 1.0);
    float region = noise(cuv * 0.21 + 3.1) * 0.37 + 0.5;
    float cov = clamp(cloudCoverage + (region - 0.5) * 0.55, 0.0, 1.0);
    float thr = 1.0 - cov;
    float mask = smoothstep(thr, thr + 0.28, n);
    float horizonFade = smoothstep(0.0, 0.09, direction.y);
    float dayF = smoothstep(-0.08, 0.3, vSunDirection.y);
    vec3 sunC = vSunE * Fex * 0.22 * 0.04 * mix(vec3(1.0), vec3(1.0, 0.72, 0.5), clamp(1.0 - vSunDirection.y * 3.0, 0.0, 1.0));
    vec3 amb = Lin * 0.04 + vec3(0.0, 0.0003, 0.00075);
    float depth = max(0.0, n - thr);
    float beer = exp(-depth * 4.0);
    float powder = 1.0 - beer * beer;
    float shade = mix(0.42, 1.0, clamp(beer * powder * 2.6, 0.0, 1.0));
    float silver = clamp(0.51 / pow(1.49 - cosTheta * 1.4, 1.5), 0.0, 3.0);
    float edge = mask * (1.0 - mask) * 4.0;
    vec3 cc = amb * 1.3 + sunC * shade + sunC * silver * edge * 0.6;
    cc *= max(dayF, 0.0);
    cc = mix(cc, vec3(0.012, 0.012, 0.016) + vec3(0.03, 0.018, 0.01) * 0.2, night);
    float alpha = (1.0 - exp(-depth * cloudDensity * 12.0)) * horizonFade;
    vec3 aerial = mix(col, cc, Fex);
    col = mix(col, aerial, alpha);
  }

  // ---- below the horizon & low haze band: blend into the fog colour so the
  // ground edge disappears in the distance
  col *= skyExposure;
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, skySaturation);
  float hz = 1.0 - smoothstep(-0.02, 0.16, direction.y);
  col = mix(col, hazeColor, hz * hazeAmount);
  if (direction.y < 0.0) col = mix(col, hazeColor, smoothstep(0.0, -0.05, direction.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- time-of-day presets
// Paris, late June. bearing: compass direction the sun is in; elevation in degrees.
export const TIMES = {
  morning: {
    label: '清晨', bearing: 88, elevation: 17, turbidity: 3.2, rayleigh: 1.6, mie: 0.006, mieG: 0.82,
    sunColor: '#ffd9b0', sunIntensity: 3.2, envIntensity: 0.8, exposure: 2.1, hemi: 0.22,
    haze: 0.00026, cloud: 0.32, night: 0,
  },
  afternoon: {
    label: '午后', bearing: 238, elevation: 42, turbidity: 2.6, rayleigh: 1.25, mie: 0.005, mieG: 0.8,
    sunColor: '#ffeed6', sunIntensity: 3.5, envIntensity: 0.8, exposure: 1.85, hemi: 0.22,
    haze: 0.00021, cloud: 0.36, night: 0,
  },
  golden: {
    label: '黄昏', bearing: 283, elevation: 11, turbidity: 4.2, rayleigh: 2.0, mie: 0.007, mieG: 0.86,
    sunColor: '#ffbf83', sunIntensity: 3.2, envIntensity: 0.8, exposure: 2.2, hemi: 0.2,
    haze: 0.00028, cloud: 0.3, night: 0,
  },
  night: {
    label: '夜晚', bearing: 130, elevation: -18, turbidity: 2, rayleigh: 1, mie: 0.004, mieG: 0.8,
    sunColor: '#9fb2d8', sunIntensity: 0.12, envIntensity: 1.0, exposure: 2.4, hemi: 0.05, sky: 0.1,
    haze: 0.00018, cloud: 0.25, night: 1,
  },
};

export class Atmosphere {
  constructor(renderer, scene, towerFrameBearing) {
    installFog();
    this.renderer = renderer;
    this.scene = scene;
    this.bearingZ = towerFrameBearing; // compass bearing of the +z axis
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.fogColor = new THREE.Color(0xc9d3dc);
    this.time = 0;
    this.preset = null;

    // sky dome
    this.skyUniforms = {
      sunPosition: { value: new THREE.Vector3() },
      rayleigh: { value: 1.2 }, turbidity: { value: 2.6 }, mieCoefficient: { value: 0.005 },
      mieDirectionalG: { value: 0.8 }, cloudCoverage: { value: 0.35 }, cloudDensity: { value: 0.55 },
      time: { value: 0 }, showSunDisc: { value: 1 }, skyExposure: { value: 0.1 }, skySaturation: { value: 0.8 },
      night: { value: 0 }, moonDir: { value: new THREE.Vector3(0.3, 0.5, -0.8).normalize() },
      hazeColor: { value: new THREE.Color() }, hazeAmount: { value: 0.65 },
    };
    this.skyMat = new THREE.ShaderMaterial({
      name: 'Sky', uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.skyMat);
    this.sky.scale.setScalar(40000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // sun (cascaded shadows)
    this.sun = new SunLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 700;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.35;
    this.sun.shadow.radius = 1.6;
    scene.add(this.sun);

    // cheap sky fill for surfaces (IBL does most of the work)
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x7c6a55, 0.18);
    scene.add(this.hemi);

    scene.fog = new THREE.Fog(this.fogColor, 1, 2); // chunks replaced; only the colour is used

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(this.sky.geometry, this.skyMat);
    this.envSky.scale.setScalar(50000);
    this.envScene.add(this.envSky);
    // warm-grey city "ground" in the lower hemisphere for bounce light
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(40000, 32, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      new THREE.MeshBasicMaterial({ color: 0x6d655c, side: THREE.BackSide, fog: false })
    );
    ground.position.y = -30;
    this.envGround = ground;
    this.envScene.add(ground);
  }

  /** Converts a compass bearing + elevation (deg) into a world direction. */
  dirFromBearing(bearingDeg, elevDeg, out = new THREE.Vector3()) {
    const rel = THREE.MathUtils.degToRad(bearingDeg - this.bearingZ);
    const el = THREE.MathUtils.degToRad(elevDeg);
    return out.set(-Math.sin(rel) * Math.cos(el), Math.sin(el), Math.cos(rel) * Math.cos(el));
  }

  setTime(name) {
    const p = TIMES[name];
    if (!p) return;
    this.preset = name;
    this.params = p;
    this.dirFromBearing(p.bearing, p.elevation, this.sunDir);
    const U = this.skyUniforms;
    U.sunPosition.value.copy(this.sunDir).multiplyScalar(450000);
    U.rayleigh.value = p.rayleigh;
    U.turbidity.value = p.turbidity;
    U.mieCoefficient.value = p.mie;
    U.mieDirectionalG.value = p.mieG;
    U.cloudCoverage.value = p.cloud;
    U.night.value = p.night;
    U.skyExposure.value = p.sky ?? 0.1;
    this.dirFromBearing(p.bearing + 180, 34, U.moonDir.value);

    // light from above the horizon only (moonlight at night)
    const lightDir = p.night ? U.moonDir.value : this.sunDir;
    this.sun.position.copy(lightDir);
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.renderer.toneMappingExposure = p.exposure;

    // fog colour = sky colour just above the horizon, away from the sun
    this.updateEnvironment();
    FOG.params[0] = p.haze;
    FOG.params[1] = 1 / 950;
    FOG.params[2] = p.night ? 0.0 : 0.55;
    FOG.params[3] = p.night ? 0.93 : 0.985;
    FOG.sunDir[0] = this.sunDir.x; FOG.sunDir[1] = this.sunDir.y; FOG.sunDir[2] = this.sunDir.z;
    const sc = new THREE.Color(p.sunColor);
    FOG.sunColor[0] = sc.r * 0.35; FOG.sunColor[1] = sc.g * 0.3; FOG.sunColor[2] = sc.b * 0.22;
    this.hemi.intensity = p.hemi;
    // hemisphere fill takes its tint from the actual sky / ground
    const up = this.skyRadiance(new THREE.Vector3(0, 1, 0));
    const lum = Math.max(1e-4, up.r * 0.2126 + up.g * 0.7152 + up.b * 0.0722);
    this.hemi.color.setRGB(up.r / lum, up.g / lum, up.b / lum).lerp(new THREE.Color(1, 0.96, 0.9), 0.62);
    this.hemi.groundColor.setRGB(0.75, 0.64, 0.5);
  }

  updateEnvironment() {
    const U = this.skyUniforms;
    // 1) render the sky alone (no sun disc) to a cube, sample the horizon colour
    U.showSunDisc.value = 0;
    const hz = this.sampleHorizon();
    // Parisian haze is warmer and greyer than the clear-sky horizon
    const lum = hz.r * 0.2126 + hz.g * 0.7152 + hz.b * 0.0722;
    this.fogColor.copy(hz).lerp(new THREE.Color(lum * 1.02, lum * 0.98, lum * 0.93), 0.45);
    if (this.preset === 'night') this.fogColor.setRGB(0.012, 0.012, 0.018);
    this.scene.fog.color.copy(this.fogColor);
    U.hazeColor.value.copy(this.fogColor);
    // 2) with a ground hemisphere for bounce, prefilter for IBL
    this.envGround.material.color.copy(this.fogColor).multiplyScalar(0.5).lerp(new THREE.Color(0.14, 0.115, 0.09), 0.6);
    this.envGround.visible = true;
    U.hazeAmount.value = 0.65;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 100000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.params.envIntensity;
    U.showSunDisc.value = 1;
  }

  /** CPU port of the sky shader (no clouds) — used for the fog/haze colour. */
  skyRadiance(dir, out = new THREE.Color()) {
    const U = this.skyUniforms, sd = this.sunDir;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(clamp(sd.y, -1, 1))) / 1.5)));
    const sunfade = 1 - clamp(1 - Math.exp(sd.y), 0, 1);
    const rc = U.rayleigh.value - (1 - sunfade);
    const TR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
    const MC = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
    const c = 0.2 * U.turbidity.value * 10e-18;
    const zen = Math.acos(Math.max(0, dir.y));
    const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - zen * 180 / Math.PI, -1.253));
    const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
    const cosT = dir.x * sd.x + dir.y * sd.y + dir.z * sd.z;
    const rPh = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
    const g = U.mieDirectionalG.value, g2 = g * g;
    const mPh = 0.07957747154594767 * (1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5);
    const res = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const bR = TR[i] * rc, bM = 0.434 * c * MC[i] * U.mieCoefficient.value;
      const Fex = Math.exp(-(bR * sR + bM * sM));
      const ratio = (bR * rPh + bM * mPh) / (bR + bM);
      let Lin = Math.pow(sunE * ratio * (1 - Fex), 1.5);
      Lin *= 1 + (Math.pow(sunE * ratio * Fex, 0.5) - 1) * clamp(Math.pow(1 - sd.y, 5), 0, 1);
      res[i] = ((Lin + 0.1 * Fex) * 0.04 + [0, 0.0003, 0.00075][i]) * U.skyExposure.value;
    }
    const lum = 0.2126 * res[0] + 0.7152 * res[1] + 0.0722 * res[2], k = U.skySaturation.value;
    return out.setRGB(lum + (res[0] - lum) * k, lum + (res[1] - lum) * k, lum + (res[2] - lum) * k);
  }

  sampleHorizon() {
    const acc = new THREE.Color(0, 0, 0), c = new THREE.Color(), d = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      d.set(Math.cos(a), 0.05, Math.sin(a)).normalize();
      const away = 1 - Math.max(0, d.x * this.sunDir.x + d.z * this.sunDir.z);
      const w = 0.35 + away;
      this.skyRadiance(d, c);
      acc.r += c.r * w; acc.g += c.g * w; acc.b += c.b * w; n += w;
    }
    return acc.multiplyScalar(1 / n);
  }

  /** Shadow range follows altitude: sharp at ground level, city-wide from the top. */
  update(dt, camera) {
    this.time += dt;
    this.skyUniforms.time.value = this.time;
    const alt = camera.position.y;
    const far = alt > 200 ? 2600 : alt > 90 ? 1500 : alt > 40 ? 900 : 520;
    const sh = this.sun.shadow.camera;
    if (Math.abs(sh.far - far) > 1) sh.far = far;
    this.sky.position.copy(camera.position);
  }
}
