import * as THREE from 'three';
import { $ } from './dom';
import { ACC, DATA, LEVEL, NDAYS, NN, START, VET_T, mulberry32 } from './data';
import { camera, canvas, renderer, scene } from './renderer';
import { pick, swellJS } from './uniforms';
import { DYN, INST, NI, OFF } from './fleet';
import { MAST_TOP } from './ships';
import { camFocus, safeTop } from './camera';
import { uidId } from './uid';
import { markFrag, markVert } from './shaders';

/* =====================================================================
   NAMES: the 舰长 who can be told apart by name (today's list, less those who chose 神秘人) show it only when a viewer
   points at their ship, picks it, or finds it by name or by UID (src/inscriptions.ts carves those of a year or more on
   the gates). Picking moves the view to the ship and rings it on the water. Avatars and UIDs are never shown; a UID
   typed in is hashed on the device (src/uid.ts) and compared with the list's ids. Without names in data/voyage.json
   (no crawl has stored them yet) no names are shown at all; the dev server's ?sample-names makes some up, marked 示意.
   ===================================================================== */
export const SAMPLE = import.meta.env.DEV && new URLSearchParams(location.search).has('sample-names');
function sampleName(k: number){
  const P = [['羽毛团', '火羽家的', '夜海', '鸟居下的', '千本', '今日も', 'ひのめ', '灯火', '星屑', '小', '', '', ''],
    ['小鸟', '猫', '水手', '旅人', '提灯', '羽', '月见', 'ぶた', 'Kobuta', 'hinome', 'Feather', '豚豚', '船长', '航海士'],
    ['', '', '', '', '🐷', '🔥', '✨', 'ちゃん', '酱', '123', '_official', '的船']];
  const r = mulberry32(Math.imul(k + 1, 0x9e3779b1)); r();
  return P.map(p => p[Math.floor(r()*p.length)]).join('') || '舰长';
}
// '' is no name: none stored yet, or someone who asked for theirs to be taken off (voyage/build.py drops it)
export const NAMES = DATA.named.map((n, k) => SAMPLE ? sampleName(k) : (n.name ?? ''));
const HAS_NAMES = NAMES.some(Boolean);
const KEY = NAMES.map(s => s.normalize('NFKC').toLowerCase());
const IDS = DATA.named.map(n => n.id);
const KOF = new Int32Array(NI).fill(-1);   // instance → place in the list
for (let k = 0; k < NN; k++) KOF[INST[k]] = k;
const RANK = ['', '总督', '提督', '舰长'];
const LAST = NDAYS - 1;
// 陪伴天数 on the day shown (B站's count, earlier stints included), as the 老船长 tiers take it
const daysWith = (k: number, d: number) => ACC[k] - (LAST - d);
// The 老船长 tier in the colour of their light pillars (src/veterans.ts), brighter with each tier, never vermilion (the
// gates' colour): 满月 a faint outline, 半年 a full one, from a year on filled, with the years and a ring for each, as
// the rings that climb the pillar (src/style.css .vt)
function tierChip(days: number){
  const t = VET_T.filter(T => days >= T).length, n = Math.floor(days/365);
  return t === 0 ? '' : t < 3 ? `<u class="vt t${t}">${t === 1 ? '满月' : '半年'}</u>` : `<u class="vt t3">${n} 年${'<s></s>'.repeat(Math.min(n, 10))}</u>`;
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
// a ship's tag: the name over rank and days with her on the day shown; a ship without a name shows its rank on top
function about(k: number, d: number){
  const days = daysWith(k, d), when = ACC[k] < 0 ? '陪伴天数未知'
    : START[k] >= d + 1 ? '这一天还没上船' : `陪伴 ${Math.max(0, days)} 天`;
  return NAMES[k] ? [esc(NAMES[k]) + (SAMPLE ? '<em>示意</em>' : ''), `${RANK[LEVEL[k]]} · ${when}${tierChip(days)}`]
    : [RANK[LEVEL[k]], when + tierChip(days)];
}
function tagHTML(i: number, d: number){
  const k = KOF[i];
  if (k < 0) return '<b class="anon">无名之舰</b><small>那天在船上，后来离开了，或不想留名</small>';
  const [top, below] = about(k, d);
  return `<b>${top}</b><small>${below}</small>`;
}

/* ---------- picking: the ship under a point on the canvas ---------- */
const PV = new THREE.Matrix4();
// mastheads in model space by kind (src/ships.ts), so the tag stands over the mast whatever its height
const TOP = [0, MAST_TOP.sou[1], MAST_TOP.tei[1], MAST_TOP.kan[1]], ANON_TOP = 0.8;
const topOf = (i: number) => KOF[i] >= 0 ? TOP[LEVEL[KOF[i]]] : ANON_TOP;
// The ship whose middle is nearest (x, y) in CSS px, within its own size on screen or 9 px (16 for a finger); nearer the
// camera wins among those the point is on. Every ship is about 1 long times its scale (OFF.w).
function pickAt(x: number, y: number, touch: boolean){
  PV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const e = PV.elements, W = canvas.clientWidth, H = canvas.clientHeight, minR = touch ? 16 : 9, fy = camera.projectionMatrix.elements[5]*H*0.5;
  let best = -1, bestS = Infinity;
  for (let i = 1; i < NI; i++){
    const sc = OFF[i*4+3];
    if (sc <= 0 || DYN[i*2+1] < 0.5) continue;
    const px = OFF[i*4], pz = OFF[i*4+1], py = 0.4*topOf(i)*sc;
    const cw = e[3]*px + e[7]*py + e[11]*pz + e[15];
    if (cw < 0.2) continue;
    const sx = ((e[0]*px + e[4]*py + e[8]*pz + e[12])/cw*0.5 + 0.5)*W, sy = (0.5 - (e[1]*px + e[5]*py + e[9]*pz + e[13])/cw*0.5)*H;
    const r = 0.55*sc*fy/cw, d = Math.hypot(sx - x, sy - y);
    if (d > Math.max(r, minR)) continue;
    const s = d < r ? cw : 1e6 + d/minR;   // on the ship itself: the nearest one; only near it: the closest by the point
    if (s < bestS){ bestS = s; best = i; }
  }
  return best;
}

/* ---------- the ring on the water round the picked ship, a layer of its own (the ships' shaders are not touched) ---------- */
// drawn twice: where it is not hidden at full strength, and through the ships in front at a third, so it still reads
// as a whole ring in the thick of the fleet
const rings = [1, 0.35].map((a, k) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { ...pick('uTime', 'uMirror', 'uToon'), uP:{ value:new THREE.Vector3() }, uR:{ value:1 }, uA:{ value:0 } },
    transparent:true, depthWrite:false, depthTest:k === 0, side:THREE.DoubleSide, vertexShader:markVert, fragmentShader:markFrag }));
  m.frustumCulled = false; m.renderOrder = 3 + k; m.userData.a = a; scene.add(m);
  renderer.compile(m, camera, scene); m.visible = false;   // compiled while the page loads, not on the first pick
  return m;
});

/* ---------- state, the tags, the camera ---------- */
let hoverI = -1, selI = -1, ringA = 0, ptr: { x: number; y: number } | null = null, day = LAST;
const selTag = $('shipTag'), hoverTag = $('hoverTag');
const findBtn = $('findBtn'), panel = $('find'), input = $<HTMLInputElement>('findQ'), list = $('findList'), note = $('findNote'), clear = $('findClear');
// picks instance i, or lets go (i <= 0); entering cinema mode lets go too (src/main.ts)
export function select(i: number){
  selI = i; camFocus.on = i > 0; clear.hidden = i <= 0;
  if (i <= 0) return;
  // 提督 and 总督 sail the rachis under the gates: there the camera looks down from above the gates' tops
  camFocus.el = KOF[i] >= 0 && LEVEL[KOF[i]] < 3 ? 0.95 : 0.44;
  // said once for screen readers (the tag itself changes every day during playback)
  const k = KOF[i];
  note.textContent = '选中：' + (k < 0 ? '无名之舰' : about(k, day).join(' · ').replace(/<[^>]+>/g, ' '));
}
const V = new THREE.Vector3();
// the tag stands over the ship's masthead and fades in and out (src/style.css); hidden off screen or not on board. It
// never reaches above the top of the page, nor on a tall screen into the readout, which spans the width there: with the
// camera close on a picked ship its masthead can be that high (2026-10-24), and the tag comes down over the sail instead.
function placeTag(el: HTMLElement, i: number, html: string){
  const sc = i > 0 ? OFF[i*4+3] : 0;
  if (sc > 0 && DYN[i*2+1] > 0.05){
    V.set(OFF[i*4], swellJS(OFF[i*4], OFF[i*4+1]) + topOf(i)*sc + 0.25, OFF[i*4+1]).project(camera);
    if (V.z < 1 && Math.abs(V.x) < 1.05 && Math.abs(V.y) < 1.05){
      if (el.dataset.html !== html){ el.innerHTML = html + '<i class="stem"></i>'; el.dataset.html = html; }
      el.style.transform = `translate(${(V.x*0.5 + 0.5)*canvas.clientWidth}px, ${Math.max((0.5 - V.y*0.5)*canvas.clientHeight, safeTop + el.offsetHeight)}px) translate(-50%,-100%)`;
      el.classList.add('on'); return;
    }
  }
  el.classList.remove('on');
}
/* ---------- 一年以上的老舰长: their names always over their pillars of light ---------- */
// The user asked on 2026-10-24 for the names of those a year or more with her to show without pointing at them (twenty
// today). Each stands at the top of its ship's pillar (src/veterans.ts: 4.0 world units at a year, 0.9 more each year
// after), fades in while the ship grows from 8 to 14 px long on screen, and gives way where it would cover a nearer one.
const OLD = Array.from({ length:NN }, (_, k) => k).filter(k => NAMES[k] && ACC[k] >= 365);
const vetEls = OLD.map(() => {
  const el = document.createElement('div'); el.className = 'tag vet-tag'; el.setAttribute('aria-hidden', 'true');
  selTag.parentElement!.insertBefore(el, selTag); return el;
});
const vetW = new Float32Array(OLD.length), boxes: number[][] = [];
const hideVet = (j: number) => { vetEls[j].style.visibility = 'hidden'; };
// the readout, the dock and her ship's name keep their room: measured twice a second, as they hardly move
const UI = [...['.brand', '.readout .date', '.stats-row', '#findBtn', '.board', '#dock', '#flagTag'].map(s => document.querySelector(s)), ...document.querySelectorAll('.sheet')].filter(Boolean) as Element[];
let uiBoxes: number[][] = [], uiAge = 0;
function updateVetTags(d: number){
  if (--uiAge <= 0){
    uiAge = 30;
    const c = canvas.getBoundingClientRect();
    uiBoxes = UI.map(el => { const r = el.getBoundingClientRect(); return [r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top]; }).filter(b => b[2] > b[0]);
  }
  PV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const e = PV.elements, W = canvas.clientWidth, H = canvas.clientHeight, fy = camera.projectionMatrix.elements[5]*H*0.5;
  const shown: { j: number; x: number; y: number; cw: number; a: number }[] = [];
  OLD.forEach((k, j) => {
    const i = INST[k], sc = OFF[i*4+3], days = daysWith(k, d);
    if (days < 365 || sc <= 0 || DYN[i*2+1] < 0.5 || i === selI || i === hoverI) return hideVet(j);
    const n = Math.floor(days/365), x = OFF[i*4], z = OFF[i*4+1];
    const y = swellJS(x, z) + topOf(i)*sc + 4.0 + 0.9*(n - 1) + 0.15;
    const cw = e[3]*x + e[7]*y + e[11]*z + e[15];
    const a = cw < 0.2 ? 0 : smooth(8, 14, sc*fy/cw);
    if (a <= 0) return hideVet(j);
    const html = `<b>${esc(NAMES[k])}</b><u class="vt t3">${n} 年</u>`;
    const el = vetEls[j];
    if (el.dataset.html !== html){ el.innerHTML = html; el.dataset.html = html; el.style.visibility = 'hidden'; el.style.transform = ''; vetW[j] = el.offsetWidth; }
    shown.push({ j, x:((e[0]*x + e[4]*y + e[8]*z + e[12])/cw*0.5 + 0.5)*W, y:(0.5 - (e[1]*x + e[5]*y + e[9]*z + e[13])/cw*0.5)*H, cw, a });
  });
  // nearer first; one that would overlap a name already placed waits until it has room
  shown.sort((p, q) => p.cw - q.cw);
  boxes.length = 0; boxes.push(...uiBoxes);
  for (const s of shown){
    const w = vetW[s.j]/2 + 4, l = s.x - w, r = s.x + w, t = s.y - 26, b = s.y;
    if (l > W || r < 0 || b < 0 || t > H || boxes.some(([L, T, R, B]) => l < R && r > L && t < B && b > T)){ hideVet(s.j); continue; }
    boxes.push([l, t, r, b]);
    const el = vetEls[s.j];
    el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-100%)`; el.style.opacity = String(s.a); el.style.visibility = '';
  }
}
const smooth = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a)/(b - a))); return u*u*(3 - 2*u); };

// once a frame, after the camera has moved: the tags, the ring, and where the camera should look next frame
export function updateNames(d: number, dt: number){
  day = d;
  if (ptr){ hoverI = pickAt(ptr.x, ptr.y, false); canvas.style.cursor = hoverI > 0 ? 'pointer' : ''; }
  // a picked ship not on board on the day shown lets the camera go back to the fleet, and takes it again when it comes
  const shown = selI > 0 && OFF[selI*4+3] > 0 && DYN[selI*2+1] > 0.05;
  // its size is read while it shows: picked before it came on board (by 寻舟), it had none, and the camera came in at 9
  // units, under the gates' tops for a 总督 (until 2026-10-24)
  if (shown){ camFocus.P.set(OFF[selI*4], 0.3*topOf(selI)*OFF[selI*4+3], OFF[selI*4+1]); camFocus.r = OFF[selI*4+3]; }
  camFocus.on = shown;
  placeTag(selTag, selI, selI > 0 ? tagHTML(selI, d) : '');
  placeTag(hoverTag, hoverI !== selI ? hoverI : -1, hoverI > 0 && hoverI !== selI ? tagHTML(hoverI, d) : '');
  updateVetTags(d);
  // the ring comes in and goes over about a fifth of a second
  ringA += ((shown ? 1 : 0) - ringA)*Math.min(1, dt*6);
  for (const m of rings){
    m.visible = ringA > 0.003;
    if (!m.visible) continue;
    const u = (m.material as THREE.ShaderMaterial).uniforms, i = selI;
    u.uA.value = ringA*m.userData.a; u.uR.value = 0.75*OFF[i*4+3];
    u.uP.value.set(OFF[i*4], swellJS(OFF[i*4], OFF[i*4+1]) + 0.09, OFF[i*4+1]);
  }
}

/* ---------- pointing and picking on the canvas; a drag still turns the view (src/main.ts) ---------- */
let down: { x: number; y: number; t: number; n: number } | null = null, fingers = 0;
canvas.addEventListener('pointerdown', e => { fingers++; down = fingers === 1 ? { x:e.clientX, y:e.clientY, t:performance.now(), n:0 } : null; });
canvas.addEventListener('pointermove', e => {
  if (down) down.n = Math.max(down.n, Math.hypot(e.clientX - down.x, e.clientY - down.y));
  const r = canvas.getBoundingClientRect();
  ptr = e.pointerType === 'mouse' && !e.buttons ? { x:e.clientX - r.left, y:e.clientY - r.top } : null;
});
canvas.addEventListener('pointerleave', () => { ptr = null; hoverI = -1; });
const up = (e: PointerEvent, cancel: boolean) => {
  fingers = Math.max(0, fingers - 1);
  // a click is a press that hardly moved and was let go soon (on empty sea it lets go); anything else was a drag or a pinch
  if (!cancel && down && down.n < 6 && performance.now() - down.t < 600){
    const r = canvas.getBoundingClientRect();
    select(pickAt(e.clientX - r.left, e.clientY - r.top, e.pointerType !== 'mouse'));
  }
  down = null;
};
canvas.addEventListener('pointerup', e => up(e, false));
canvas.addEventListener('pointercancel', e => up(e, true));
window.addEventListener('keydown', e => { if (e.key === 'Escape' && selI > 0 && !document.body.classList.contains('cinema')) select(-1); });

/* ---------- 寻舟: by name, or by UID ---------- */
const LIMIT = 30;
// whole names first, then those that start with it, then the rest; longer with her first within each
function findByName(q: string){
  const s = q.normalize('NFKC').toLowerCase().trim();
  if (!s) return [];
  const hit: number[] = [];
  for (let k = 0; k < NN; k++) if (KEY[k] && KEY[k].includes(s)) hit.push(k);
  const rank = (k: number) => KEY[k] === s ? 0 : KEY[k].startsWith(s) ? 1 : 2;
  return hit.sort((a, b) => rank(a) - rank(b) || ACC[b] - ACC[a]);
}
let query = 0, found: number[] = [];
function row(k: number){
  const [top, below] = about(k, day);
  return `<li><button type="button" data-k="${k}"><b>${top}</b><small>${below}</small></button></li>`;
}
async function search(){
  const q = input.value.trim(), mine = ++query;
  let ks = findByName(q), msg = '';
  if (/^\d{1,19}$/.test(q) && BigInt(q) > 0n){
    if (!crypto.subtle) msg = '这个浏览器核对不了 UID，只能按昵称找';
    else {
      note.textContent = '正在核对 UID……';
      const id = await uidId(q);
      if (mine !== query) return;
      const byId = IDS.flatMap((x, k) => x === id ? [k] : []);
      ks = [...byId, ...ks.filter(k => !byId.includes(k))];
      msg = byId.length ? `这是你的船${byId.length > 1 ? `（有 ${byId.length} 条船对得上，都列出来了）` : ''}。UID 只在你的设备上核对，不会上传` : '今天的名单里没有这个 UID（选了神秘人的也查不到）';
    }
  }
  if (mine !== query) return;
  found = ks;
  list.innerHTML = ks.slice(0, LIMIT).map(row).join('');
  note.textContent = msg || (!q ? (HAS_NAMES ? '输入昵称，或者你的 UID' : '名单还没有昵称，可以输入 UID 找船')
    : ks.length ? (ks.length > LIMIT ? `找到 ${ks.length} 条，先列出 ${LIMIT} 条` : `找到 ${ks.length} 条`) : '没有找到这个昵称');
  if (SAMPLE) note.textContent += ' · 名字是示意数据';
}
// on a phone the panel covers the fleet, so it closes once a ship is picked (src/main.ts toggles it with the other sheets)
const choose = (k: number) => { select(INST[k]); if (!panel.hidden && innerWidth <= 640) findBtn.click(); };
input.addEventListener('input', () => { search(); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && found.length) choose(found[0]); });
list.addEventListener('click', e => {
  const b = (e.target as Element).closest('button[data-k]') as HTMLElement | null;
  if (b) choose(+b.dataset.k!);
});
// once the panel is open the field takes the keys
findBtn.addEventListener('click', () => setTimeout(() => { if (!panel.hidden){ input.focus(); search(); } }));
clear.addEventListener('click', () => select(-1));
// for reviewing from the console: fleetPick(k) picks the k-th ship of the list by boarding day, fleetPick() lets go
window.fleetPick = k => select(k == null || k < 0 ? -1 : INST[k]);
