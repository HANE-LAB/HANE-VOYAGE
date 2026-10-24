import * as THREE from 'three';
import { mulberry32 } from './data';
import { U, pick } from './uniforms';
import { makeGlowPoints } from './glow';
import { camera, reduceMotion, renderer, scene } from './renderer';
import { fireworkVert, glowFrag } from './shaders';
import { FW_SHAPES } from './fwShapes';
import { clock, lampVis, type FleetLayout } from './formation';

/* =====================================================================
   SPARKS (her bonfire) and FIREWORKS (each 100 / 1000 crossed)
   ===================================================================== */
const NSP = 300;
const SPK = makeGlowPoints(NSP);
const spVel = new Float32Array(NSP*3), spAge = new Float32Array(NSP).fill(99), spLife = new Float32Array(NSP).fill(1);
let spAcc = 0; const rsp = mulberry32(404);
export function updateSparks(dt: number){
  spAcc += 46*lampVis*lampVis*dt;   // fewer sparks as her bonfire dims
  const L = U.uLampPos.value, P = SPK.pos, C = SPK.col;
  for (let i = 0; i < NSP; i++){
    if (spAge[i] >= spLife[i]){
      if (spAcc >= 1){
        spAcc -= 1; spAge[i] = 0; spLife[i] = 1.4 + rsp()*2.2;
        P[i*3] = L.x + (rsp()-0.5)*0.5; P[i*3+1] = L.y + 0.1 + rsp()*0.3; P[i*3+2] = L.z + (rsp()-0.5)*0.5;
        spVel[i*3] = (rsp()-0.5)*0.9; spVel[i*3+1] = 1.6 + rsp()*1.8; spVel[i*3+2] = -0.4 - rsp()*0.8;
      } else { C[i*4+3] = 0; continue; }
    }
    const a = (spAge[i] += dt);
    spVel[i*3] += Math.sin(clock*3.1 + i)*0.9*dt; spVel[i*3+1] -= 0.45*dt; spVel[i*3+2] -= 1.1*dt;
    spVel[i*3] *= 1 - 0.4*dt; spVel[i*3+1] *= 1 - 0.35*dt;
    P[i*3] += spVel[i*3]*dt; P[i*3+1] += spVel[i*3+1]*dt; P[i*3+2] += spVel[i*3+2]*dt;
    const heat = Math.max(0, 1 - a/spLife[i]), fl = 0.7 + 0.3*Math.sin(clock*23 + i*7.3);
    C[i*4] = 1.0; C[i*4+1] = 0.28 + 0.5*heat; C[i*4+2] = 0.08 + 0.22*heat*heat; C[i*4+3] = 2.6*heat*heat*fl;
    SPK.size[i] = 0.05 + 0.05*heat;
  }
  SPK.touch();
}

// fireworks burst high in the sky the view shows (src/camera.ts fwSpot), and every spark draws a short trail.
// A day sends them up when the total crosses 100, 1000, 2000 … and on every rise that counts as 大事 (fwShells).
// Each shell is one draw whose points move in src/shaders/firework.vert.glsl, from the seconds since launch alone:
// a round shell of 520 stars with 4-point trails, or a head (火羽 1–3 or kobuta, src/fwShapes.ts) of 1040 stars with 2,
// facing the camera. The CPU fills a shell's buffers once at launch and sets a few uniforms a frame.
// At most FW_N shells are up at once and FW_QMAX wait, launched FW_GAP s apart: a run of big days at 4× queues no more.
const FW_N = 8, FW_QMAX = 12, FW_GAP = 0.6, FW_TR = 34, FW_V = 2080 + FW_TR, TR = 1.7, LIFE = TR + 5.2;
const FW_KINDS = ['round', '1', '2', '3', 'kobuta'];
const SHAPES: Record<string, Int8Array> = {};
for (const k in FW_SHAPES) SHAPES[k] = new Int8Array(Uint8Array.from(atob(FW_SHAPES[k]), c => c.charCodeAt(0)).buffer);
// a head's half height in R; its stars' brightness and size against a round shell's; how fast they fade and fall (round:
// 0.7 a second, 0.06)
const SHAPE_H = 1.15, SHAPE_I = 1.0, SHAPE_Z = 1.15, SHAPE_FADE = 0.45, SHAPE_DROP = 0.02;
// a head's lines burn white gold to orange like a round shell; her ornaments are red, her eyes amber and her mouth pink;
// kobuta's scarf is green, his eyes white and his snout pink
const SHAPE_PAL = [[1.0,0.86,0.55],[1.0,0.48,0.16]];
const ACCENT: Record<string, number[][]> = { kobuta:[[0.32,1.0,0.38],[1.0,0.95,0.85],[1.0,0.50,0.58]] }, HER = [[1.0,0.24,0.12],[1.0,0.58,0.14],[1.0,0.40,0.45]];
// place: 0–2 the three places a head can stand in (src/camera.ts), 3 anywhere a round shell fits
interface Slot { on: boolean; t0: number; place: number; p: THREE.Points; u: Record<string, THREE.IUniform>; pos: Float32Array; seg: Float32Array }
function makeSlot(): Slot {
  const pos = new Float32Array(FW_V*3), seg = new Float32Array(FW_V*4);
  for (let j = 0; j < FW_TR; j++){ const o = FW_V - FW_TR + j; pos[o*3] = j*1.7; seg.set([j*0.022, j === 0 ? 3.2 : 1.3*(1 - j/FW_TR), j === 0 ? 0.42 : 0.20, 4], o*4); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeg', new THREE.BufferAttribute(seg, 4));
  const u = { ...pick('uPx','uPR','uMirror','uFogDensity'), uTau:{value:0}, uR:{value:1}, uFade:{value:0.7}, uTwinkle:{value:0}, uDrop:{value:0.06}, uSpike:{value:0.67}, uCalm:{value:0},
    uO:{value:new THREE.Vector3()}, uC1:{value:new THREE.Color()}, uC2:{value:new THREE.Color()}, uAcc:{value:[new THREE.Color(), new THREE.Color(), new THREE.Color()]} };
  const mat = new THREE.ShaderMaterial({ uniforms:u, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexShader:fireworkVert, fragmentShader:glowFrag });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.renderOrder = 3; p.visible = false; scene.add(p);
  return { on:false, t0:0, place:0, p, u, pos, seg };
}
const fwSlots: Slot[] = []; for (let k = 0; k < FW_N; k++) fwSlots.push(makeSlot());
// the shells share one program; compile it while the page loads, or the first launch stalls a frame (36 ms on a laptop GPU)
fwSlots[0].p.visible = true; renderer.compile(fwSlots[0].p, camera, scene); fwSlots[0].p.visible = false;
const fwQueue: { t: number, kind?: string }[] = []; const rfw = mulberry32(777);
export const FW_T = [100, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
// How many shells a day sends up, as the total goes from a to b: one per threshold crossed, and on a rise that counts
// as 大事 (z = rise/√(the larger total) over 1, as 逢潮缓行 in src/main.ts) 1 + 1.5·log2 z: z 2 sends 3, z 4 sends 4,
// z 8 sends 6, and 2026-10-12 (3647 joining, z 56) the most, FW_DAY. Over the whole voyage that is about 110 shells on
// 35 days; crossings alone were 10, none in 2023–2025.
const FW_DAY = 8;
export function fwShells(a: number, b: number){
  const z = (b - a)/Math.sqrt(Math.max(a, b, 1));
  let n = FW_T.filter(T => a < T && b >= T).length;
  if (z > 1) n = Math.max(n, 1 + Math.round(1.5*Math.log2(z)));
  return Math.min(n, FW_DAY);
}
const FW_PAL = [[[1.0,0.68,0.26],[1.0,0.30,0.10]], [[1.0,0.86,0.55],[1.0,0.48,0.16]], [[1.0,0.45,0.18],[0.95,0.20,0.14]]];
// how high the camera lifts its aim for fireworks (src/camera.ts)
export const FW_ALT = (Lv: number) => 30 + 0.14*Math.max(Lv, 20);
export let fwLift = 0;
let fwActive = false;
// the camera lifts while fireworks are up or queued
export const easeLift = (dt: number) => { fwLift += ((fwActive ? 1 : 0) - fwLift)*Math.min(1, dt*0.9); };
// kind: one of FW_KINDS for that one, or the next from the shuffled round
export function queueFirework(kind?: string){
  if (fwQueue.length >= FW_QMAX) return;
  const last = fwQueue.length ? fwQueue[fwQueue.length-1].t : clock; fwQueue.push({ t:Math.max(clock + 0.6, last + FW_GAP), kind });
}
// The kinds come round in a shuffled order, each once before any comes again. A head takes the first free one of the
// three head places; when all three are taken, it waits in the bag and a round shell goes up somewhere else instead.
let fwBag: string[] = [];
type Spot = (fl: FleetLayout, place: number, u: number, v: number) => { P: THREE.Vector3, H: number };
function launchFirework(fl: FleetLayout, spot: Spot, s: Slot, want?: string){
  if (!fwBag.length){ fwBag = FW_KINDS.slice(); for (let i = fwBag.length - 1; i > 0; i--){ const j = Math.floor(rfw()*(i + 1)); [fwBag[i], fwBag[j]] = [fwBag[j], fwBag[i]]; } }
  let kind = want && FW_KINDS.includes(want) ? want : fwBag.pop()!;
  const taken = fwSlots.filter(o => o.on).map(o => o.place), place = [0, 1, 2].find(p => !taken.includes(p)) ?? 3;
  if (place === 3 && kind !== 'round' && !want){ fwBag.unshift(kind); kind = 'round'; }
  const round = kind === 'round', pal = round ? FW_PAL[Math.floor(rfw()*FW_PAL.length)] : SHAPE_PAL, u = s.u;
  const { P, H } = spot(fl, place, rfw(), rfw());
  s.on = true; s.t0 = clock; s.place = place; s.p.visible = true;
  u.uO.value.copy(P); u.uR.value = H/(round ? 3.3 : 2*SHAPE_H);
  u.uFade.value = round ? 0.7 : SHAPE_FADE; u.uDrop.value = round ? 0.06 : SHAPE_DROP; u.uSpike.value = round ? 0.67 : 0; u.uTwinkle.value = round ? 1 : 0;
  u.uC1.value.fromArray(pal[0]); u.uC2.value.fromArray(pal[1]);
  (ACCENT[kind] || HER).forEach((c, i) => u.uAcc.value[i].fromArray(c));
  const V = s.pos, G = s.seg;
  if (round) for (let i = 0; i < 520; i++){
    const z = rfw()*2 - 1, a = rfw()*Math.PI*2, r = Math.sqrt(1 - z*z), v = 0.86 + rfw()*0.22;
    for (let j = 0; j < 4; j++){ const o = i*4 + j; V.set([r*Math.cos(a)*v, z*v, r*Math.sin(a)*v], o*3); G.set([j*0.055, 1 - j*0.24, 1 - j*0.18, 0], o*4); }
  } else {
    const sh = SHAPES[kind];
    for (let i = 0; i < 1040; i++) for (let j = 0; j < 2; j++){
      const o = i*2 + j; V.set([sh[i*3]/127*SHAPE_H, sh[i*3+1]/127*SHAPE_H, 0], o*3); G.set([j*0.05, SHAPE_I*(1 - j*0.4), SHAPE_Z*(1 - j*0.18), sh[i*3+2]], o*4);
    }
  }
  s.p.geometry.attributes.position.needsUpdate = true; s.p.geometry.attributes.aSeg.needsUpdate = true;
}
export function updateFireworks(fl: FleetLayout, spot: Spot){
  // with every slot up, the queue waits for the next to burn out
  for (let s; fwQueue.length && fwQueue[0].t <= clock && (s = fwSlots.find(o => !o.on));) launchFirework(fl, spot, s, fwQueue.shift()!.kind);
  let flash = 0, active = false;
  for (const s of fwSlots){
    if (!s.on) continue;
    const tau = clock - s.t0, tb = tau - TR;
    if (tau > LIFE){ s.on = false; s.p.visible = false; continue; }
    active = true;
    s.u.uTau.value = tau; s.u.uCalm.value = reduceMotion ? 1 : 0;
    // under 减少 the flash comes up over a few frames instead of in one
    if (tb > 0) flash += (reduceMotion ? 1 - Math.exp(-tb*8) : 1)*Math.exp(-tb*2.5);
  }
  fwActive = active || fwQueue.length > 0;
  U.uFlash.value = Math.min(1.5, flash);
}
