import * as THREE from 'three';
import { ACC, MONTHS, NDAYS, NN, START, upperBound } from './data';
import { camera, renderer, scene } from './renderer';
import { pick } from './uniforms';
import { NAMES } from './names';
import { TA, TDECO, TORII_H, TORII_HY, TORII_W } from './torii';
import { inscriptionFrag, inscriptionVert } from './shaders';

/* =====================================================================
   NAMES ON THE GATES. At Fushimi Inari each torii carries the name of whoever offered it, written down a post on the
   side seen on the way back. Here a 舰长 with her a year or more has their name on the gate of the month of each
   anniversary: 「奉納」 and the name, down the face of a post that the 回望 camera (looking back) sees. The longer with
   her, the more gates carry the name and the larger it is. On lacquered gates it is written in pale 胡粉 white, gilded
   from three years on; on plain wood ones in sumi, as gold or white on pale wood would not read. (Until 2026-10-24 it
   was sumi on vermilion too, which hardly read at night.) On the day shown that the anniversary comes (for one who left and came back,
   the day the ship comes back), the carving comes in over half a second; it fades while its characters shrink under
   7 px on screen. Months are gates (src/torii.ts); the faces are those of buildTorii's posts and legs.
   ===================================================================== */
const LAST = NDAYS - 1, GILD = 3;
interface Carving { k: number; n: number; g: number; day: number; gold: boolean; wood: boolean }
const CARVINGS: Carving[] = [];
const MD = MONTHS.map(m => m.d);
for (let k = 0; k < NN; k++){
  if (!NAMES[k]) continue;
  for (let n = 1; n*365 <= ACC[k]; n++){
    const d = LAST - ACC[k] + n*365, g = upperBound(MD, d) - 1;
    // gilt reads on vermilion; on a plain wood gate (TDECO x 0) it would be gold on gold, so those stay in ink
    if (g >= 0) CARVINGS.push({ k, n, g, day: Math.max(d, Math.floor(START[k])), gold: n >= GILD && TDECO[g*4] > 0.5, wood: TDECO[g*4] <= 0.5 });
  }
}

/* ---------- where each goes: the faces toward +z, in gate units (x by TORII_W, y by the gate's height) ---------- */
// the main posts run from x 0.40 at y -0.06 to 0.375 at 0.87, half as deep as wide, 0.040 to 0.033; the legs (稚児柱)
// are 0.032 wide at x 0.40, their front face at z 0.186, up to 0.46
const postX = (y: number) => 0.40 - 0.025*(y + 0.06)/0.93, postH = (y: number) => 0.040 - 0.007*(y + 0.06)/0.93;
// the upper posts first (right, then left as the camera looks back), then their lower parts, then the legs.
// ponytail: six names a gate (August 2026 has the most, five); more would be left off: give the posts two columns then.
const SLOTS = [[1, 1, 0.47, 0.835], [-1, 1, 0.47, 0.835], [1, 1, 0.10, 0.45], [-1, 1, 0.10, 0.45], [1, 0, 0.06, 0.44], [-1, 0, 0.06, 0.44]];

/* ---------- the atlas: each carving one column of 64 px per character, 「奉納」 at 0.6 above the name ---------- */
const CELL = 64, AH = 2048, HEAD = 1.2 + 0.35;
const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh', { granularity:'grapheme' }) : null;
const graphemes = (s: string) => seg ? Array.from(seg.segment(s), x => x.segment) : Array.from(s);
// Written down the post as Japanese is: CJK, kana and emoji upright, one square each. Latin letters, digits and the like
// go in runs: one or two side by side in a square (縦中横), three or more turned on their side, as long as they are.
const narrow = (g: string) => /^[!-ɏ｡-ﾟ]$/.test(g);
const FONT = '"Noto Serif SC","Songti SC","STSong","SimSun","Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif';
const meas = document.createElement('canvas').getContext('2d')!;
// a space is half a square; a run of narrow ones is one square, or as long as it is when turned
const runs = (gs: string[]) => {
  const out: { s: string; side: boolean; len: number }[] = [];
  for (const g of gs){
    const last = out[out.length - 1];
    if (last && narrow(g) && narrow(last.s[0])) last.s += g;
    else out.push({ s: g, side: false, len: /^\s$/.test(g) ? 0.5 : 1 });
  }
  meas.font = `700 ${Math.round(CELL*0.86)}px ${FONT}`;
  for (const r of out) if (narrow(r.s[0]) && r.s.length > 2){ r.side = true; r.len = meas.measureText(r.s).width/CELL + 0.15; }
  return out;
};
const units = (rs: ReturnType<typeof runs>) => HEAD + rs.reduce((a, r) => a + r.len, 0);

const N = CARVINGS.length;
const aT = new Float32Array(N*4), aAt = new Float32Array(N*4), aUV = new Float32Array(N*4), aDim = new Float32Array(N*3), alpha = new Float32Array(N);
const cells: { x: number; y: number; rs: ReturnType<typeof runs>; h: number }[] = [];
let AW = CELL, AHU = 1;   // the atlas as large as it needs: columns 64 px wide, filled top to bottom, at most 2048 tall
{
  let x = 0, y = 0;
  const byGate = new Map<number, number[]>();
  CARVINGS.forEach((c, j) => { const l = byGate.get(c.g) ?? []; l.push(j); byGate.set(c.g, l); });
  for (const [g, js] of byGate){
    js.sort((a, b) => CARVINGS[b].n - CARVINGS[a].n || ACC[CARVINGS[b].k] - ACC[CARVINGS[a].k]);
    const gh = MONTHS[g].m === 1 ? TORII_HY : TORII_H;
    js.forEach((j, r) => {
      const c = CARVINGS[j], rs = runs(graphemes(NAMES[c.k])), u = units(rs), h = Math.ceil(u*CELL);
      if (y + h > AH){ x += CELL; y = 0; }
      cells[j] = { x, y, rs, h };
      y += h; AW = x + CELL; AHU = Math.max(AHU, y);
      if (r >= SLOTS.length){ aDim.set([0, 0, 0], j*3); return; }
      const [side, post, y0, y1] = SLOTS[r];
      // larger with the years, but no wider than the face and no taller than the slot (0.30 + 0.05 a year until
      // 2026-10-24, when the user could not find them in the default view)
      const wide = post ? 2*postH((y0 + y1)/2)*TORII_W : 0.032*TORII_W;
      const s = Math.min(0.42 + 0.06*c.n, 0.92*wide, (y1 - y0)*gh/u), yc = y1 - s*u/2/gh;
      aAt.set(post ? [side*postX(yc), yc, postH(yc) + 0.0015, side] : [side*0.40, yc, 0.186 + 0.0015, 0], j*4);
      aDim.set([s, s*u, 0], j*3);
    });
  }
}
cells.forEach(({ x, y, h }, j) => aUV.set([x/AW, 1 - (y + h)/AHU, (x + CELL)/AW, 1 - y/AHU], j*4));
const atlas = document.createElement('canvas'); atlas.width = AW; atlas.height = AHU;
const tex = new THREE.CanvasTexture(atlas);
tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
function drawAtlas(){
  const g = atlas.getContext('2d')!;
  g.clearRect(0, 0, AW, AHU);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  CARVINGS.forEach((c, j) => {
    const { x, y, rs } = cells[j], cx = x + CELL/2, fs = Math.round(CELL*0.86);
    let v = y;
    g.font = `700 ${Math.round(fs*0.6)}px ${FONT}`;
    for (const ch of ['奉', '納']){ g.fillText(ch, cx, v + CELL*0.3); v += CELL*0.6; }
    v += CELL*0.35;
    g.font = `700 ${fs}px ${FONT}`;
    for (const r of rs){
      const len = r.len, mid = v + CELL*len/2;
      if (r.side){ g.save(); g.translate(cx, mid); g.rotate(Math.PI/2); g.fillText(r.s, 0, 0, CELL*len); g.restore(); }
      else g.fillText(r.s, cx, mid, CELL*0.92);   // two narrow ones squeeze side by side into the square
      v += CELL*len;
    }
  });
  tex.needsUpdate = true;
}
drawAtlas();
// the web font comes in pieces by character, so it is asked for with the names' own characters; drawn again once loaded
if (N && document.fonts && document.fonts.load) document.fonts.load('700 36px "Noto Serif SC"', '奉納' + CARVINGS.map(c => NAMES[c.k]).join('')).then(drawAtlas).catch(() => {});

const quad = new THREE.InstancedBufferGeometry();
quad.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
quad.setIndex([0, 1, 2, 0, 2, 3]);
const iT = new THREE.InstancedBufferAttribute(aT, 4).setUsage(THREE.DynamicDrawUsage), iDim = new THREE.InstancedBufferAttribute(aDim, 3).setUsage(THREE.DynamicDrawUsage);
quad.setAttribute('aT', iT); quad.setAttribute('aAt', new THREE.InstancedBufferAttribute(aAt, 4));
quad.setAttribute('aUV', new THREE.InstancedBufferAttribute(aUV, 4)); quad.setAttribute('aDim', iDim);
quad.instanceCount = N;
const carved = new THREE.Mesh(quad, new THREE.ShaderMaterial({
  uniforms: Object.assign(pick('uMirror','uWin','uPx','uFogColor','uFogDensity','uLamp','uLampPos','uFleetGlow','uFleetS','uFlash','uToon','uKeyT'), { tIns:{ value:tex } }),
  transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-4,
  vertexShader:inscriptionVert, fragmentShader:inscriptionFrag }));
carved.frustumCulled = false; carved.visible = N > 0; scene.add(carved);
// compile and upload while the page loads: the first frame that drew them stalled 150 ms on a laptop GPU
if (N){ renderer.compile(carved, camera, scene); renderer.initTexture(tex); }

// once a frame, after the gates have moved (src/main.ts updateTorii): each carving follows its gate and comes in or goes
export function updateInscriptions(t: number, dt: number){
  const d = Math.floor(t), k = Math.min(1, dt*4);
  CARVINGS.forEach((c, j) => {
    aT.set(TA.subarray(c.g*4, c.g*4 + 4), j*4);
    alpha[j] += ((d >= c.day ? 1 : 0) - alpha[j])*k;
    if (alpha[j] < 0.002) alpha[j] = 0;
    if (aDim[j*3]) aDim[j*3+2] = alpha[j] + (c.gold ? 2 : 0) + (c.wood ? 4 : 0);
  });
  iT.needsUpdate = true; iDim.needsUpdate = true;
}
