import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { camera, renderer, scene } from './renderer';
import { FS, V3, pick, swellJS } from './uniforms';
import { NDAYS, di, mulberry32 } from './data';
import { OFF } from './fleet';
import { NM, TA } from './torii';
import { BOW } from './flagship';
import { figureVert, figureFrag } from './shaders';
import url2021 from './figures/hinome-2021.glb?url';
import url2022 from './figures/hinome-2022.glb?url';
import url2023 from './figures/hinome-2023.glb?url';
import urlKobuta from './figures/kobuta.glb?url';

/* =====================================================================
   HER AND KOBUTA AT HER BOW (2026-10-24)
   Rigged models made outside (.internal/tools/voyage-assets), packed small by dev/figures.py and inlined in the page.
   She wears the look of the day shown. The look shown and Kobuta are decoded first, the other looks in idle time.
   ===================================================================== */
// Her three looks, switched as HANE switches its portraits: the new outfits were shown in streams from 22:00 JST on
// 14 February 2022 and 2023. t counts days from 2021-02-03, its fraction the hour of that day; the look shown is the
// last one whose start is not after t.
export const ERAS = [-Infinity, di(2022, 2, 14) + 22/24, di(2023, 2, 14) + 22/24];
export const eraAt = (t: number) => ERAS.reduce((k, from, i) => t >= from ? i : k, 0);
const URLS = [url2021, url2022, url2023, urlKobuta];

// 二次元 key in their own frame, turned with them each frame: from the front, a little to her left (the camera's side
// in 回望), above. Fixed like the ships' key, so only the body's own turns move a shadow edge.
const KEY = new V3(0.25, 0.55, 0.80).normalize(), UP = new V3(0, 1, 0);
const uKeyF = { value:KEY.clone() };
const toDisplay = (c: number) => Math.pow(Math.max(0, c), 1/2.2);   // glTF colour factors are linear; the page uses display colours

// They stay out of the half-size reflection (src/post.ts): at their size it showed nothing, for 0.15 ms a frame on a
// laptop GPU. The outlines hang in a group of their own (an attached skin draws the same wherever it hangs).
export const figureGroup = new THREE.Group(); scene.add(figureGroup);
const figureLines = new THREE.Group(), figureRoot = new THREE.Group(); figureGroup.add(figureLines, figureRoot);

interface Figure {
  root: THREE.Group;   // on the deck, scaled to its height
  mixer: THREE.AnimationMixer; idle?: THREE.AnimationAction; greet?: THREE.AnimationAction;
  look: [THREE.Object3D, number, THREE.Quaternion][];   // chest, neck and head: each one's share of a turn toward what they watch, and its pose from the clips before that turn
  lines: THREE.Object3D[]; edge: THREE.Vector2; size: { value: number };   // the costume change's edge (uSweep); its height, for its outline
}
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
function build(g: GLTF): Figure {
  const model = g.scene, root = new THREE.Group();
  root.add(model); root.visible = false; figureRoot.add(root);
  model.updateMatrixWorld(true);
  // The rest pose, in the model's own units: a skin's vertex goes there through any one bone and its inverse bind matrix
  // (gltfpack folds its dequantization into those; the bind matrix is the identity). Each mesh's bounds go the same way,
  // so no vertex is skinned here.
  const box = new THREE.Box3(), rest = new Map<THREE.SkinnedMesh, THREE.Matrix4>();
  model.traverse(o => {
    const m = o as THREE.SkinnedMesh; if (!m.isMesh) return;
    const M = m.isSkinnedMesh ? new THREE.Matrix4().multiplyMatrices(m.skeleton.bones[0].matrixWorld, m.skeleton.boneInverses[0]).multiply(m.bindMatrix) : m.matrixWorld.clone();
    m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox!.clone().applyMatrix4(M)); rest.set(m, M);
  });
  const tall = box.max.y - box.min.y;
  model.scale.setScalar(1/tall); model.position.y = -box.min.y/tall;   // unit height, feet at 0: the root scales it
  const edge = new THREE.Vector2(), uSize = { value:1 }, lines: THREE.Object3D[] = [];
  for (const [m, M] of rest){
    const src = m.material as THREE.MeshStandardMaterial, map = src.map;
    if (map){ map.colorSpace = THREE.NoColorSpace; map.updateMatrix(); renderer.initTexture(map); }
    const u = { ...pick('uFogColor','uFogDensity','uLamp','uLampPos','uFleetGlow','uFlash','uToon','uCastSat','uRimC','uPx','uLineW'),
      uKeyF, tMap:{ value:map }, uMapT:{ value:map ? map.matrix : new THREE.Matrix3() }, uRest:{ value:M }, uHgt:{ value:new THREE.Vector2(box.min.y, 1/tall) }, uSweep:{ value:edge }, uSize,
      uColor:{ value:new THREE.Color(toDisplay(src.color.r), toDisplay(src.color.g), toDisplay(src.color.b)) } };
    m.material = new THREE.ShaderMaterial({ uniforms:u, defines:map ? { HAS_MAP:1 } : {}, vertexShader:figureVert, fragmentShader:figureFrag, side:THREE.DoubleSide });
    // the ink outline: the same skin again
    const line = m.clone(); line.material = new THREE.ShaderMaterial({ uniforms:u, defines:{ LINE:1 }, vertexShader:figureVert, fragmentShader:figureFrag, side:THREE.BackSide });
    m.frustumCulled = line.frustumCulled = false; line.visible = false; figureLines.add(line); lines.push(line);
  }
  const mixer = new THREE.AnimationMixer(model), clip = (n: string) => g.animations.find(a => a.name === n);
  // both play all the time; pose() sets their times and weights by hand
  const idleClip = clip('deck_idle') ?? g.animations[0], greetClip = clip('greeting');
  const idle = idleClip && mixer.clipAction(idleClip).play(), greet = greetClip && mixer.clipAction(greetClip).play();
  const look = ([['chest', 0.2], ['neck', 0.35], ['head', 0.45]] as [string, number][])
    .flatMap(([n, f]) => { const b = model.getObjectByName(n); return b ? [[b, f, b.quaternion.clone()] as Figure['look'][0]] : []; });
  // compile and upload now, not in the frame it first shows
  root.visible = true; lines.forEach(l => { l.visible = true; }); renderer.compile(figureRoot, camera, scene); renderer.compile(figureLines, camera, scene);
  root.visible = false; lines.forEach(l => { l.visible = false; });
  return { root, mixer, idle, greet, look, lines, edge, size:uSize };
}

/* ---------- what each of them does: one state per character, applied to whichever model shows it ---------- */
interface Actor { at: { x: number; y: number; z: number; h: number }; idleT: number; greetT: number; wait: number; yaw: number; pitch: number; w: number; v: number[]; ease: number }
const actor = (at: Actor['at'], ease: number): Actor => ({ at, idleT: 0, greetT: -1, wait: -1, yaw: 0, pitch: 0, w: 0, v: [0, 0, 0], ease });
// how fast their heads follow what they watch (1/s). It was 4 and 2.6 until 2026-10-24: in playback each new gate moved
// the target from the gate overhead to the one rising far ahead, and that quick nod read as a twitch.
const her = actor(BOW.hinome, 1.4), pig = actor(BOW.kobuta, 1.1);
const looks: (Figure | null)[] = [null, null, null];
let kobuta: Figure | null = null;
let shown = -1, prev = -1, sweep = 1;   // her look shown; while it changes, the one before and how far the change has gone
const CLIP = 7.2, CHANGE = 0.9;   // the clips' length; how long a change of look takes, in seconds
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };
const greetW = (a: Actor) => a.greetT < 0 ? 0 : smooth(0, 0.35, a.greetT)*(1 - smooth(CLIP - 0.9, CLIP, a.greetT));

// 挥手: she waves, Kobuta a moment later; a wave plays to its end before another starts
const wave = (a: Actor, delay: number) => { if (a.greetT < 0 && a.wait < 0) a.wait = delay; };
export function cueFigures(){
  wave(her, 0); wave(pig, 0.35);
  for (let j = 0; j < 2; j++) idleWave[j] = Math.max(idleWave[j], 8);
}
// Now and then they also wave on their own, playing or not, each on a clock of its own: she every 10 to 24 s, Kobuta,
// livelier, every 6 to 14 s (real time). Until 2026-10-24 they waved only when playback started and on big days, which
// the user found too seldom; then one shared clock every 18 to 45 s, then 10 to 24 s, and the user asked for Kobuta to
// wave more. Seeded, so screenshot runs (which step the clock by hand) repeat.
const rnd = mulberry32(17);
const idleWave = [6 + 8*rnd(), 3 + 5*rnd()];
function waveNowAndThen(dt: number){
  for (const [j, a] of [[0, her], [1, pig]] as [number, Actor][]){
    if ((idleWave[j] -= dt) > 0) continue;
    wave(a, 0);
    idleWave[j] = j ? 6 + 8*rnd() : 10 + 14*rnd();
  }
}
// a firework launched now bursts at p after `delay` seconds: they watch it from a little before until it has burnt down
const fwAt = new V3(); let fwFrom = -1, fwTo = -1, now = 0;
export function watchFirework(p: THREE.Vector3, delay: number){ fwAt.copy(p); fwFrom = now + delay - 1.1; fwTo = now + delay + 2.8; }

const qr = new THREE.Quaternion(), qri = new THREE.Quaternion(), qt = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion();
const eul = new THREE.Euler(), tgt = new V3(), d = new V3(), herHead = new V3(), pigHead = new V3(), qFig = new THREE.Quaternion();
function pose(f: Figure, a: Actor){
  const gw = greetW(a);
  if (f.idle){ f.idle.time = a.idleT % f.idle.getClip().duration; f.idle.setEffectiveWeight(f.greet ? 1 - gw : 1); }
  if (f.greet){ f.greet.time = Math.max(0, Math.min(a.greetT, f.greet.getClip().duration - 1e-3)); f.greet.setEffectiveWeight(gw); }
  // The turn toward what they watch goes on top of the clips' pose, so each look bone first gets back the pose the clips
  // gave it last frame. The mixer writes a bone only when its value changed since the last update, and a bone that holds
  // still in both moves has no track at all (dev/figures.py drops them); left alone, last frame's turn would pile up.
  // Until 2026-10-24 they went back to the rest pose instead: on any frame the clips held a head, neck or chest still,
  // the mixer did not write it, and that bone showed its rest pose for one frame, the head's "faint twitch" the user saw.
  for (const [bone, , base] of f.look) bone.quaternion.copy(base);
  f.mixer.update(0);
  for (const [bone, , base] of f.look) base.copy(bone.quaternion);
  if (a.w < 1e-3 || !f.look.length) return;
  // turn chest, neck and head toward what they watch, each its share, in the figure's own frame
  f.root.updateMatrixWorld(true);
  f.root.getWorldQuaternion(qr); qri.copy(qr).invert();
  for (const [bone, part] of f.look){
    qt.setFromEuler(eul.set(-a.pitch*a.w*part, a.yaw*a.w*part, 0, 'YXZ'));
    qt.premultiply(qr).multiply(qri);   // that turn in world space
    bone.getWorldQuaternion(qb); bone.parent!.getWorldQuaternion(qp);
    bone.quaternion.copy(qp.invert().multiply(qt).multiply(qb));
    bone.updateMatrixWorld(true);
  }
}
function step(a: Actor, dt: number, watch: boolean){
  a.idleT = (a.idleT + dt) % CLIP;
  if (a.wait >= 0 && (a.wait -= dt) < 0) a.greetT = 0;
  else if (a.greetT >= 0 && (a.greetT += dt) >= CLIP) a.greetT = -1;
  // where to look, as a turn of the head in the figure's frame; a wave has its own head movement, so it mostly gives way
  let yaw = 0, pitch = 0, w = 0;
  if (watch){
    d.copy(tgt).sub(a === her ? herHead : pigHead).applyQuaternion(qFig);
    yaw = Math.max(-1.2, Math.min(1.2, Math.atan2(d.x, d.z)));
    pitch = Math.max(-0.35, Math.min(0.6, Math.atan2(d.y, Math.hypot(d.x, d.z))));
    // from the moment a wave is due: going by the wave's weight, which only ramps up over 0.35 s, the head first swung
    // toward the target and then back, a twitch at the start of every wave in playback
    w = a.greetT >= 0 || a.wait >= 0 ? 0.2 : 1;
  }
  // A critically damped spring per value, so a turn speeds up and slows down smoothly. Easing straight toward the target
  // (until 2026-10-24) gave the head its full speed in the frame the target changed, as each new gate came up in
  // playback, about every 1.9 s: a small start that read as a twitch.
  const o = 2*a.ease, s = (x: number, to: number, i: number) => { a.v[i] += (o*o*(to - x) - 2*o*a.v[i])*dt; return x + a.v[i]*dt; };
  a.yaw = s(a.yaw, yaw, 0); a.pitch = s(a.pitch, pitch, 1); a.w = Math.max(0, s(a.w, w, 2));
}

/* ---------- loading: the look shown and Kobuta first, the other looks when the page is idle ---------- */
// how long each took, in ms: from the request until it could show, and the part of that spent building it (on the main
// thread, with its textures uploaded and its programs compiled); Date.now, as screenshot tests stop performance.now
const loading: (Promise<void> | undefined)[] = [], ms: number[][] = [];
function request(i: number){
  if (loading[i]) return;
  const t0 = Date.now();
  loading[i] = fetch(URLS[i]).then(r => r.arrayBuffer()).then(b => loader.parseAsync(b, '')).then(g => {
    const t1 = Date.now(), f = build(g);
    if (i < 3) looks[i] = f; else kobuta = f;
    ms[i] = [Date.now() - t0, Date.now() - t1];
    const next = [0, 1, 2].find(k => !loading[k]);
    if (next === undefined) return;
    if ('requestIdleCallback' in window) requestIdleCallback(() => request(next)); else setTimeout(() => request(next), 300);
  }).catch(e => console.error('figure', i, e));
}
// the page opens at today
request(3); request(eraAt(NDAYS - 1));

/* ---------- each frame ---------- */
// where her name tag goes: above her head (src/main.ts)
export const tagAt = new V3();
// playing: the timeline runs; moved: the viewer moved it this frame (a change of look then shows at once)
export function updateFigures(dt: number, t: number, playing: boolean, moved: boolean){
  now += dt;
  waveNowAndThen(dt);
  const want = eraAt(t);
  request(want); request(3);
  if (looks[want] && want !== shown){
    // playback passing a change sweeps the new look up her body; anything else shows it at once
    if (shown >= 0 && playing && !moved){ prev = shown; sweep = 0; } else { prev = -1; sweep = 1; }
    shown = want;
  }
  if (sweep < 1 && (sweep += dt/CHANGE) >= 1) prev = -1;
  // they stand on her deck as the hull does: where her ship is (instance 0, src/formation.ts; fleetLineup may move it),
  // lifted and tilted with the swell there (ship.vert.glsl)
  const fx = OFF[0], fz = OFF[1], h = OFF[2], c = Math.cos(h), s = Math.sin(h), e = 0.05;
  const y0 = swellJS(fx, fz), gx = (swellJS(fx + e, fz) - swellJS(fx - e, fz))/(2*e), gz = (swellJS(fx, fz + e) - swellJS(fx, fz - e))/(2*e);
  qFig.setFromAxisAngle(UP, -h);   // world to figure frame
  uKeyF.value.copy(KEY).applyAxisAngle(UP, h);
  // what they watch: a firework about to burst and burning; else, while playing, the newest gate ahead of the bow, its top
  // beam or, while it is still under water, the spot where it will come up
  let watch = fwFrom <= now && now < fwTo;
  if (watch) tgt.copy(fwAt);
  else if (playing){
    for (let i = NM - 1; i >= 0; i--){
      const S = TA[i*4 + 3];
      if (S < -12.5) continue;
      if (S > -1.5) break;
      const H = TA[i*4 + 2], r = smooth(-12, -5.5, S);
      tgt.set(TA[i*4], Math.max(0, H*(0.94 - 1.10*(1 - r))), TA[i*4 + 1]); watch = true; break;
    }
  }
  const her0 = shown >= 0 ? looks[shown] : null, herPrev = prev >= 0 ? looks[prev] : null;
  for (const [a, figs] of [[her, [her0, herPrev]], [pig, [kobuta]]] as [Actor, (Figure | null)[]][]){
    const lx = a.at.x*FS, lz = a.at.z*FS, rx = lx*c + lz*s, rz = -lx*s + lz*c, H = a.at.h*FS;
    const P = (a === her ? herHead : pigHead).set(fx + rx, y0 + a.at.y*FS + rx*gx + rz*gz, fz + rz);
    if (a === her) tagAt.set(P.x, P.y + H + 0.45, P.z);
    P.y += 0.85*H;   // about where the eyes are
    step(a, dt, watch);
    for (const f of figs){
      if (!f) continue;
      f.root.position.set(P.x, P.y - 0.85*H, P.z); f.root.rotation.y = h; f.root.scale.setScalar(H); f.size.value = H;
      pose(f, a);
    }
  }
  // which models show, and the sweep's edge on each: the new look below it, the old one above
  const p = -0.08 + 1.16*smooth(0, 1, sweep);
  for (const f of [...looks, kobuta]){
    if (!f) continue;
    const on = f === her0 || f === herPrev || f === kobuta;
    f.root.visible = on; f.lines.forEach(l => { l.visible = on; });
    f.edge.set(p, f === herPrev ? 1 : f === her0 && herPrev ? -1 : 0);
  }
}
window.__figures = () => ({ era: shown, prev, sweep, loaded: looks.map(f => !!f).concat(!!kobuta), ms, greet: [her.greetT, pig.greetT], watch: [her.w, pig.w] });
window.__eraAt = eraAt;