import voyage from '../data/voyage.json';

/* =====================================================================
   DATA: data/voyage.json, composed by `voyage build` (docs/DATA.md)
   {
     total:  [int per day],          // 大航海总数 at end of day   (vtbs.moe bulkGuard)
     followers:[int per day],        // 粉丝数                      (vtbs.moe bulkActive)
     live:   [0/1 per day],          // 当天开播                     (HANE 直播档案；档案缺的区间按她的直播预告推断)
     named:  [{start, level, medal, id, acc, name}] // 今天名单：start = 这条船开始有名字的那天
                                     // level 1总督 2提督 3舰长, medal 粉丝牌等级, id UID 的哈希（按 UID 找船时比对）
                                     // acc 最后一天的陪伴天数（B 站正值或历史回填），null 是未知
                                     // name 昵称，只在点选、悬停、寻舟时显示（src/names.ts）；没有或为空就不显示
     anchors:{total:[[day,v]], followers:[[day,v]]} // 已核实的数字，画成白点
     meta:   {live_by_posts:[[a,b]], ...} // 按直播预告推断开播的区间（含首尾），其余是合成的说明（还没用）
   }   day 0 = 2021-02-03, the last entry is the last day; on no day are more ships named than the total
   ===================================================================== */
export interface Named { start: number; level: number; medal: number; acc: number | null; id: string; name?: string }
export interface VoyageData {
  total: Int32Array; followers: Int32Array; live: Uint8Array; named: Named[];
  anchors: { total: [number, number][]; followers: [number, number][] };
}
const DAY0 = Date.UTC(2021,1,3);
export const NDAYS = voyage.total.length;
export const di = (y: number, m: number, d: number) => Math.round((Date.UTC(y,m-1,d)-DAY0)/864e5);
const pad2 = (n: number) => String(n).padStart(2,'0');
export const fmtDay = (i: number) => { const t = new Date(DAY0 + Math.floor(i)*864e5); return t.getUTCFullYear()+'.'+pad2(t.getUTCMonth()+1)+'.'+pad2(t.getUTCDate()); };
export function mulberry32(a: number){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

export const DATA: VoyageData = {
  total: Int32Array.from(voyage.total), followers: Int32Array.from(voyage.followers), live: Uint8Array.from(voyage.live),
  named: voyage.named, anchors: voyage.anchors as VoyageData['anchors'],
};
DATA.named.sort((a,b) => a.start - b.start);
// Her bonfire: how often she streamed lately, each live day weighted by e^(−days ago/LAMP_DAYS), so it brightens and
// dims over days. Lit or out by the day, it flashed all through playback (changed 2026-10-23); lampAt runs between days.
const LAMP_DAYS = 10;
export const LAMP = new Float32Array(NDAYS);
{ const k = Math.exp(-1/LAMP_DAYS); let s = DATA.live[0]; for (let d = 0; d < NDAYS; d++){ s = s*k + (1 - k)*DATA.live[d]; LAMP[d] = s; } }
export const lampAt = (t: number) => { const d = dayClamp(Math.floor(t)), e = dayClamp(d+1), u = Math.max(0, Math.min(1, t - Math.floor(t))); return LAMP[d] + (LAMP[e] - LAMP[d])*u; };
export const NN = DATA.named.length;
export const START = new Float64Array(NN), LEVEL = new Uint8Array(NN), ACC = new Int32Array(NN);
// -1 keeps unknown days out of every anniversary and light-pillar tier.
DATA.named.forEach((n,i) => { START[i] = n.start; LEVEL[i] = n.level; ACC[i] = n.acc ?? -1; });
export const NPD = new Int32Array(NDAYS);
{ let k=0; for(let d=0; d<NDAYS; d++){ while(k<NN && START[k] < d+1) k++; NPD[d] = k; } }
// 老船长: 陪伴天数 on the day shown (B站's count, earlier stints included), in tiers from 满月, 半年 and a year on.
// Only ships at 30 days or more on the last day ever reach a tier (VETS); VET_N[j][d] is how many on board on day d had reached tier j+1.
export const VET_T = [30, 180, 365];
export const vetTier = (k: number, d: number) => { const a = ACC[k] - (NDAYS - 1 - d); let r = 0; for (const T of VET_T) if (a >= T) r++; return r; };
export const VETS = Int32Array.from(DATA.named.flatMap((_, k) => ACC[k] >= VET_T[0] ? [k] : []));
export const VET_N = VET_T.map(T => { const a = new Int32Array(NDAYS);
  for (const k of VETS){ const d0 = Math.max(Math.floor(START[k]), NDAYS - 1 - ACC[k] + T); if (d0 < NDAYS) a[Math.max(0, d0)]++; }
  for (let d = 1; d < NDAYS; d++) a[d] += a[d-1];
  return a; });
export let AMAX = 0; for(let d=0; d<NDAYS; d++) AMAX = Math.max(AMAX, DATA.total[d]-NPD[d]);
export const FMAX = DATA.followers.reduce((a,b)=>Math.max(a,b),0);
export const TMAX = DATA.total.reduce((a,b)=>Math.max(a,b),0);
export const STAR_PER = 10;
export const NSTAR = Math.ceil(FMAX/STAR_PER);

export const upperBound = (arr: ArrayLike<number>, x: number) => { let lo=0, hi=arr.length; while(lo<hi){ const m=(lo+hi)>>1; if(arr[m] <= x) lo=m+1; else hi=m; } return lo; };
export const dayClamp = (d: number) => Math.max(0, Math.min(NDAYS-1, d));
export const follAt = (t: number) => { const d = dayClamp(Math.floor(t)), e = dayClamp(d+1); const u = Math.max(0,Math.min(1,t-Math.floor(t))); return DATA.followers[d] + (DATA.followers[e]-DATA.followers[d])*u; };

export const MONTHS: { d: number; y: number; m: number }[] = [];
{ let y = 2021, m = 2; for(;;){ const d = di(y,m,1); if (d > NDAYS-1) break; MONTHS.push({ d, y, m }); m++; if (m > 12){ m = 1; y++; } } }
