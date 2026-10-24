import * as THREE from 'three';
import { mulberry32 } from './data';
import { HDR, camera, onMotion, renderer, scene } from './renderer';
import { RIP_N, RIP_W, U, pick } from './uniforms';
import { NM, TA, TDECO, TORII_HY, TORII_W, kasaY, torii } from './torii';
import { ocean } from './ocean';
import { worldX } from './formation';
import { fullscreenVert, ripplesFrag, riseFxVert, riseFxFrag } from './shaders';

/* =====================================================================
   A GATE RISING OUT OF THE SEA (2026-10-23)
   Each gate comes up a little ahead of her bow (src/shaders/chunks/torii_place.glsl). A point of a gate at height y
   (gate units) is out of the water once the rise passes 1 - y/1.10, so each beam breaks the surface at a known rise.
   What the water does then follows the seconds since that moment, counted on the clock, not on the timeline: paused
   mid-rise, the water still drains off and the rings still spread, as they would. Everything is a function of those
   seconds, so any playback speed and the screenshot tests see the same water. Only the viewer moving the timeline
   clears it (src/main.ts), never playback itself, however far a slow frame at 4× goes.
   ===================================================================== */
// the top beam (笠木 with 島木, the middle of the block), the tie beam (貫), the legs' cross beams; and the moment the gate
// stops rising, when its foot is as far out as it will come (uRiseC; the drying and the dress's shake need it)
const BEAM_AT = [...[0.92, 0.665, 0.43].map(y => 1 - y/1.10), 1];   // 0.164, 0.395, 0.609, 1; 1.10 as in torii_place.glsl
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };
const OLD = 1e3;   // seconds: long ago
// the two newest gates that have started to rise: the one coming up and the one before it, whose rings still spread
let slots: { i: number; age: number[] }[] = [{ i: -1, age: [-1, -1, -1, -1] }, { i: -1, age: [-1, -1, -1, -1] }];

/* ---------- the rings, the dome and the foam: one small texture around the newest gate ---------- */
// 160² over 40 units (a quarter unit a texel), drawn only while something is happening: height, slope x and z, foam cover.
const ripRT = new THREE.WebGLRenderTarget(RIP_N, RIP_N, { type:THREE.HalfFloatType, format:THREE.RGBAFormat, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, depthBuffer:false });
U.tRip.value = ripRT.texture;
const ripMat = new THREE.ShaderMaterial({
  uniforms: pick('uRiseA','uRiseB','uRipC','uTravel'),
  defines: { RIP_N: RIP_N.toFixed(1), RIP_W: RIP_W.toFixed(1) },
  vertexShader: fullscreenVert, fragmentShader: ripplesFrag, depthTest:false, depthWrite:false
});
const ripScene = new THREE.Scene(), ripCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
ripScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ripMat));

// The sea and the gates carry the code for all this only while a gate is rising (RISING): kept in at all times it cost
// 0.3 ms a frame on a laptop GPU at a phone's pixel count with nothing to draw. three.js keeps both compiled programs on
// each material, so switching is free; both are compiled at the start (below), so the first rise does not stall.
const variants = [ocean.material, torii.material] as THREE.ShaderMaterial[];
let rising = 0;
const setRising = (on: number) => { if (on === rising) return; rising = on; for (const m of variants){ m.defines.RISING = on; m.needsUpdate = true; } };

window.__rise = () => slots.map(s => [s.i, ...s.age]);

export function updateRise(dt: number, jump: boolean){
  let newest = -1;
  for (let i = NM - 1; i >= 0; i--) if (TA[i*4 + 3] >= -12){ newest = i; break; }
  const prev = slots;
  slots = [newest, newest - 1].map(i => {
    const old = prev.find(p => p.i === i && i >= 0), r = i >= 0 ? smooth(-12, -5.5, TA[i*4 + 3]) : 0;
    const age = (old ? old.age : [-1, -1, -1, -1]).map((a, e) => {
      if (r < BEAM_AT[e]) return -1;                                                          // under water (or wound back)
      if (a < 0) return jump || !old && r > Math.min(BEAM_AT[e] + 0.25, 0.999) ? OLD : 0;     // breaks the surface now, or did long ago
      return jump ? OLD : a + dt;
    });
    return { i, age, r };
  }).map(({ i, age, r }, k) => {
    const A = U.uRiseA.value[k], B = U.uRiseB.value[k];
    if (i < 0){ A.set(1e4, 1e4, 1, 0); B.set(-1, -1, -1, 0); }
    else { A.set(TA[i*4], TA[i*4 + 1], TA[i*4 + 2], r); B.set(age[0], age[1], age[2], 0); }
    U.uRiseC.value.setComponent(k, i < 0 ? -1 : age[3]);
    return { i, age };
  });
  // The gate before the newest leaves the two slots when the next gate starts to rise (S = -12), at 1× about 3.5 s after
  // its top beam came out, while it still drips and is wet. So it fades out over the last two units of the next gate's
  // approach (about 0.4 s at 1×): its water, its wet look and its rings are multiplied by 1 - uRiseB[1].w, and nothing
  // vanishes in a frame. It is a function of where the gates are, so it holds still while paused.
  const next = newest >= 0 && newest + 1 < NM ? TA[(newest + 1)*4 + 3] : -1e9;
  if (slots[1].i >= 0) U.uRiseB.value[1].w = smooth(-14, -12, next);
  const wood = (i: number) => i >= 0 && TDECO[i*4] < 0.5 ? 1 : 0;   // a straight top beam (src/shaders/chunks/torii_shape.glsl)
  U.uRiseI.value.set(slots[0].i, slots[1].i, wood(slots[0].i), wood(slots[1].i));
  // Nothing to draw once every event is old (the gates dry in 8 s, the rings fade in 12) and no gate is half out of the
  // water. Without half-float targets there are no rings, only the wet look.
  const busy = U.uRiseA.value[0].w > 0 && U.uRiseA.value[0].w < 1 || slots.some(s => s.age.some(a => a >= 0 && a < 12));
  // The ripple texture stays at a point fixed ahead of her bow (S = -8), not on the newest gate: re-centring it on each
  // new gate moved its faded edge across the sea in one frame. ±20 units from there hold the rising gate (S -12 to
  // -5.5), its rings toward the camera and the gate before it until it fades out (S about 6).
  U.uRipC.value.set(worldX(-8), 8, busy ? 1 : 0);
  setRising(busy ? 1 : 0);
  if (!busy || !HDR) return;
  const target = renderer.getRenderTarget();
  renderer.setRenderTarget(ripRT); renderer.render(ripScene, ripCam);
  renderer.setRenderTarget(target);
}

/* ---------- water above the sea: streams pouring off the beams, splash plumes, spray, drips ---------- */
// aA: kind (0 pour, 1 spray, 2 drip, 3 plume), which beam, x and z in world units from the gate's centre (a pour: its
// side's z, and when the water far from its streams stops, in seconds after its beam left the water)
// aB: pour: where its streams gather, how wide they are; spray: launch velocity, seed; plume: width, height, seed; drip:
// how many drops in all and the time scale of the schedule (riseFx.vert.glsl), which drop (-1 the hanging one, 0 to
// DROPS - 1 the falling ones), seed.
// aC: pour: how long its streams last at least, seed; drip: the point's height (gate units), when it starts.
// aG: which of the two gates.
// Both slots get the same layout: a gate moves from slot 0 to slot 1 when the next one starts to rise, and with a layout
// of its own each slot redrew the gate's water from other seeds in that frame. Gates differ through their index
// (uRiseI, riseFx.vert.glsl), which stays with the gate.
// Where the water gathers and drips once the pour thins out, rather than all along the beams (2026-10-23 research, in
// .internal/research/reports): which beam, then x and z in world units from the gate's centre. Every drop clears the
// beams and posts below it, and none falls within 2 units of the middle, where her mast and figure pass. Fourteen to a
// gate, one side or the other at each place: with 22, too many drops were in the air at once.
const DRIPS = [
  // under the top beam, on the strip of 笠木 outside the 島木: both sides of the flat middle, and just inside the posts
  [0, 2.3, 0.40], [0, -2.3, -0.40], [0, 2.65, -0.40], [0, -2.65, 0.40], [0, 3.15, 0.40], [0, -3.15, -0.40],
  // the 島木's end corners, where the upturned ends of the 笠木 send their water
  [0, 4.98, -0.22], [0, -4.98, 0.22],
  // under the tie beam: its ends (木鼻), and just inside the posts
  [1, 4.62, 0.15], [1, -4.62, -0.15], [1, 3.15, -0.12], [1, -3.15, 0.12],
  // the outer edges of the extra legs' caps
  [2, 3.8, 1.86], [2, -3.8, -1.86],
];
const DROPS = 4;
// Draining water falls faster than the rest of the world (G in the shaders, against g = 9.8): at the scale it is seen,
// water falling at 9.8 took 1.3 s from the top beam and read as slow and sticky (riseFx.frag.glsl)
const FALL_G = 18;
// The water pouring off the long edges of the top beam and the tie beam, one card for each side of each beam. The whole
// edge pours as the beam comes out; then the water stops leaving the edge, first far from where it gathers, last at two
// or three points by the drip points, where it pours on as a stream that thins out (riseFx.frag.glsl). So the pour
// tears into a few streams instead of hanging as a curtain: which beam, which side, where it gathers (world x from the
// gate's centre; 1e4 for none). Off the middle, as the drips.
const POURS = [
  [0, 1, -3.15, 2.3, 5.0], [0, -1, -5.0, -2.65, 3.15],
  [1, 1, -4.62, 3.15, 1e4], [1, -1, -3.15, 4.62, 1e4],
];
{
  const A: number[] = [], B: number[] = [], C: number[] = [], G: number[] = [];
  const add = (g: number, a: number[], b: number[], c = [0, 0]) => { A.push(...a); B.push(...b); C.push(...c); G.push(g); };
  for (let g = 0; g < 2; g++){
    const rnd = mulberry32(53), rs = mulberry32(71);
    // the pours off both long edges of the top beam and the tie beam: when the water far from the streams stops, how
    // wide the streams are, how long they last at least (each up to 0.8 s more, from the seed), and a seed
    for (const [ev, sz, ...at] of POURS){
      add(g, [0, ev, sz*(ev === 0 ? 0.55 : 0.30), 0.1 + 0.15*rs()], [...at, 0.12 + 0.06*rs()], [ev === 0 ? 0.8 : 0.5, rs()]);
    }
    for (let k = 0; k < 56; k++) rnd();   // the splash and the drips draw after these 56 numbers: the layout the screenshot tests know
    // spray thrown up as each beam breaks through, mostly upward, a little outward
    for (const [ev, half, edge, n, up] of [[0, 6.0, 0.47, 80, 4.6], [1, 4.7, 0.27, 48, 3.4], [2, 1.7, 0.2, 20, 2.2]]){
      for (let s = 0; s < n; s++){
        const sz = rnd() < 0.5 ? -1 : 1, x = ev === 2 ? (rnd() < 0.5 ? -3.8 : 3.8) : (rnd()*2 - 1)*half;
        add(g, [1, ev, x, ev === 2 ? (rnd()*2 - 1)*half : sz*edge], [(rnd() - 0.5)*0.8, up*(0.5 + 0.5*rnd()), sz*(0.2 + 1.0*rnd()), rnd()]);
      }
    }
    // splash plumes along both edges where the top beam and the tie beam break through
    for (const [ev, half, edge, n, hgt] of [[0, 6.2, 0.55, 5, 1.8], [1, 4.9, 0.35, 4, 1.2]]){
      for (const sz of [-1, 1]) for (let s = 0; s < n; s++) add(g, [3, ev, -half + (s + 0.5)*2*half/n + (rnd() - 0.5)*0.8, sz*edge], [1.3 + 0.9*rnd(), hgt*(0.6 + 0.6*rnd()), rnd(), 0]);
    }
    // drip points, once the pour thins out: each has DROPS falling drops it uses in turn, and one hanging under the beam
    for (const [ev, x, z] of DRIPS){
      const y = ev === 0 ? (Math.abs(x) > 4.5 ? 0.8395 : kasaY(x/TORII_W)) : (ev === 1 ? 0.64 : 0.456);
      const n = 5 + 2*rnd();
      // a falling drop is used again DROPS drops later, by when it must have reached the sea (from a year gate, over a
      // trough) and its ring faded: drops come fastest at first, so the gap from the first to the (1 + DROPS)th sets s0
      const life = Math.sqrt(2*(y*TORII_HY + 0.6)/FALL_G) + 0.65;
      const gap = 1/(1 - (1 + DROPS)/n)**2 - 1/(1 - 1/n)**2;
      const s0 = Math.max(0.4 + 0.4*rnd(), life/gap), start = [0.9, 0.6, 0.35][ev] + 0.3*(rnd() - 0.5), seed = rnd();
      for (let j = -1; j < DROPS; j++) add(g, [2, ev, x, z], [n, s0, j, seed], [y, start]);
    }
  }
  const q = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(q.getIndex()); geo.setAttribute('position', q.getAttribute('position'));
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(new Float32Array(A), 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(new Float32Array(B), 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(new Float32Array(C), 2));
  geo.setAttribute('aG', new THREE.InstancedBufferAttribute(new Float32Array(G), 1));
  geo.instanceCount = G.length;
  // blended rather than cut out (the sheets can cover a lot of screen, and discard costs tile GPUs their hidden-surface
  // removal); over, not additive, so stacked spray never adds up past the bloom threshold
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...pick('uTime','uTravel','uMirror','uPx','uRiseA','uRiseB','uRiseI','uFogColor','uFogDensity','uToon','uFleetGlow','uLamp','uLampPos','uFlash'), uCalm:{ value:0 } },
    defines: { DROPS, V0: '1.5', G: FALL_G.toFixed(1) },   // V0: how fast the water leaves a beam's edge, downward (world units a second)
    transparent:true, depthWrite:false, side:THREE.DoubleSide,
    vertexShader: riseFxVert, fragmentShader: riseFxFrag
  });
  // with reduced motion the water still pours off the beams, drips and rings, but nothing is thrown about:
  // no spray and no plumes (riseFx.vert.glsl). Hiding it all would leave a gate rising out of the sea bone dry.
  onMotion(calm => { mat.uniforms.uCalm.value = calm ? 1 : 0; });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  scene.add(mesh);
}

// compile the rising variants now, while the page loads
setRising(1); renderer.compile(scene, camera); setRising(0);
