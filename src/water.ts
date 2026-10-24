import * as THREE from 'three';
import { mulberry32 } from './data';
import { HDR, renderer } from './renderer';
import { U } from './uniforms';
import { fullscreenVert, wavesFrag } from './shaders';

/* =====================================================================
   THE SEA'S SMALL WAVES: drawn once a frame into a small tiling texture (2026-10-23)
   The sea used to add five sines in its fragment shader. Those were sampled at each pixel's centre, so they looked
   regular up close and shimmered far off. Here 32 Gerstner waves go into a 128² texture each frame; the sea samples
   it at two sizes, mipmaps average it with distance, and what the averaging loses comes back as roughness
   (src/shaders/ocean.frag.glsl). It needs a half-float render target; without one the sea keeps the old sines.
   The three long swells stay where they were (src/shaders/chunks/swell.glsl and swellJS), so the flagship still floats.
   ===================================================================== */
export const WAVES = HDR;
// NW waves on the tile's lattice, so the texture tiles: wavelengths from WL/3 down to 6 texels, mostly downwind,
// each with about the same slope; deep-water speeds (g = 8.1, as the old sines), frequencies rounded to whole turns
// per LOOP seconds so the clock can wrap without a jump
export const WL = 32, WSIZE = 128;
const NW = 32, LOOP = 64, RMS = 0.05;   // RMS slope: a calm night sea (a light breeze is about 0.1)
export let WH = 0;                       // RMS height of the waves as the sea samples them (both sizes)
const WAVE_A: number[] = [], WAVE_B: number[] = [];
{
  const rnd = mulberry32(31), wind = Math.atan2(0.035, 0.100), used = new Set<string>();
  let sum = 0;
  for (let i = 0; i < NW; i++){
    for (let tries = 0; tries < 200; tries++){
      const lam = WL/3*Math.pow(18/WSIZE, (i + rnd())/NW);
      const th = wind + (rnd() - 0.5)*2.2*Math.pow(rnd(), 0.6);
      const m = Math.round(WL/lam*Math.cos(th)), n = Math.round(WL/lam*Math.sin(th));
      if ((m === 0 && n === 0) || used.has(m + ',' + n)) continue;
      used.add(m + ',' + n);
      const kx = 2*Math.PI*m/WL, kz = 2*Math.PI*n/WL, k = Math.hypot(kx, kz);
      const slope = Math.pow(k/0.4, -0.18);   // a*k, a little less on the short waves
      const w = Math.round(Math.sqrt(8.1*k)*LOOP/(2*Math.PI))*2*Math.PI/LOOP;
      WAVE_A.push(kx, kz, slope/k, rnd()*2*Math.PI);
      WAVE_B.push(kx/k, kz/k, w, 0);
      sum += slope*slope/2;
      break;
    }
  }
  // scale to the RMS slope, then the Gerstner sharpness Q, kept where no crest can fold over
  const s = RMS/Math.sqrt(sum); let qs = 0;
  for (let i = 0; i < NW; i++){ WAVE_A[i*4+2] *= s; qs += WAVE_A[i*4+2]*Math.hypot(WAVE_A[i*4], WAVE_A[i*4+1]); }
  const Q = Math.min(0.7, 0.85/qs);
  for (let i = 0; i < NW; i++){ WAVE_B[i*4] *= Q*WAVE_A[i*4+2]; WAVE_B[i*4+1] *= Q*WAVE_A[i*4+2]; WH += WAVE_A[i*4+2]**2/2; }
  WH = Math.sqrt(WH*(1 + (0.5/3.3)**2));
}

// slope x, slope z, height, slope squared; half floats, mipmapped, tiling
const waveRT = new THREE.WebGLRenderTarget(WSIZE, WSIZE, {
  type: THREE.HalfFloatType, format: THREE.RGBAFormat, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false
});
U.tWave.value = waveRT.texture;
const waveMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uWA: { value: Array.from({ length: NW }, (_, i) => new THREE.Vector4().fromArray(WAVE_A, i*4)) },
    uWB: { value: Array.from({ length: NW }, (_, i) => new THREE.Vector4().fromArray(WAVE_B, i*4)) }
  },
  defines: { NW, WL: WL.toFixed(1) },
  vertexShader: fullscreenVert, fragmentShader: wavesFrag, depthTest: false, depthWrite: false
});
const waveScene = new THREE.Scene(), waveCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
waveScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), waveMat));

export function updateWaves(clock: number){
  if (!WAVES) return;
  waveMat.uniforms.uTime.value = clock % LOOP;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(waveRT); renderer.render(waveScene, waveCam);
  renderer.setRenderTarget(prev);
}
