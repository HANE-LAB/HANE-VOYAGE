import * as THREE from 'three';
import { ACC, LEVEL, NDAYS, VETS, vetTier } from './data';
import { reduceMotion, scene } from './renderer';
import { pick } from './uniforms';
import { DYN, INST, OFF } from './fleet';
import { MAST_TOP } from './ships';
import { vetPillarFrag, vetPillarVert } from './shaders';

/* =====================================================================
   老船长: ships that have been with her a month (满月), half a year, a year or more, by B站's 陪伴天数 (earlier
   stints included). Each stands a pillar of light over its masthead (漁火光柱, vet_pillar.*.glsl), taller and brighter
   with each tier and from a year on taller each year, with one ring of light per year climbing it. The tier follows the
   day shown; the level drawn eases toward it by the clock, so a ship reaching a tier grows its pillar over about a second.
   Only the ~134 ships that ever reach a tier are drawn here; their place is copied from the fleet's buffers every frame.
   ===================================================================== */
const NV = VETS.length;
const vOff = new Float32Array(NV*4), vDyn = new Float32Array(NV*2), vTop = new Float32Array(NV*3), vLvl = new Float32Array(NV), goal = new Float32Array(NV);
// mastheads in model space (src/ships.ts), by level: -, 总督, 提督, 舰长
const TOP = [[0, 0, 0], MAST_TOP.sou, MAST_TOP.tei, MAST_TOP.kan];
VETS.forEach((k, j) => vTop.set(TOP[LEVEL[k]], j*3));
const aOff = new THREE.InstancedBufferAttribute(vOff, 4).setUsage(THREE.DynamicDrawUsage);
const aDyn = new THREE.InstancedBufferAttribute(vDyn, 2).setUsage(THREE.DynamicDrawUsage);
const aLvl = new THREE.InstancedBufferAttribute(vLvl, 1).setUsage(THREE.DynamicDrawUsage);
const uPT = { value: 0 };
{
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute([-1, 0, 1, 0, 1, 1, -1, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aOff', aOff); g.setAttribute('aDyn', aDyn); g.setAttribute('aLvl', aLvl);
  g.setAttribute('aTop', new THREE.InstancedBufferAttribute(vTop, 3));
  g.instanceCount = NV;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { ...pick('uTime','uTravel','uMirror','uPx','uPR','uFogDensity','uToon'), uPT },
    side:THREE.DoubleSide, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexShader: vetPillarVert, fragmentShader: vetPillarFrag }));
  m.frustumCulled = false; m.renderOrder = 2; scene.add(m);
}
let day = -1;
export function updateVeterans(d: number, dt: number){
  if (d !== day){
    day = d;
    // 满月 1, 半年 2, a year 3, and one more for each further year
    VETS.forEach((k, j) => { const t = vetTier(k, d); goal[j] = t < 3 ? t : 2 + Math.floor((ACC[k] - (NDAYS - 1 - d))/365); });
  }
  const e = 1 - Math.exp(-dt/0.4);
  VETS.forEach((k, j) => { const i = INST[k]; vOff.set(OFF.subarray(i*4, i*4 + 4), j*4); vDyn[j*2] = DYN[i*2]; vDyn[j*2+1] = DYN[i*2+1]; vLvl[j] += (goal[j] - vLvl[j])*e; });
  // the shimmer and the climbing rings keep their own clock, which stops where it is with reduced motion
  if (!reduceMotion) uPT.value += dt;
  aOff.needsUpdate = true; aDyn.needsUpdate = true; aLvl.needsUpdate = true;
}
