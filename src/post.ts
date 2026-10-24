import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './bloom';
import { PR, RT_TYPE, camera, renderer, scene } from './renderer';
import { U } from './uniforms';
import { skyGroup } from './sky';
import { ocean, reflRT } from './ocean';
import { groupMeshes, nearMeshes, outlineMeshes, wakes } from './fleet';
import { toriiLines } from './torii';
import { figureGroup } from './figures';
import { fullscreenVert, gradeFrag } from './shaders';

/* =====================================================================
   POST: bloom, filmic tone curve, vignette, grain
   ===================================================================== */
// The 二次元 colour edit, applied to display colours after the tone curve and vignette. It is baked into a 33³ lookup
// table (a 3D LUT), so grade.frag.glsl pays one texture read however much the edit does. The table is indexed by the
// square root of each channel, which spends its rows on the dark colours a night scene is made of.
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };
function toonGrade(r: number, g: number, b: number){
  const l = 0.299*r + 0.587*g + 0.114*b;
  // a little more saturation, a cleaner image
  const sat = (c: number) => Math.min(1, Math.max(0, l + (c - l)*1.22));
  // split tone (2026-10-22, the Persona-style direction): cool moonlit shadows, warm highlights, so her vermilion
  // gates and flagship stand out from the night around them; the main colour itself lives in the 2D layer.
  // The tint keeps brightness (luma) as it is, so it only shifts hue and no light swings harder than before.
  const w = smoothstep(0.02, 0.55, l), tint = [0.94 + 0.10*w, 0.97 + 0.03*w, 1.08 - 0.12*w];
  const tl = 0.299*tint[0] + 0.587*tint[1] + 0.114*tint[2];
  const split = (c: number, k: number) => Math.min(1, sat(c)*tint[k]/tl);
  // anime night frames keep their darkest areas a deep indigo rather than true black (black is for the ink lines)
  const lift = 1 - smoothstep(0, 0.30, l);
  return [split(r, 0) + 0.008*lift, split(g, 1) + 0.010*lift, split(b, 2) + 0.026*lift];
}
const LUT_N = 33;
function bakeLut(){
  const N = LUT_N, data = new Uint16Array(N*N*N*4);
  for (let b = 0, i = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++, i += 4){
    const c = toonGrade((r/(N - 1))**2, (g/(N - 1))**2, (b/(N - 1))**2);
    for (let k = 0; k < 3; k++) data[i + k] = THREE.DataUtils.toHalfFloat(c[k]);
    data[i + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  // half floats keep the table as exact as the maths it replaces; 16-bit float textures filter in WebGL2
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.type = THREE.HalfFloatType; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}
const GRADE = {
  uniforms:{ tDiffuse:{value:null}, uTime:{value:0}, uRes:{value:new THREE.Vector2(1,1)}, uExposure:{value:1.0}, uToon:{value:0}, tLut:{value:bakeLut()}, tBloom:{value:null as THREE.Texture | null} },
  vertexShader: fullscreenVert,
  fragmentShader: gradeFrag
};
export let composer: EffectComposer | null = null, gradePass: ShaderPass | null = null;
try {
  // the scene renders into an offscreen target for bloom and grading, which loses the canvas's own antialiasing;
  // a multisampled target brings it back, so masts, gate edges and ink lines stop crawling as the camera drifts
  const samples = window.__samples !== undefined ? window.__samples : ((screen.width*screen.height*PR*PR > 4.2e6) ? 2 : 4);
  // nothing reads the scene's depth after the passes, so the one resolve per frame (after the scene) copies colour only
  const rt = new THREE.WebGLRenderTarget(2, 2, { type:RT_TYPE, format:THREE.RGBAFormat, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, samples, resolveDepthBuffer:false });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.62, 0.60);
  composer.addPass(bloom);
  gradePass = new ShaderPass(GRADE);
  gradePass.uniforms.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
  gradePass.uniforms.uToon.value = U.uToon.value;
  gradePass.needsSwap = false;   // it draws to the screen; not swapping keeps a single (multisampled) target alive instead of two
  composer.addPass(gradePass);
} catch(e){ composer = null; }
// ink lines stay out of the half-resolution reflection: thin lines there only alias and sparkle on the water
const MIRROR_HIDE = [skyGroup, ocean, wakes, groupMeshes.kan, groupMeshes.anon, nearMeshes.kan, nearMeshes.anon, figureGroup, toriiLines, ...Object.values(outlineMeshes)].filter(o => o !== undefined);
export function renderReflection(){
  U.uMirror.value = -1;
  const vis = MIRROR_HIDE.map(o => o.visible); MIRROR_HIDE.forEach(o => { o.visible = false; });
  renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  MIRROR_HIDE.forEach((o, k) => { o.visible = vis[k]; });
  U.uMirror.value = 1;
}
