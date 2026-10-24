// Each module builds its part of the scene when it is imported, so these imports run in the order the
// original single-file page created things. three.js breaks draw-order ties by creation order: keep it.
import * as THREE from 'three';
import { $ } from './dom';
import { DATA, FMAX, MONTHS, NDAYS, STAR_PER, dayClamp, di, follAt, lampAt } from './data';
import { PR, camera, canvas, onMotion, reduceMotion, renderer, scene, setMotion, setPR } from './renderer';
import { FS, KT, STYLE, U, V3, fogFor, setStyleName, swellJS } from './uniforms';
import './sky';
import { reflRT } from './ocean';
import { updateWaves } from './water';
import { DYN, GROUP, INFO, OFF, cullShips, outlineMeshes } from './fleet';
import { updateVeterans } from './veterans';
import './glow';
import { NM, TA, TORII_H, TORII_HY, iTA, toriiLines } from './torii';
import { updateSeasons } from './seasons';
import { updateRise } from './rise';
import { crest } from './flagship';
import { cueFigures, tagAt, updateFigures, watchFirework } from './figures';
import { R0, S0, clock, easeLamp, lampVis, slope, tick, updateFleet, worldX, xPath, type FleetLayout } from './formation';
import { VIEWS, cam, camC, camPin, fwSpot, setFullH, setSafeBottom, setSafeTop, updateCamera } from './camera';
import { FW_T, easeLift, fwShells, queueFirework, updateFireworks, updateSparks } from './fx';
import { composer, gradePass, renderReflection } from './post';
import { TL, cutIn, drawTimeline, drawTimelineStatic, tl, updateHud } from './hud';
import { CREST, LANPOS } from './ships';
import { select, updateNames } from './names';
import { updateInscriptions } from './inscriptions';

/* =====================================================================
   PLAYBACK + INPUT
   ===================================================================== */
const T_END = NDAYS - 0.02;
let t = T_END, tPrev = -1e9, playing = false, speedMul = 1, slowMo = true, lastDay = dayClamp(Math.floor(T_END));
// set when the viewer moves the timeline (drag, keys, starting over, a jump to a date); playback never sets it, at any
// speed or frame rate. Only such a move snaps the fleet, the camera and her bonfire to the day and clears the rising
// gates' water (src/rise.ts). Opening the page counts as one.
let seeked = true;
const BASE = 16;
const SPEEDS = [0.5, 1, 2, 4];
// 大事慢放. How hard a day's change hits is |change|/√(the larger total): the geometric mean of the absolute and the
// relative change, rises and falls alike, so 34 → 44 counts like 4000 → 4100. A day above SLOW_Z sets a peak slowdown
// held through that day; before it playback eases down and after it eases back as L/(days away), which at a steady
// rate is an exponential slowdown in real time (time constant L/16 s at 1×). Only the date decides it, so pausing and
// seeking change nothing.
const SLOW_Z = 1, SLOW_IN = 8, SLOW_OUT = 12;
const EVENTS: [number, number][] = [];
for (let d = 1; d < NDAYS; d++){
  const a = DATA.total[d-1], b = DATA.total[d], z = Math.abs(b - a)/Math.sqrt(Math.max(a, b, 1));
  if (z > SLOW_Z) EVENTS.push([d, 1 + 8*Math.pow(z - SLOW_Z, 0.7)]);
}
function slowAt(t: number){
  let f = 1;
  for (const [e, peak] of EVENTS){
    const away = t < e ? (e - t)/SLOW_IN : t < e + 1 ? 0 : (t - e - 1)/SLOW_OUT;
    f = Math.max(f, away ? Math.min(peak, Math.hypot(1, 1/away)) : peak);
  }
  return f;
}
const playBtn = $('play'), playText = $('playText'), slowBtn = $('slow'), speedBtn = $('speed'), viewBtn = $('view');
// the settings show their name and, in a chip, what they are set to (index.html); 大事慢放 is a switch drawn from aria-pressed
const setValue = (b: HTMLElement, v: string) => { b.querySelector('.v')!.textContent = v; };
// start: waiting at today, the first thing to press (src/style.css makes it glow); pause and resume pick the icon
function playLabel(){
  const start = !playing && t >= T_END-0.01;
  playText.textContent = playing ? '暂停' : start ? '从 2021 年开始' : '继续';
  playBtn.dataset.state = playing ? 'pause' : start ? 'start' : 'resume';
}
playBtn.addEventListener('click', () => { if (playing) playing = false; else { if (t >= T_END-0.01){ t = 0; lastDay = 0; seeked = true; } playing = true; cueFigures(); } playLabel(); });
slowBtn.addEventListener('click', () => { slowMo = !slowMo; slowBtn.setAttribute('aria-pressed', String(slowMo)); });
speedBtn.addEventListener('click', () => { speedMul = SPEEDS[(SPEEDS.indexOf(speedMul)+1) % SPEEDS.length]; setValue(speedBtn, speedMul + '×'); });
viewBtn.addEventListener('click', () => { cam.view = (cam.view+1) % VIEWS.length; cam.userAz = 0; cam.userEl = 0; cam.zoom = 1; setValue(viewBtn, VIEWS[cam.view].name); });
const sheets = [[$('findBtn'), $('find')], [$('legendBtn'), $('legend')]];
sheets.forEach(([btn, sheet]) => btn.addEventListener('click', () => {
  const open = sheet.hidden;
  sheets.forEach(([b, s]) => { s.hidden = true; b.setAttribute('aria-expanded', 'false'); });
  sheet.hidden = !open; btn.setAttribute('aria-expanded', String(open));
}));
function setCinema(on: boolean){
  document.body.classList.toggle('cinema', on);
  // a ship picked before stays out of it: its tag is hidden there, and the camera flew to it when it came on board
  if (on){ select(-1); t = 0; lastDay = 0; seeked = true; playing = true; cam.userAz = 0; cam.userEl = 0; cam.zoom = 1; cueFigures(); $('exitCinema').focus(); }
  playLabel(); resize();
}
const styleBtn = $('style');
function setStyle(s: string){
  setStyleName(s); const toon = s === 'toon' ? 1 : 0;
  U.uToon.value = toon; if (gradePass) gradePass.uniforms.uToon.value = toon;
  U.uFogColor.value.copy(fogFor(!!toon));
  document.body.classList.toggle('toon', !!toon);   // the flat 2D layer in src/style.css
  // ink lines are 二次元 only; hidden in 写实 so their vertices are not run for nothing
  [...Object.values(outlineMeshes), toriiLines].forEach(m => { m!.visible = !!toon; });
  setValue(styleBtn, toon ? '二次元' : '写实');
  styleBtn.setAttribute('aria-pressed', String(!!toon));
  try { localStorage.setItem('hane-voyage-style', s); } catch(e){}
}
setStyle(STYLE);
styleBtn.addEventListener('click', () => setStyle(STYLE === 'toon' ? 'real' : 'toon'));
// 动态: full by default, whatever the system says; 减少 keeps the water and the fleet calm (src/renderer.ts)
const motionBtn = $('motion');
onMotion(calm => { setValue(motionBtn, calm ? '减少' : '完整'); motionBtn.setAttribute('aria-pressed', String(!calm)); });
motionBtn.addEventListener('click', () => setMotion(!reduceMotion));
window.fleetStyle = s => setStyle(s);
$('cinema').addEventListener('click', () => setCinema(true));
$('exitCinema').addEventListener('click', () => setCinema(false));
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('cinema')){ setCinema(false); return; }
  // a button keeps Space for itself and the search field every key; the arrows still move the day from a button, which
  // keeps the focus after a click (until 2026-10-24 they did nothing after pressing 暂停 until a click elsewhere)
  const target = e.target as Element;
  if (target.closest && target.closest(e.key === ' ' ? 'button,label,input' : 'input')) return;
  if (e.key === ' '){ e.preventDefault(); playBtn.click(); }
  else if (e.key === 'ArrowRight'){ t = Math.min(T_END, t + (e.shiftKey ? 30 : 1)); seeked = true; playLabel(); }
  else if (e.key === 'ArrowLeft'){ t = Math.max(0, t - (e.shiftKey ? 30 : 1)); seeked = true; playLabel(); }
});
let scrubbing = false;
const scrubTo = (e: PointerEvent) => { const r = tl.getBoundingClientRect(); const u = (e.clientX - r.left - TL.x0)/(TL.x1-TL.x0); t = Math.max(0, Math.min(T_END, u*(NDAYS-1) + 0.5)); lastDay = dayClamp(Math.floor(t)); seeked = true; playLabel(); };
tl.addEventListener('pointerdown', e => { scrubbing = true; tl.setPointerCapture(e.pointerId); scrubTo(e); });
tl.addEventListener('pointermove', e => { if (scrubbing) scrubTo(e); });
tl.addEventListener('pointerup', () => { scrubbing = false; });
tl.addEventListener('pointercancel', () => { scrubbing = false; });
const ptrs = new Map<number, { x: number; y: number }>(); let pinch0 = 0, zoom0 = 1;
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (ptrs.size === 2){ const [a,b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x-b.x, a.y-b.y); zoom0 = cam.zoom; } });
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size === 1){ cam.userAz -= (e.clientX - p.x)*0.005; cam.userEl = Math.max(-0.4, Math.min(1.0, cam.userEl + (e.clientY - p.y)*0.003)); }
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2){ const [a,b] = [...ptrs.values()]; const dd = Math.hypot(a.x-b.x, a.y-b.y); if (pinch0 > 0) cam.zoom = Math.max(0.3, Math.min(2.6, zoom0*pinch0/dd)); }
});
const endPtr = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = Math.max(0.3, Math.min(2.6, cam.zoom*Math.exp(e.deltaY*0.0012))); }, {passive:false});

const tag = $('flagTag'); const tagV = new V3();
function updateFlagshipExtras(){
  const fx = OFF[0], fz = OFF[1], deck = swellJS(fx, fz);
  const h = OFF[2], c = Math.cos(h), s = Math.sin(h);
  const lp = [LANPOS.flag[0]*FS, LANPOS.flag[1]*FS, LANPOS.flag[2]*FS];
  U.uLampPos.value.set(fx + lp[0]*c + lp[2]*s, deck + lp[1], fz - lp[0]*s + lp[2]*c);
  const cz = CREST.z*FS;
  crest.position.set(fx + cz*s, deck + CREST.y*FS, fz + cz*c); crest.rotation.set(0, h, 0); crest.scale.setScalar(CREST.s*FS);
  tagV.copy(tagAt).project(camera);
  if (tagV.z > 1 || Math.abs(tagV.x) > 1.1 || Math.abs(tagV.y) > 1.1){ tag.hidden = true; return; }
  tag.hidden = false;
  tag.style.transform = `translate(${(tagV.x*0.5+0.5)*canvas.clientWidth}px, ${(-tagV.y*0.5+0.5)*canvas.clientHeight}px) translate(-50%,-100%)`;
}
function fleetUniforms(fl: FleetLayout){
  const Lv = Math.max(fl.Lv, 4), Smid = S0 + 0.45*Lv, Send = S0 + Math.max(Lv, fl.tail);
  U.uFleetC.value.set(worldX(Smid), -Smid);
  U.uFleetR.value.set(0.19*Lv + R0 + 3, 0.55*Lv + 6);
  U.uFleetS.value.set(S0 - 2, Send + 2);
  U.uFleetGlow.value = Math.min(1.15, Math.log10(fl.total + 1)/3.6);
  U.uFleetDir.value.set(U.uFleetC.value.x - camC.x, 0, U.uFleetC.value.y - camC.z);
  U.uWin.value.set(-4, Send + 70);
}
function updateTorii(){
  for (let i = 0; i < NM; i++){
    const S = (t - MONTHS[i].d)*KT;
    TA[i*4] = worldX(S); TA[i*4+1] = -S; TA[i*4+2] = MONTHS[i].m === 1 ? TORII_HY : TORII_H; TA[i*4+3] = S;
  }
  iTA.needsUpdate = true;
}

// rows of the view shifted under the dock, so the fleet sits in the visible part (below zero: shifted the other way,
// above the canvas's top)
let viewOff = 0;
function resize(){
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(PR);
  renderer.setSize(w, h, false);
  camera.aspect = w/h;
  const cinema = document.body.classList.contains('cinema'), top = canvas.getBoundingClientRect().top;
  const dockH = cinema ? 0 : $('dock').offsetHeight, hud = document.querySelector('.hud') as HTMLElement, hudH = cinema ? 0 : hud.offsetHeight;
  viewOff = Math.max(0, Math.round(dockH - hudH*0.6));
  // On a tall screen the board covers the top and the dock the bottom, both across the whole width: the view is centred
  // on the band between them. Shifted as on a wide screen, it sat 50 px high, and with the board over the gates' tops
  // a rising gate's water line was left at the dock's edge (2026-10-23).
  if (!cinema && camera.aspect < 0.9) viewOff = Math.round(h - (hud.getBoundingClientRect().bottom - top) - ($('dock').getBoundingClientRect().top - top));
  if (viewOff > 0) camera.setViewOffset(w, h + viewOff, 0, viewOff, w, h);
  else if (viewOff < 0) camera.setViewOffset(w, h - viewOff, 0, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  setFullH(h + Math.abs(viewOff));
  // the dock's top edge (with its slanted band) on the canvas, less a small gap; the whole canvas in cinema mode
  setSafeBottom(cinema ? h : $('dock').getBoundingClientRect().top - top - 24);
  setSafeTop(!cinema && camera.aspect < 0.9 ? hud.getBoundingClientRect().bottom - top + 12 : 0);
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  U.uPR.value = PR; U.uRes.value.copy(db);
  reflRT.setSize(Math.max(2, Math.round(db.x/2)), Math.max(2, Math.round(db.y/2)));
  if (composer){ composer.setPixelRatio(PR); composer.setSize(w, h); gradePass!.uniforms.uRes.value.copy(db); }
  const bar = w > h ? Math.max(0, (h - w/2.39)/2) : 0;
  document.documentElement.style.setProperty('--bar', bar + 'px');
  document.documentElement.style.setProperty('--dock-h', $('dock').offsetHeight + 'px');
  drawTimelineStatic();
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(() => resize()).observe($('dock'));
resize();
playLabel();

// quality steps down on slow devices: pixel ratio, then reflections
let reflOn = true;
let qLevel = 2, slowT = 0, qClock = 0;
function adaptQuality(raw: number){
  if (window.__fixedQuality) return;
  // a frame counts for at most a quarter second: a hidden tab, a sleeping laptop or a dragged window stops the frames
  // for as long as it lasts, and one such gap took a step of quality away for good (until 2026-10-24)
  raw = Math.min(raw, 0.25);
  qClock += raw; if (qClock < 5) return;
  if (raw > 0.045) slowT += raw; else slowT = Math.max(0, slowT - raw*0.5);
  if (slowT > 2.5 && qLevel > 0){ qLevel--; slowT = 0; qClock = 3; if (qLevel === 1){ setPR(1); setSamples(2); resize(); } else { reflOn = false; setSamples(0); } }
}
function setSamples(n: number){
  if (!composer) return;
  [composer.renderTarget1, composer.renderTarget2].forEach(r => {
    if (r && r.samples > n){ r.samples = n; r.dispose(); }   // reallocated on next use
  });
}

// for reviewing specific moments: fleetSeek("2022-10-16"), fleetView(1), fleetCinema(true)
window.fleetSeek = s => { const [y,m,d] = String(s).split('-').map(Number); t = Math.max(0, Math.min(T_END, di(y,m,d) + 0.6)); lastDay = dayClamp(Math.floor(t)); seeked = true; playing = false; playLabel(); };
window.fleetView = n => { cam.view = n % VIEWS.length; setValue(viewBtn, VIEWS[cam.view].name); };
window.fleetCinema = on => setCinema(!!on);
window.fleetFirework = k => queueFirework(k);

window.fleetOrbit = (az, el, zoom) => { cam.userAz = az || 0; cam.userEl = el || 0; cam.zoom = zoom || 1; };
// for reviewing the ship models: one ship of each kind in a row abreast of her on open water, seen from dist units off
// the bow quarter (az turns the camera round them). With k (0 flagship … 4 anonymous) only that ship is posed and the
// camera stands dist times its size off; with px as well, the whole row is posed and the camera backs off until the
// captain is px pixels tall. fleetLineup(0) puts them back in the fleet.
let lineup = 0, lineupAz = 0, lineupK = -1, lineupPx = 0;
window.fleetLineup = (dist, az, k, px) => { lineup = dist || 0; lineupAz = az || 0; lineupK = k ?? -1; lineupPx = px || 0; camPin.on = lineup > 0; };
function poseLineup(){
  const h = Math.atan(-slope(0)), row: [number, number][] = [[0, FS], [GROUP.sou.start + GROUP.sou.count - 1, 2.3], [GROUP.tei.start + GROUP.tei.count - 1, 1.6], [GROUP.kan.start + GROUP.kan.count - 1, 1], [GROUP.anon.start + GROUP.anon.count - 1, 0.9]];
  // ahead of her bow on open water, so neither the gates nor the fleet stand between them and the camera
  const z = 40, xs: number[] = [], solo = lineupK >= 0 && !lineupPx;
  let x = xPath(-z) - FS*0.5;
  row.forEach(([i, s], k) => { x += s*0.55; xs.push(x); x += s*0.55 + 0.5;
    if (!solo || k === lineupK){ OFF[i*4] = xs[k]; OFF[i*4+1] = z; OFF[i*4+2] = h; OFF[i*4+3] = s; DYN[i*2] = 1; DYN[i*2+1] = 1; } });
  const a = 0.45 + lineupAz;
  let mx = (xs[0] - FS*0.3 + x)/2, d = lineup, y = 1.0;
  if (solo){ mx = xs[lineupK]; d = lineup*row[lineupK][1]; y = row[lineupK][1]*0.12; }
  else if (lineupPx){ mx = (xs[0] - FS*0.3 + x)/2; d = U.uPx.value*0.93/lineupPx; y = 0.4; }
  camPin.T.set(mx, y, z); camPin.C.set(mx + d*Math.sin(a), y + d*0.2, z + d*Math.cos(a)); camPin.fov = 30;
}
window.__fleet = { OFF, DYN, INFO, updateFleet };
const DT_MAX = window.__dtMax || 0.05;
// they turn to watch each firework from launch; it bursts 1.7 s later (TR in src/fx.ts)
const fwSpotWatched: typeof fwSpot = (fl, place, u, v) => { const s = fwSpot(fl, place, u, v); watchFirework(s.P, 1.7); return s; };
let bigWas = 1;
let last = performance.now();
function frame(now: number){
  const raw = (now - last)/1000, dt = Math.min(DT_MAX, raw); last = now; tick(dt);
  const big = slowAt(t), slow = slowMo ? big : 1;
  // she and Kobuta wave as a big day's slowdown sets in, 大事慢放 or not
  if (playing && big > 2 && bigWas <= 2) cueFigures();
  bigWas = big;
  if (playing && !scrubbing){
    t += BASE*speedMul/slow*dt;
    if (t >= T_END){ t = T_END; playing = false; playLabel(); }
  }
  const dNow = dayClamp(Math.floor(t));
  if (playing && dNow > lastDay && dNow - lastDay < 60){
    for (let d = lastDay + 1; d <= dNow; d++){
      const a = DATA.total[d-1], b = DATA.total[d];
      for (let k = fwShells(a, b); k > 0; k--) queueFirework();
      if (U.uToon.value > 0.5) for (const T of FW_T) if (a < T && b >= T) cutIn(T, d);
    }
  }
  lastDay = dNow;
  // at 4× below about 26 fps playback itself passes 2.5 days a frame; judged by the distance alone, the ships were set
  // down at their berths every frame instead of sailing in and out, and the camera cut each frame (until 2026-10-24)
  const jump = seeked && Math.abs(t - tPrev) > 2.5;
  easeLamp(lampAt(t), Math.min(1, dt*(jump ? 60 : 6)));
  U.uTime.value = clock; U.uTravel.value = KT*t + 0.5*clock; U.uDay.value = t; U.uLamp.value = 0.08 + 0.92*lampVis;
  // the ships slow down with the date, to a third when hundreds come or go at once
  const fl = updateFleet(t, dt*Math.max(1/3, slow**-0.25), jump);
  if (lineup) poseLineup();
  updateVeterans(dNow, dt);
  easeLift(dt);
  updateCamera(dt, fl, jump);
  cullShips(camera.position, U.uPx.value, U.uToon.value > 0.5);
  fleetUniforms(fl);
  updateFigures(dt, t, playing && !scrubbing, seeked);
  updateFlagshipExtras();
  updateNames(dNow, dt);
  updateTorii();
  updateInscriptions(t, dt);
  updateRise(dt, jump); seeked = false;
  updateSeasons(t);
  updateSparks(dt);
  updateFireworks(fl, fwSpotWatched);
  const F = follAt(t);
  U.uStarCount.value = F/STAR_PER; U.uBand.value = Math.pow(F/FMAX, 0.6);
  updateWaves(clock);
  if (reflOn){ renderReflection(); U.uReflOn.value = 1; } else U.uReflOn.value = 0;
  if (composer){ gradePass!.uniforms.uTime.value = clock; composer.render(dt); } else renderer.render(scene, camera);
  updateHud(t, fl); drawTimeline(t);
  tPrev = t;
  adaptQuality(raw);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
