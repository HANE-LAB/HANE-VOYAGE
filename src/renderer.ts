import * as THREE from 'three';
import { $ } from './dom';

/* =====================================================================
   RENDERER
   ===================================================================== */
// r128's colour pipeline, which the look was tuned in: colours are used exactly as written
// (no sRGB conversion of hex colours) and nothing is encoded on the way out
THREE.ColorManagement.enabled = false;
export const canvas = $<HTMLCanvasElement>('sea');
// without WebGL the page shows #nogl; throwing stops every module that would draw
export const renderer = (() => {
  try { return new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' }); }
  catch(e){ $('nogl').hidden = false; throw e; }
})();
export let PR = Math.min(window.devicePixelRatio||1, 1.5);
export const setPR = (v: number) => { PR = v; };
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(PR);
renderer.setClearColor(0x000000, 1);
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 6000);
// motion is full unless the viewer picks 减少 with the page's switch (src/main.ts), which the page remembers. The system's
// reduced-motion setting is deliberately not followed: the page is shared, and the author wants every viewer to see it as
// made (2026-10-23). Parts that read this every frame need nothing more; parts set up once register with onMotion.
let savedMotion: string | null = null;
try { savedMotion = localStorage.getItem('hane-voyage-motion'); } catch(e){}
export let reduceMotion = savedMotion === 'calm';
const motionHooks: ((calm: boolean) => void)[] = [];
export const onMotion = (f: (calm: boolean) => void) => { motionHooks.push(f); f(reduceMotion); };
export function setMotion(calm: boolean){
  reduceMotion = calm;
  try { localStorage.setItem('hane-voyage-motion', calm ? 'calm' : 'full'); } catch(e){}
  motionHooks.forEach(f => f(calm));
}
onMotion(calm => document.documentElement.classList.toggle('calm', calm));   // the cut-in's calm version in src/style.css
export const HDR = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
export const RT_TYPE = HDR ? THREE.HalfFloatType : THREE.UnsignedByteType;
