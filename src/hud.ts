import { $ } from './dom';
import { AMAX, DATA, FMAX, NDAYS, NN, NPD, TMAX, VET_N, dayClamp, di, fmtDay, follAt, lampAt } from './data';
import type { FleetLayout } from './formation';

/* =====================================================================
   HUD + TIMELINE
   ===================================================================== */
export const nf = (n: number) => Math.round(n).toLocaleString('en-US');
const css = getComputedStyle(document.documentElement);
const tok = (n: string) => css.getPropertyValue(n).trim();
export const tl = $<HTMLCanvasElement>('timeline'), tctx = tl.getContext('2d')!;
// a slider for screen readers and the keyboard (Tab reaches it, the arrows move it: src/main.ts); updateHud sets the day
tl.setAttribute('aria-valuemin', '0'); tl.setAttribute('aria-valuemax', String(NDAYS - 1));
let tlCache: HTMLCanvasElement | null = null;
// set by the first drawTimelineStatic() that finds the timeline laid out
export let TL!: ReturnType<typeof tlLayout>;
function tlLayout(){ const w = tl.clientWidth, h = tl.clientHeight; return { w, h, x0:34, x1:w-8, mainTop:16, mainBot:58, litY:63, folTop:70, folBot:84, yearY:h-2 }; }
const tx = (d: number) => TL.x0 + (d/(NDAYS-1))*(TL.x1-TL.x0);
const ty = (v: number) => TL.mainBot - Math.sqrt(Math.max(0,v)/(TMAX*1.06))*(TL.mainBot-TL.mainTop);
const fy = (v: number) => TL.folBot - (v/(FMAX*1.05))*(TL.folBot-TL.folTop);
function hexA(hex: string, a: number){ const h = hex.replace('#',''); const n = parseInt(h.length===3 ? h.split('').map(x=>x+x).join('') : h, 16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }
export function drawTimelineStatic(){
  if (!tl.clientWidth) return;
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  TL = tlLayout();
  tl.width = Math.round(TL.w*dpr); tl.height = Math.round(TL.h*dpr);
  tlCache = document.createElement('canvas'); tlCache.width = tl.width; tlCache.height = tl.height;
  const c = tlCache.getContext('2d')!; c.scale(dpr, dpr);
  const mute = tok('--mute'), ember = tok('--ember'), slate = tok('--slate'), frost = tok('--frost'), moon = tok('--moon');
  c.font = '10px ' + tok('--f-data'); c.textBaseline = 'middle';
  [100, 1000, 5000].forEach(v => { if (v > TMAX) return; const y = ty(v);
    c.strokeStyle = 'rgba(200,212,232,0.10)'; c.lineWidth = 1; c.setLineDash([2,3]);
    c.beginPath(); c.moveTo(TL.x0, y); c.lineTo(TL.x1, y); c.stroke(); c.setLineDash([]);
    c.fillStyle = mute; c.textAlign = 'right'; c.fillText(v >= 1000 ? (v/1000)+'k' : String(v), TL.x0-6, y); });
  c.textAlign = 'right'; c.fillStyle = mute;
  c.fillText('火', TL.x0-6, TL.litY+1); c.fillText('星', TL.x0-6, (TL.folTop+TL.folBot)/2);
  const W = Math.max(1, Math.floor(TL.x1-TL.x0));
  const area = (arr: ArrayLike<number>, fill: string) => {
    c.beginPath(); c.moveTo(tx(0), ty(0));
    for(let p=0; p<=W; p++){
      const d0 = Math.floor(p/W*(NDAYS-1)), d1 = Math.max(d0, Math.floor((p+1)/W*(NDAYS-1))-1);
      let m = 0; for(let d=d0; d<=Math.min(d1,NDAYS-1); d++) m = Math.max(m, arr[d]);
      c.lineTo(TL.x0+p, ty(m));
    }
    c.lineTo(tx(NDAYS-1), ty(0)); c.closePath(); c.fillStyle = fill; c.fill();
  };
  area(DATA.total, hexA(slate, 0.50));
  area(NPD, hexA(ember, 0.85));
  for(let p=0; p<W; p++){
    const d0 = Math.floor(p/W*NDAYS), d1 = Math.max(d0+1, Math.floor((p+1)/W*NDAYS));
    let s = 0; for(let d=d0; d<d1; d++) s += DATA.live[Math.min(d,NDAYS-1)];
    c.fillStyle = hexA(ember, 0.15 + 0.75*s/(d1-d0)); c.fillRect(TL.x0+p, TL.litY, 1, 3);
  }
  c.beginPath();
  for(let p=0; p<=W; p++){ const d = Math.min(NDAYS-1, Math.round(p/W*(NDAYS-1))); const y = fy(DATA.followers[d]); p ? c.lineTo(TL.x0+p, y) : c.moveTo(TL.x0, y); }
  c.strokeStyle = hexA(frost, 0.85); c.lineWidth = 1.2; c.stroke();
  c.textAlign = 'center';
  for(let y=2022; di(y,1,1) < NDAYS; y++){ const x = tx(di(y,1,1));
    c.fillStyle = 'rgba(200,212,232,0.18)'; c.fillRect(x, TL.mainTop, 1, TL.folBot-TL.mainTop);
    c.fillStyle = mute; c.fillText(String(y), x, TL.yearY - 5); }
  const dot = (x: number, y: number) => { c.beginPath(); c.arc(x,y,2.6,0,Math.PI*2); c.fillStyle = moon; c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(4,6,13,0.9)'; c.stroke(); };
  DATA.anchors.total.forEach(([d,v]) => dot(tx(d), ty(v)));
  DATA.anchors.followers.forEach(([d,v]) => dot(tx(d), fy(v)));
  c.fillStyle = moon; c.font = '500 10px ' + tok('--f-data');
  const pk = DATA.anchors.total.find(a => a[1] === 1031);
  if (pk){ c.textAlign = 'left'; c.fillText('1,031', tx(pk[0])+5, ty(pk[1])-1); }
  // the curve's end is labelled with the last day's total; it labelled the last verified dot until 2026-10-24, which
  // stood at the end then but read as today's number once the data ran past it (7,027 beside today's 7,181)
  const lv = DATA.total[NDAYS-1];
  c.textAlign = 'right'; c.fillText(nf(lv), tx(NDAYS-1)-6, ty(lv)+1);
}
export function drawTimeline(t: number){
  if (!tlCache || !TL) return;
  const dpr = tl.width / TL.w;
  tctx.setTransform(1,0,0,1,0,0); tctx.clearRect(0,0,tl.width,tl.height); tctx.drawImage(tlCache,0,0);
  tctx.setTransform(dpr,0,0,dpr,0,0);
  const x = tx(Math.min(t, NDAYS-1));
  tctx.fillStyle = tok('--moon'); tctx.fillRect(Math.round(x)-0.5, TL.mainTop-6, 1.5, TL.folBot-TL.mainTop+8);
  tctx.beginPath(); tctx.arc(x, ty(DATA.total[dayClamp(Math.floor(t))]), 3.4, 0, Math.PI*2); tctx.fillStyle = tok('--ember'); tctx.fill();
}
// the cut-in (src/style.css) plays once per crossing and hides itself when the band's animation ends.
// A crossing that comes while the band is still in or holding only changes the text, so the band does not jump back.
// 二次元's band runs across the screen; 写实's title card sits in the open sea between the readouts and the dock, as
// they stand when it starts (both hidden in cinema mode, where it centres on the picture).
const cut = $('cutin'), band = cut.querySelector('.band')!;
export function cutIn(n: number, d: number){
  cut.querySelector('b')!.textContent = nf(n);
  cut.querySelector('i')!.textContent = fmtDay(d);
  const held = band.getAnimations()[0]?.currentTime;
  if (!cut.hidden && typeof held === 'number' && held < 1500) return;
  cut.style.setProperty('--t', Math.max(...['.hud', '.board'].map(s => document.querySelector(s)!.getBoundingClientRect().bottom)) + 'px');
  cut.style.setProperty('--b', $('dock').offsetHeight + 'px');
  cut.hidden = false; cut.classList.remove('play'); void cut.offsetWidth; cut.classList.add('play');
}
band.addEventListener('animationend', e => { if (e.target === band){ cut.hidden = true; cut.classList.remove('play'); } });
let lastHud: Record<string, string> = {};
function setText(id: string, v: string){ if (lastHud[id] !== v){ $(id).textContent = v; lastHud[id] = v; } }
// the board's bar: one segment per part, as long as its share of the day's crew
const barS = $('bBarS'), barL = $('bBarL');
// the board's big figures are as wide as their largest value over the voyage (the figures are tabular), so a day with
// more digits never widens the right column and squeezes the left one into wrapping
{ const most: Record<string, number> = { bTotal:Math.max(TMAX, NN), bStay:NPD[NDAYS-1], bLeft:AMAX };
  for (const id in most) $(id).style.minWidth = nf(most[id]).length + 'ch'; }
let lastBar = '';
export function updateHud(t: number, f: FleetLayout){
  const d = dayClamp(Math.floor(t));
  setText('date', fmtDay(d)); setText('cDate', fmtDay(d));
  if (lastHud.tl !== fmtDay(d)){ lastHud.tl = fmtDay(d); tl.setAttribute('aria-valuenow', String(d)); tl.setAttribute('aria-valuetext', fmtDay(d)); }
  setText('bTotal', nf(f.total)); setText('bStay', nf(f.Np)); setText('bKan', nf(f.Np - f.nEsc)); setText('bGuard', nf(f.nEsc)); setText('bLeft', nf(f.A));
  setText('bV3', nf(VET_N[2][d])); setText('bV2', nf(VET_N[1][d])); setText('bV1', nf(VET_N[0][d]));
  const bar = f.Np + ':' + f.A;
  if (bar !== lastBar){ lastBar = bar; barS.style.flexGrow = String(f.Np); barL.style.flexGrow = String(f.A); barS.hidden = !f.Np; barL.hidden = !f.A; }
  const F = follAt(t);
  setText('sStar', F >= 10000 ? (F/10000).toFixed(1)+' 万' : nf(F));
  // the bonfire's brightness (src/data.ts LAMP) in one word
  const lamp = lampAt(t);
  setText('sLamp', lamp >= 0.85 ? '旺' : lamp >= 0.5 ? '燃' : lamp >= 0.2 ? '微' : '熄');
  setText('cSub', `大航海 ${nf(f.total)} · 陪伴至今 ${nf(f.Np)}` + (VET_N[2][d] ? `（一年以上 ${nf(VET_N[2][d])}）` : '') + (f.A ? ` · 后来离开 ${nf(f.A)}` : ''));
}
