import * as THREE from 'three';
import { AMAX, DATA, LEVEL, NN, mulberry32 } from './data';
import { scene } from './renderer';
import { FS, pick } from './uniforms';
import { outlineGeometry, type GroupKey } from './geometry';
import { LANPOS, SHIP_MODELS } from './ships';
import { shipVert, shipFrag, outlineVert, outlineFrag, wakeVert, wakeFrag, lanternVert, lanternFrag } from './shaders';

/* =====================================================================
   FLEET BUFFERS
   instance order: [flagship][总督][提督][舰长][anonymous]  (each oldest first)
   kind code: 0 舰长, 1 anonymous, 2 flagship, 3 提督, 4 总督
   ===================================================================== */
const nByLevel = [0,0,0,0]; for(let k=0;k<NN;k++) nByLevel[LEVEL[k]]++;
// lights leaving still need their instance while new ones come in, so there are more than are ever on board at once
export const ANON_N = AMAX + 256;
export const GROUP = {} as Record<GroupKey, { start: number; count: number }>;
{ let s = 0; for(const [key,n] of [['flag',1],['sou',nByLevel[1]],['tei',nByLevel[2]],['kan',nByLevel[3]],['anon',ANON_N]] as [GroupKey, number][]){ GROUP[key] = { start:s, count:n }; s += n; } }
export const NI = 1 + NN + ANON_N;
export const INST = new Int32Array(NN);
{ const c: Record<number, number> = {1:GROUP.sou.start, 2:GROUP.tei.start, 3:GROUP.kan.start}; for(let k=0;k<NN;k++) INST[k] = c[LEVEL[k]]++; }
const KIND_BY_LEVEL = [0, 4, 3, 0];
export const OFF = new Float32Array(NI*4);   // x, z, heading, scale
export const INFO = new Float32Array(NI*4);  // start day, random, lantern strength, kind
export const DYN = new Float32Array(NI*2);   // lantern multiplier, fade
const LANP = new Float32Array(NI*3);         // lantern position in model space
export const JX = new Float32Array(NI), JZ = new Float32Array(NI), PH = new Float32Array(NI);
export const LOD = new Float32Array(NI);     // 1 while the ship is drawn by its group's detailed model (cullShips)
{
  // the spare lights draw their random numbers last, so every other ship keeps the ones it had before they were added
  const rh = mulberry32(5), N0 = NI - (ANON_N - AMAX), jit = (i: number) => { JX[i] = rh()-0.5; JZ[i] = rh()-0.5; PH[i] = rh()*6.283; };
  for(let i=0;i<N0;i++) jit(i);
  INFO.set([0, 0.5, 1, 2], 0); OFF.set([0,0,0,FS], 0); DYN.set([1,1], 0);
  DATA.named.forEach((n,k) => { const i = INST[k]; INFO.set([n.start, rh(), 0.35 + 0.65*Math.min(1, n.medal/40), KIND_BY_LEVEL[n.level]], i*4); });
  for(let j=0;j<AMAX;j++){ const i = GROUP.anon.start + j; INFO.set([0, rh(), 0.6, 1], i*4); }
  for(let i=N0;i<NI;i++){ jit(i); INFO.set([0, rh(), 0.6, 1], i*4); }
  for(const key in GROUP){ const g = GROUP[key as GroupKey]; for(let i=g.start;i<g.start+g.count;i++) LANP.set(LANPOS[key as GroupKey], i*3); }
}
export const iOff = new THREE.InstancedBufferAttribute(OFF,4).setUsage(THREE.DynamicDrawUsage);
const iInfo = new THREE.InstancedBufferAttribute(INFO,4);
export const iDyn = new THREE.InstancedBufferAttribute(DYN,2).setUsage(THREE.DynamicDrawUsage);
const iLan = new THREE.InstancedBufferAttribute(LANP,3);
const iLod = new THREE.InstancedBufferAttribute(LOD,1).setUsage(THREE.DynamicDrawUsage);

const shipMaterial = (far: boolean) => new THREE.ShaderMaterial({
  uniforms: pick('uTime','uTravel','uDay','uMirror','uFogColor','uFogDensity','uLamp','uLampPos','uFleetGlow','uFlash','uToon','uCastSat','uRimC','uTierK','uTierT','uTierS','uPx','uLod'), side:THREE.DoubleSide, vertexColors:true,
  defines: far ? { FAR: 1 } : {},
  vertexShader: shipVert,
  fragmentShader: shipFrag
});
// the far models draw with a shader that leaves out the detail they are too small to show (ship.frag.glsl FAR)
const shipMat = shipMaterial(false), farMat = shipMaterial(true);

function subAttr(attr: THREE.InstancedBufferAttribute, start: number, count: number, dynamic?: boolean){
  const a = new THREE.InstancedBufferAttribute((attr.array as Float32Array).subarray(start*attr.itemSize, (start+count)*attr.itemSize), attr.itemSize);
  if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
  return a;
}
// ink outline: the closed parts drawn again, pushed out along smooth normals, back faces only.
// Width is in screen pixels and it only appears on ships big enough on screen, so the far fleet never turns into noise.
const outlineMat = new THREE.ShaderMaterial({
  uniforms: pick('uTime','uTravel','uMirror','uPx','uFogColor','uFogDensity','uToon','uLineW','uLod'), side:THREE.BackSide,
  vertexShader: outlineVert,
  fragmentShader: outlineFrag
});
// Each group is one instanced mesh of all its ships. 舰长 and 无名之舰, thousands of them and mostly a few pixels tall, draw
// a far model of 15 triangles there; the ships at least LOD_PX tall on screen (by the same nearest-point test
// as the ink lines below) are copied each frame into a short list that draws the detailed model instead, and the far
// one skips them (LOD). The detailed model shrinks into the far one as the ship gets smaller (aFar, src/ships.ts; uLod
// in ship.vert.glsl) and is the far one at the size the list takes a ship in, so a ship changing models changes nothing
// on screen.
// Ink lines only show on ships at least 26 px tall (outline.vert.glsl), a few hundred of the ~8000, copied into a list
// the same way, so the far fleet's outline vertices are never run. r is the model's reach from its origin; the test takes
// the ship's nearest possible point, so no ship that would get a line or the detailed model is left out.
const LOD_PX = 20, LINE_PX = 26;
export const groupMeshes: Partial<Record<GroupKey, THREE.Mesh>> = {}, nearMeshes: Partial<Record<GroupKey, THREE.Mesh>> = {}, outlineMeshes: Partial<Record<GroupKey, THREE.Mesh>> = {};
interface List { attrs: THREE.InstancedBufferAttribute[]; n: number }
const SEL: Partial<Record<GroupKey, { r: number; lod: boolean; near: List; line: List }>> = {};
const SRC = [OFF, INFO, DYN, LANP];
const list = (count: number, sizes: number[]): List => ({ n: 0, attrs: sizes.map(k => new THREE.InstancedBufferAttribute(new Float32Array(count*k), k).setUsage(THREE.DynamicDrawUsage)) });
const instanced = (base: THREE.BufferGeometry) => { const ig = new THREE.InstancedBufferGeometry(); ['position','normal','color','aGlow','aSail','aOutN','aFar'].forEach(n => ig.setAttribute(n, base.getAttribute(n))); return ig; };
// a group's detailed model, and its far model if it has one (only 舰长 and 无名之舰: the others draw the detailed one at any size)
function setGroupGeometry(key: GroupKey, near: THREE.BufferGeometry, far?: THREE.BufferGeometry){
  const g = GROUP[key]; if (!g.count) return;
  const sel = SEL[key] = { r: 0, lod: !!far, near: list(g.count, [4, 4, 2, 3]), line: list(g.count, [4, 2]) };
  near.computeBoundingSphere(); sel.r = near.boundingSphere!.center.length() + near.boundingSphere!.radius;
  const ig = instanced(far ?? near);
  ([['aOff', iOff, true], ['aInfo', iInfo, false], ['aDyn', iDyn, true], ['aLanPos', iLan, false], ['aLod', iLod, true]] as [string, THREE.InstancedBufferAttribute, boolean][])
    .forEach(([n, a, dyn]) => ig.setAttribute(n, subAttr(a, g.start, g.count, dyn)));
  ig.instanceCount = g.count;
  const ng = instanced(near);
  ['aOff', 'aInfo', 'aDyn', 'aLanPos'].forEach((n, k) => ng.setAttribute(n, sel.near.attrs[k]));
  ng.setAttribute('aLod', new THREE.InstancedBufferAttribute(new Float32Array(g.count), 1));
  ng.instanceCount = 0;
  const ob = outlineGeometry(near), og = new THREE.InstancedBufferGeometry();
  og.setAttribute('position', ob.getAttribute('position')); og.setAttribute('aOutN', ob.getAttribute('aOutN')); og.setAttribute('aFar', ob.getAttribute('aFar'));
  og.setAttribute('aOff', sel.line.attrs[0]); og.setAttribute('aDyn', sel.line.attrs[1]);
  og.instanceCount = 0;
  for (const [meshes, geo, mat] of [[groupMeshes, ig, far ? farMat : shipMat], [nearMeshes, ng, shipMat], [outlineMeshes, og, outlineMat]] as [typeof groupMeshes, THREE.InstancedBufferGeometry, THREE.Material][]){
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; scene.add(m); meshes[key] = m;
  }
}
// once a frame: the ships for each group's detailed model, and in 二次元 those for an ink line
export function cullShips(cam: THREE.Vector3, px: number, toon: boolean){
  for (const key in SEL){
    const k = key as GroupKey, g = GROUP[k], sel = SEL[k]!, near = sel.near, line = sel.line;
    near.n = 0; line.n = 0;
    for (let i = g.start; i < g.start + g.count; i++){
      LOD[i] = 0;
      const sc = OFF[i*4+3];
      if (sc <= 0 || DYN[i*2+1] <= 0) continue;
      // the swell lifts a ship by up to 0.6 and tilts it by less than 0.1, hence the margin
      const dx = OFF[i*4] - cam.x, dz = OFF[i*4+1] - cam.z;
      const big = px*sc/Math.max(Math.sqrt(dx*dx + cam.y*cam.y + dz*dz) - sc*sel.r*1.1 - 0.7, 0.1);
      if (sel.lod && big >= LOD_PX){
        LOD[i] = 1;
        near.attrs.forEach((a, j) => { const n = a.itemSize; (a.array as Float32Array).set(SRC[j].subarray(i*n, i*n + n), near.n*n); });
        near.n++;
      }
      if (toon && big >= LINE_PX){
        (line.attrs[0].array as Float32Array).set(OFF.subarray(i*4, i*4 + 4), line.n*4);
        (line.attrs[1].array as Float32Array).set(DYN.subarray(i*2, i*2 + 2), line.n*2);
        line.n++;
      }
    }
    (nearMeshes[k]!.geometry as THREE.InstancedBufferGeometry).instanceCount = near.n;
    (outlineMeshes[k]!.geometry as THREE.InstancedBufferGeometry).instanceCount = line.n;
    for (const l of [near, line]) if (l.n) for (const a of l.attrs){ a.clearUpdateRanges(); a.addUpdateRange(0, l.n*a.itemSize); a.needsUpdate = true; }
    if (sel.lod) groupMeshes[k]!.geometry.getAttribute('aLod').needsUpdate = true;
  }
}
for (const key of ['flag', 'sou', 'tei', 'kan', 'anon'] as GroupKey[]) setGroupGeometry(key, SHIP_MODELS[key].near, SHIP_MODELS[key].far);

/* ---------- wakes: longer for longer service ---------- */
export let wakes: THREE.Mesh;
{
  const segs = 8, pos: number[] = [], uv: number[] = [], index: number[] = [];
  for(let s=0; s<=segs; s++){ const v = s/segs; pos.push(-1,0,v, 1,0,v); uv.push(-1,v, 1,v); }
  for(let s=0; s<segs; s++){ const a = s*2; index.push(a,a+1,a+3, a,a+3,a+2); }
  const wg = new THREE.InstancedBufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  wg.setAttribute('aUV', new THREE.Float32BufferAttribute(uv,2));
  wg.setIndex(index);
  wg.setAttribute('aOff', iOff); wg.setAttribute('aInfo', iInfo); wg.setAttribute('aDyn', iDyn);
  wg.instanceCount = NI;
  wakes = new THREE.Mesh(wg, new THREE.ShaderMaterial({
    uniforms: pick('uTime','uTravel','uDay','uFogDensity'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
    vertexShader: wakeVert,
    fragmentShader: wakeFrag
  }));
  wakes.frustumCulled = false; wakes.renderOrder = 1; scene.add(wakes);
}

/* ---------- lanterns ---------- */
const lanGeo = new THREE.BufferGeometry();
lanGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NI*3),3));
export const lOff = new THREE.BufferAttribute(OFF,4).setUsage(THREE.DynamicDrawUsage);
export const lDyn = new THREE.BufferAttribute(DYN,2).setUsage(THREE.DynamicDrawUsage);
const lLan = new THREE.BufferAttribute(LANP,3);
lanGeo.setAttribute('aOff', lOff); lanGeo.setAttribute('aInfo', new THREE.BufferAttribute(INFO,4)); lanGeo.setAttribute('aDyn', lDyn); lanGeo.setAttribute('aLanPos', lLan);
const lanterns = new THREE.Points(lanGeo, new THREE.ShaderMaterial({
  uniforms: pick('uTime','uTravel','uPx','uPR','uFogDensity','uMirror'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  vertexShader: lanternVert,
  fragmentShader: lanternFrag
}));
lanterns.frustumCulled = false; lanterns.renderOrder = 2; scene.add(lanterns);
