import * as THREE from 'three';
import { scene } from './renderer';
import { pick } from './uniforms';
import { glowVert, glowFrag } from './shaders';

/* ---------- glowing points: bonfire sparks (fireworks share the fragment shader, src/fx.ts) ---------- */
const glowMat = new THREE.ShaderMaterial({
  uniforms: pick('uPx','uPR','uMirror','uFogDensity'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  vertexShader: glowVert,
  fragmentShader: glowFrag
});
export function makeGlowPoints(n: number){
  const pos = new Float32Array(n*3), col = new Float32Array(n*4), size = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const p = new THREE.Points(g, glowMat); p.frustumCulled = false; p.renderOrder = 3; scene.add(p);
  return { p, pos, col, size, touch(){ g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true; } };
}
