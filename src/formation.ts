import { DATA, LEVEL, NDAYS, NN, NPD, START, dayClamp } from './data';
import { ANON_SCALE, FS, SCALE_BY_LEVEL } from './uniforms';
import type { GroupKey } from './geometry';
import { ANON_N, DYN, GROUP, INFO, INST, JX, JZ, NI, OFF, PH, groupMeshes, iDyn, iOff, lDyn, lOff } from './fleet';
import { reduceMotion } from './renderer';

/* =====================================================================
   FORMATION: a feather.
   The rachis (centre lane) carries 提督/总督 and is where the torii stand.
   舰长 sit on the barbs to both sides, then the anonymous lights.
   Barb berths are a fixed lattice; each berth's order is the feather size
   at which it first falls inside the outline, so at any fleet size the
   occupied berths form a whole feather, and the earliest sit nearest her.
   ===================================================================== */
export const S0 = 0.62*FS + 2.2;          // the vane starts just behind her stern
export const R0 = 5.2;                    // half-width of the rachis lane, wide enough for the torii legs
const DB = 1.55, DA = 0.92;        // barb spacing along the rachis, berth spacing along a barb
const CRW = 0.21, CLW = 0.155;     // vane half-width per unit length, right / left
const BEND = 0.0006;               // the feather curves a little
const gF = (u: number) => (u <= 0 || u >= 1) ? 0 : Math.pow(u, 0.4)*Math.pow(1 - u, 0.6)/0.5104;
const insideF = (s: number, l: number, L: number) => { if (s < 0 || s > L) return false; return Math.abs(l) - R0 <= (l > 0 ? CRW : CLW)*L*gF(s/L); };
// Each barb is a lane: its slots run from the rachis outward, LSS/LSL[LS0[b] + slot]. Along a barb the order above
// only grows, so the berths in use always fill each barb from its root: the water beyond a barb's last ship is
// clear all the way out, and ships come and go only that way, along the barb.
let NL = 0, NBS = 0;
let LS0: Int32Array, LN: Int32Array, LSS: Float32Array, LSL: Float32Array;
let ORD: Int32Array, RANK: Int32Array, SLANE: Int32Array, SSLOT: Int32Array, BSIG: Float32Array;
{
  const ps: number[] = [], pl: number[] = [], lane: number[] = [], slot: number[] = [], ls0: number[] = [], ln: number[] = [], LMAX = 340;
  for (let j = 0; j*DB < LMAX; j++){
    const sb = j*DB;
    for (const side of [1, -1]){
      const cmax = (side > 0 ? CRW : CLW)*LMAX + R0 + 1;
      let s = sb, l = 0, d = 0, acc = 0, k = 0;
      ls0.push(ps.length);
      while (l < cmax && s < LMAX){
        const beta = (47 - 10*Math.min(1, d/45))*Math.PI/180, st = 0.23;
        s += st*Math.cos(beta); l += st*Math.sin(beta); d += st; acc += st;
        if (l >= R0 && acc >= DA){ ps.push(s); pl.push(side*l); lane.push(ln.length); slot.push(k++); acc = 0; }
      }
      ln.push(k);
    }
  }
  const n = ps.length, sig = new Float32Array(n);
  for (let i = 0; i < n; i++){
    const s = ps[i], l = pl[i]; let lo = 0, hi = 900;
    for (let it = 0; it < 36; it++){ const m = (lo + hi)/2; if (insideF(s, l, m)) hi = m; else lo = m; }
    sig[i] = hi;
  }
  const order = Array.from({ length:n }, (_, i) => i).sort((a, b) => sig[a] - sig[b]);
  NL = ln.length; NBS = n;
  LS0 = Int32Array.from(ls0); LN = Int32Array.from(ln); LSS = Float32Array.from(ps); LSL = Float32Array.from(pl);
  SLANE = Int32Array.from(lane); SSLOT = Int32Array.from(slot);
  ORD = Int32Array.from(order); RANK = new Int32Array(n); BSIG = new Float32Array(n);
  for (let r = 0; r < n; r++){ RANK[order[r]] = r; BSIG[r] = sig[order[r]]; }
}
// 提督/总督 sail the rachis, under the gates, by rank first: 总督 in single file down the middle, nearest her, and 提督
// two (or four) abreast either side of them, starting half a 总督 row back. In each file the longer with her sail
// nearer (boarding order), so one boarding later always takes the back of its file and comes in along it without
// passing anyone. The spacing is set once from today's fleet, so the big ships never shuffle. (Before 2026-10-24 both
// ranks shared the files in boarding order alone, which put all three 总督, aboard 12 days, behind older 提督.)
const ESC_L = [0, -1.4, 1.4, -2.6, 2.6];   // lane 0 the 总督 file; the 提督 files after it
const NESC = new Int32Array(NDAYS);
{ let k = 0, e = 0; for (let d = 0; d < NDAYS; d++){ for (; k < NPD[d]; k++) if (LEVEL[k] < 3) e++; NESC[d] = e; } }
const feather = (d: number) => { const nb = Math.min(NBS, NPD[d] - NESC[d] + Math.max(0, DATA.total[d] - NPD[d])); return nb > 0 ? BSIG[nb-1] : 4; };
let NTEI = 0; for (let k = 0; k < NN; k++) if (LEVEL[k] === 2) NTEI++;
const ELANES = (() => { const Lr = Math.max(feather(NDAYS-1), 10); return NTEI*2.6 <= 2*Lr ? 2 : 4; })();
const ESP = (() => { const rows = Math.ceil(NTEI/ELANES), Lr = Math.max(feather(NDAYS-1), 10); return Math.max(2.5, Math.min(6.5, Lr*0.95/Math.max(1, rows))); })();
const ESPS = Math.max(ESP, 3.2);   // a 总督 is 2.3 long
const ETAIL = new Float32Array(NDAYS);   // the farthest berth on the rachis taken on each day

/* =====================================================================
   THE PLAN: where every ship is on every day, worked out once.
   Named ships keep one berth for good: the k-th 舰长 by boarding day berth k, the e-th 提督/总督 row e.
   The anonymous lights are people who were on board then and left later; the data only says how many each day.
   Each light gets its own berth when it boards and keeps it. When the count drops, the lights at the highest
   berths (at the feather's edge) leave; when it rises, new lights take the lowest free berths, on a barb no light
   left from in the last COOL days if there is one, so one does not come in where another is still sailing out.
   When a 舰长 boards while lights sit on the 舰长's slot or beyond it on that barb, those lights leave and as many
   new ones board elsewhere, so the 舰长 can sail in from the barb's tip.
   ===================================================================== */
const COOL = 24;
const NLANE = new Int32Array(NN), NX = new Float32Array(NN);
let A_ARR: Int32Array, A_DEP: Int32Array, A_BER: Int32Array, ARR0: Int32Array, DEP0: Int32Array, DEPO: Int32Array;
{
  for (let k = 0, kk = 0, ks = 0, kt = 0; k < NN; k++){
    if (LEVEL[k] === 3){ const raw = ORD[kk++]; NLANE[k] = SLANE[raw]; NX[k] = SSLOT[raw]; }
    else if (LEVEL[k] === 1){ NLANE[k] = NL; NX[k] = 0.6 + (ks++)*ESPS; }
    else { const e = kt++, row = Math.floor(e/ELANES), q = e % ELANES; NLANE[k] = NL + 1 + q; NX[k] = 0.6 + 0.5*ESPS + row*ESP + (q >= 2 ? ESP*0.5 : 0); }
  }
  for (let d = 0, k = 0, t = 0; d < NDAYS; d++){ for (; k < NPD[d]; k++) if (LEVEL[k] < 3) t = Math.max(t, NX[k]); ETAIL[d] = t; }
  const arr: number[] = [], dep: number[] = [], ber: number[] = [];
  const occ = new Int32Array(NBS).fill(-1), gone = new Float64Array(NL).fill(-1e9);   // -1 free, -2 舰长, else a light
  let nK = 0, nA = 0, hi = -1;
  const leave = (id: number, d: number) => { dep[id] = d; occ[ber[id]] = -1; gone[SLANE[ORD[ber[id]]]] = d; nA--; };
  for (let d = 0; d < NDAYS; d++){
    for (let k = d ? NPD[d-1] : 0; k < NPD[d]; k++){
      if (LEVEL[k] !== 3) continue;
      const r = nK++, raw = ORD[r], end = LS0[SLANE[raw]] + LN[SLANE[raw]];
      for (let q = raw; q < end; q++){ const id = occ[RANK[q]]; if (id < 0) break; leave(id, d); }
      occ[r] = -2;
    }
    const A = Math.max(0, DATA.total[d] - NPD[d]);
    while (nA > A){ while (occ[hi] < 0) hi--; leave(occ[hi], d); }
    let from = nK;
    while (nA < A){
      // the lowest free berth whose barb is not cooling down, looking at most 400 berths past the lowest free one
      let pick = -1, first = -1;
      for (let r = from; r < NBS; r++){
        if (occ[r] !== -1) continue;
        if (first < 0) first = r;
        if (d - gone[SLANE[ORD[r]]] > COOL){ pick = r; break; }
        if (r - first > 400) break;
      }
      if (pick < 0) pick = first;
      occ[pick] = arr.length; arr.push(d); dep.push(NDAYS); ber.push(pick); nA++; hi = Math.max(hi, pick);
      from = first;
    }
  }
  A_ARR = Int32Array.from(arr); A_DEP = Int32Array.from(dep); A_BER = Int32Array.from(ber);
  // lights boarding on day d are ids ARR0[d] .. ARR0[d+1]-1 (ids are in boarding order); leaving, DEPO[DEP0[d] .. DEP0[d+1]-1]
  ARR0 = new Int32Array(NDAYS + 1); DEP0 = new Int32Array(NDAYS + 2);
  for (const d of arr) ARR0[d+1]++;
  for (const d of dep) DEP0[d+1]++;
  for (let d = 0; d < NDAYS; d++) ARR0[d+1] += ARR0[d];
  for (let d = 0; d <= NDAYS; d++) DEP0[d+1] += DEP0[d];
  DEPO = new Int32Array(dep.length); const fill = DEP0.slice();
  for (let id = 0; id < dep.length; id++) DEPO[fill[dep[id]]++] = id;
}
const NA = A_ARR.length;

const MA = 4.5, MW = 0.045, MVP = 2.4;          // her course sways gently; the column follows
export let clock = 0;
export const tick = (dt: number) => { clock += dt; };
export const xPath = (S: number) => MA*Math.sin(MW*(clock - S/MVP));
export const slope = (S: number) => -(MA*MW/MVP)*Math.cos(MW*(clock - S/MVP));
export const worldX = (S: number) => xPath(S) + (S > S0 ? BEND*(S - S0)*(S - S0) : 0);
const worldSlope = (S: number) => slope(S) + (S > S0 ? 2*BEND*(S - S0) : 0);

export let lampVis = 1;
let vmax = 10;
// the frame loop eases her bonfire toward the day's live flag; the camera sets how fast ships may close in
export const easeLamp = (to: number, k: number) => { lampVis += (to - lampVis)*k; };
export const setVmax = (v: number) => { vmax = v; };

/* =====================================================================
   TRAFFIC: each frame, ships follow the plan along their lanes.
   A ship coming in appears out beyond its barb's tip (behind the fleet, for the rachis) and sails in; one leaving
   sails out the same way and fades. One that has started either goes all the way: a light whose stay was too
   short arrives, stays a moment and then leaves, it never turns back. On a lane, ships come in only while none on
   it is leaving or about to, and none is still coming in beyond their berth; they leave outermost first, so the
   lane is always single file and no ship passes another. With reduced motion they fade in and out at their berths.
   A ship sails in with its lantern low and lights it as it reaches its berth (DYN x, the lantern multiplier, from
   LIT_IN up), and one leaving puts its lantern out before it fades, so joining and leaving read as a light coming on
   and going out.
   ===================================================================== */
const DIN = 22, DOUT = 14;            // slots out beyond the berth where one comes in from, and where one leaving has faded
const DIN_R = 30, DOUT_R = 16;        // the same on the rachis, in units behind the berth
const HOLD = 0.8;                     // seconds one that has just come in stays before it may leave, so it does not bounce back out
const LIT_IN = 0.25;                  // a ship coming in carries its lantern this low until halfway in
const MODE = new Uint8Array(NI);      // 0 away, 1 coming in, 2 at the berth, 3 waiting to leave, 4 leaving
const LANE = new Int32Array(NI), X = new Float32Array(NI), TX = new Float32Array(NI), SC = new Float32Array(NI), WANT = new Uint8Array(NI), ARRIVED = new Float32Array(NI);
const CS = new Float32Array(NI), CL = new Float32Array(NI), HEAD = new Float32Array(NI);
const IID = new Int32Array(NI).fill(-1), AINST = new Int32Array(NA).fill(-1), AWANT = new Uint8Array(NA);
const busy = new Int32Array(NL + ESC_L.length), hiIn = new Float32Array(NL + ESC_L.length), hiW = new Float32Array(NL + ESC_L.length);
const freeA: number[] = [];
let active: number[] = [], pendA: number[] = [];
const onList = new Uint8Array(NI);
for (let k = 0; k < NN; k++){ const i = INST[k]; LANE[i] = NLANE[k]; TX[i] = NX[k]; SC[i] = SCALE_BY_LEVEL[LEVEL[k]]; }
for (let j = 0; j < ANON_N; j++) SC[GROUP.anon.start + j] = ANON_SCALE;

let PS = 0, PL = 0;
function lanePos(b: number, x: number){
  if (b >= NL){ PS = x; PL = ESC_L[b - NL]; return; }
  const o = LS0[b], n = LN[b];
  if (Number.isInteger(x) && x < n){ PS = LSS[o+x]; PL = LSL[o+x]; return; }
  if (n < 2){ PS = LSS[o] + x*DA*0.8; PL = LSL[o] + Math.sign(LSL[o])*x*DA*0.6; return; }
  const j = Math.min(n - 2, Math.max(0, Math.floor(x))), u = x - j;
  PS = LSS[o+j] + (LSS[o+j+1] - LSS[o+j])*u; PL = LSL[o+j] + (LSL[o+j+1] - LSL[o+j])*u;
}
const touch = (i: number) => { if (!onList[i]){ onList[i] = 1; active.push(i); } };
const hide = (i: number) => { MODE[i] = 0; DYN[i*2] = 0; DYN[i*2+1] = 0; OFF[i*4+3] = 0; HEAD[i] = 0; };
const place = (i: number) => { lanePos(LANE[i], X[i]); CS[i] = PS; CL[i] = PL; OFF[i*4+3] = SC[i]; };
function park(i: number){ MODE[i] = 2; X[i] = TX[i]; place(i); DYN[i*2] = 1; DYN[i*2+1] = 1; HEAD[i] = 0; ARRIVED[i] = -1e9; }
// a light's small offsets from its berth come from the berth, not the instance it happens to get, so a light that
// sailed in sits exactly where a jump to that day puts one
const hash = (n: number) => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0)/4294967296; };
function assign(i: number, id: number){
  const r = A_BER[id], raw = ORD[r]; IID[i] = id; AINST[id] = i; LANE[i] = SLANE[raw]; TX[i] = SSLOT[raw];
  JX[i] = hash(r*3 + 1) - 0.5; JZ[i] = hash(r*3 + 2) - 0.5; PH[i] = hash(r*3 + 3)*6.283;
}
function startIn(i: number){
  MODE[i] = 1; X[i] = reduceMotion ? TX[i] : TX[i] + (LANE[i] < NL ? DIN : DIN_R);
  place(i); DYN[i*2] = reduceMotion ? 1 : LIT_IN; DYN[i*2+1] = 0; touch(i);
}
function finish(i: number){
  hide(i);
  const id = IID[i];
  if (id >= 0){ IID[i] = -1; AINST[id] = -1; WANT[i] = 0; freeA.push(i); if (AWANT[id]) pendA.push(id); }
}
function setLight(id: number, w: boolean){
  AWANT[id] = w ? 1 : 0;
  const i = AINST[id];
  if (i >= 0){ WANT[i] = AWANT[id]; touch(i); } else if (w) pendA.push(id);
}
// the plan's changes on day e, forward or undone
function stepDay(e: number, fwd: boolean){
  for (let k = e ? NPD[e-1] : 0; k < NPD[e]; k++){ const i = INST[k]; WANT[i] = fwd ? 1 : 0; touch(i); }
  for (let id = ARR0[e]; id < ARR0[e+1]; id++) setLight(id, fwd);
  for (let q = DEP0[e]; q < DEP0[e+1]; q++) setLight(DEPO[q], !fwd);
}
let curDay = -1;
function snapTo(d: number){
  curDay = d;
  for (const i of active) onList[i] = 0;
  active = []; pendA = []; freeA.length = 0;
  for (let i = 1; i < NI; i++){ WANT[i] = 0; IID[i] = -1; hide(i); }
  for (let j = ANON_N - 1; j >= 0; j--) freeA.push(GROUP.anon.start + j);
  AINST.fill(-1); AWANT.fill(0);
  for (let k = 0; k < NPD[d]; k++){ const i = INST[k]; WANT[i] = 1; park(i); }
  for (let id = 0; id < ARR0[d+1]; id++) if (A_DEP[id] > d){ AWANT[id] = 1; const i = freeA.pop()!; assign(i, id); WANT[i] = 1; park(i); }
}
function traffic(dt: number){
  if (!active.length && !pendA.length) return;
  // per lane: ships leaving or about to (none may come in meanwhile), the outermost berth of those coming in, and of
  // those coming in or about to leave (one leaves only when it is the outermost of them)
  busy.fill(0); hiIn.fill(-1); hiW.fill(-1);
  for (const i of active){
    const m = MODE[i], b = LANE[i];
    if (m === 1){ hiIn[b] = Math.max(hiIn[b], TX[i]); hiW[b] = Math.max(hiW[b], TX[i]); if (!WANT[i]) busy[b]++; }
    else if (m === 4) busy[b]++;
    else if (m === 3 || (m === 2 && !WANT[i])){ busy[b]++; hiW[b] = Math.max(hiW[b], TX[i]); }
  }
  for (const i of active){
    if (MODE[i] === 3 && WANT[i]) MODE[i] = 2;   // stepped back to a day it is on board: it never left
    else if ((MODE[i] === 2 || MODE[i] === 3) && !WANT[i]){
      MODE[i] = 3;
      if (hiW[LANE[i]] <= TX[i] && clock - ARRIVED[i] >= HOLD) MODE[i] = 4;
    }
  }
  for (const i of active) if (MODE[i] === 0 && WANT[i] && !busy[LANE[i]] && hiIn[LANE[i]] < TX[i]) startIn(i);
  if (pendA.length){
    let w = 0;
    for (const id of pendA){
      if (!AWANT[id] || AINST[id] >= 0) continue;
      const raw = ORD[A_BER[id]], b = SLANE[raw];
      if (freeA.length && !busy[b] && hiIn[b] < SSLOT[raw]){ const i = freeA.pop()!; assign(i, id); WANT[i] = 1; startIn(i); }
      else pendA[w++] = id;
    }
    pendA.length = w;
  }
  const vIn = vmax, vOut = 3 + vmax*0.35;
  let w = 0;
  for (const i of active){
    const m = MODE[i], ux = LANE[i] < NL ? DA : 1, l0 = CL[i];
    if (m === 1){
      // reduced motion fades a ship in at its berth (X = TX also catches one already sailing in when the switch flips)
      if (reduceMotion){ X[i] = TX[i]; DYN[i*2] = 1; DYN[i*2+1] = Math.min(1, DYN[i*2+1] + dt*1.25); if (DYN[i*2+1] >= 1){ MODE[i] = WANT[i] ? 2 : 3; ARRIVED[i] = clock; } }
      else {
        const din = (LANE[i] < NL ? DIN : DIN_R)*ux, r = (X[i] - TX[i])*ux, nr = Math.max(0, r - Math.min(vIn, 0.8 + 2.4*r)*dt);
        X[i] = TX[i] + nr/ux; DYN[i*2] = LIT_IN + (1 - LIT_IN)*(1 - smooth(0, 0.5*din, nr)); DYN[i*2+1] = 1 - smooth(0.45*din, din, nr);
        if (nr < 0.002){ X[i] = TX[i]; DYN[i*2] = 1; DYN[i*2+1] = 1; MODE[i] = WANT[i] ? 2 : 3; ARRIVED[i] = clock; }
      }
    } else if (m === 4){
      if (reduceMotion){ DYN[i*2+1] -= dt*1.25; DYN[i*2] = Math.max(0, DYN[i*2+1]); if (DYN[i*2+1] <= 0){ finish(i); } }
      else {
        const dout = (LANE[i] < NL ? DOUT : DOUT_R)*ux, e = (X[i] - TX[i])*ux, ne = e + Math.min(vOut, 0.8 + 1.2*e)*dt;
        X[i] = TX[i] + ne/ux; DYN[i*2] = 1 - smooth(0, 0.7*dout, ne); DYN[i*2+1] = 1 - smooth(0, dout, ne);
        if (ne >= dout) finish(i);
      }
    }
    if (MODE[i]){
      place(i);
      const want = MODE[i] === 2 ? 0 : Math.max(-0.3, Math.min(0.3, (CL[i] - l0)/Math.max(dt, 1e-4)*0.06));
      HEAD[i] += (want - HEAD[i])*Math.min(1, dt*3);
    }
    // a ship stays on the list while it moves, waits, or still turns back to the column's heading
    if ((MODE[i] === 2 && WANT[i] && Math.abs(HEAD[i]) < 1e-3) || (MODE[i] === 0 && !WANT[i])){ onList[i] = 0; if (MODE[i] === 2) HEAD[i] = 0; }
    else active[w++] = i;
  }
  active.length = w;
}
const smooth = (a: number, b: number, x: number) => { const u = Math.max(0, Math.min(1, (x - a)/(b - a))); return u*u*(3 - 2*u); };

export type FleetLayout = ReturnType<typeof updateFleet>;
export function updateFleet(t: number, dt: number, jump: boolean){
  const d = dayClamp(Math.floor(t));
  if (jump || curDay < 0 || Math.abs(d - curDay) > 40) snapTo(d);
  else { while (curDay < d) stepDay(++curDay, true); while (curDay > d) stepDay(curDay--, false); }
  traffic(dt);
  const Np = NPD[d], total = Math.max(Np, DATA.total[d]), A = total - Np, nEsc = NESC[d];
  const Lv = feather(d), tail = Math.max(Lv, ETAIL[d]);
  for (let i = 1; i < NI; i++){
    if (OFF[i*4+3] <= 0) continue;
    const sp = CS[i] + JZ[i]*0.30 + 0.10*Math.sin(clock*0.27 + PH[i]);
    const l = CL[i] + JX[i]*0.22 + 0.08*Math.sin(clock*0.19 + PH[i]*1.7);
    const S = S0 + sp;
    OFF[i*4] = worldX(S) + l; OFF[i*4+1] = -S;
    OFF[i*4+2] = Math.atan(-worldSlope(S)) + HEAD[i] + (INFO[i*4+1] - 0.5)*0.08;
  }
  OFF[0] = xPath(0); OFF[1] = 0; OFF[2] = Math.atan(-slope(0)); OFF[3] = FS;
  DYN[0] = 0.06 + 0.94*lampVis; DYN[1] = 1;
  for (const key in groupMeshes){ const g = groupMeshes[key as GroupKey]!.geometry; g.getAttribute('aOff').needsUpdate = true; g.getAttribute('aDyn').needsUpdate = true; }
  iOff.needsUpdate = true; iDyn.needsUpdate = true; lOff.needsUpdate = true; lDyn.needsUpdate = true;
  return { Np, A, total, nEsc, Lv, tail };
}
