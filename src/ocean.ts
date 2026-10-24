import * as THREE from 'three';
import { RT_TYPE, scene } from './renderer';
import { RIP_N, RIP_W, U, pick } from './uniforms';
import { oceanVert, oceanFrag } from './shaders';
import { WAVES, WH, WL, WSIZE } from './water';

/* ---------- ocean, with lantern reflections from a mirrored pass ---------- */
// mipmapped, so a reflection stretched by the small waves can read a softer level instead of sparse taps
export const reflRT = new THREE.WebGLRenderTarget(2, 2, { type:RT_TYPE, minFilter:WAVES ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter:THREE.LinearFilter, depthBuffer:true, generateMipmaps:WAVES });
U.tRefl.value = reflRT.texture;
const oceanGeo = new THREE.PlaneGeometry(2600, 2600, 320, 320); oceanGeo.rotateX(-Math.PI/2);
export const ocean = new THREE.Mesh(oceanGeo, new THREE.ShaderMaterial({
  uniforms: pick('uTime','uTravel','uZenith','uHorizon','uBand','tMW','uFleetGlow','uFleetDir','uFogColor','uFogDensity','uLamp','uLampPos','uFleetC','uFleetR','tRefl','uRes','uReflOn','uFlash','uEnv','uToon','tWave','tRip','uRipC'),
  defines: { WAVES: WAVES ? 1 : 0, WL: WL.toFixed(1), WSIZE: WSIZE.toFixed(1), WH: WH.toFixed(5), RIP_N: RIP_N.toFixed(1), RIP_W: RIP_W.toFixed(1), RISING: 0 },
  vertexShader: oceanVert,
  fragmentShader: oceanFrag
}));
scene.add(ocean);
