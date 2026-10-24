import * as THREE from 'three';
import { MONTHS, di, mulberry32 } from './data';
import { onMotion, renderer, scene } from './renderer';
import { U, pick } from './uniforms';
import { NM, iDeco, iTA, kasaY } from './torii';
import { decoVert, decoFrag, weatherVert, weatherFrag } from './shaders';

/* =====================================================================
   SEASONS
   Each month's gate is dressed for its season, big enough to read down the whole row of gates:
   spring hangs weeping cherry (枝垂れ桜) from its top beam and floats petal rafts (花筏) at its feet,
   summer hangs festival lanterns, autumn is crowned with ginkgo and maple and drops leaves on the water,
   winter is snow and icicles, built into the gate itself (torii.ts), and puffs of snow sifting off its beams.
   The dress sways a little in the breeze and shakes as its gate comes up out of the sea (deco.vert.glsl).
   The weather of the day being shown falls around the camera: petals, fireflies, leaves or snow.
   ===================================================================== */

// atlas, 4 x 2 cells of 256 px: 0 cherry clump, 1 hanging cherry, 2 maple, 3 ginkgo, 4 red lantern, 5 white lantern,
// 6 petals afloat, 7 leaves afloat. Everything stays inside the cell's inner 240 px, so mipmaps do not bleed across.
const atlas = document.createElement('canvas'); atlas.width = 1024; atlas.height = 512;
let drawLanterns = () => {};
{
  const g = atlas.getContext('2d')!, rnd = mulberry32(2026), TAU = Math.PI*2;
  const cell = (i: number, f: () => void) => { g.save(); g.translate((i % 4)*256, Math.floor(i/4)*256); g.beginPath(); g.rect(8, 8, 240, 240); g.clip(); f(); g.restore(); };
  const mix = (a: number[], b: number[], u: number) => `rgb(${a.map((v, k) => Math.round(v + (b[k] - v)*u)).join(',')})`;

  // a cherry blossom: five notched petals, paler at the rim, around a deep pink eye
  const blossom = (x: number, y: number, r: number, rot: number, u: number) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    const grad = g.createRadialGradient(0, 0, r*0.1, 0, 0, r);
    grad.addColorStop(0, mix([236, 120, 160], [244, 160, 190], u)); grad.addColorStop(0.45, mix([246, 186, 208], [255, 228, 238], u)); grad.addColorStop(1, mix([250, 214, 226], [255, 246, 250], u));
    g.fillStyle = grad; g.strokeStyle = 'rgba(128,48,84,.55)'; g.lineWidth = 1.2;
    for (let k = 0; k < 5; k++){
      g.rotate(TAU/5); g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(-r*0.62, -r*0.30, -r*0.50, -r*1.02, -r*0.14, -r*0.98); g.lineTo(0, -r*0.80); g.lineTo(r*0.14, -r*0.98);
      g.bezierCurveTo(r*0.50, -r*1.02, r*0.62, -r*0.30, 0, 0); g.fill(); g.stroke();
    }
    g.fillStyle = '#b8325c'; g.beginPath(); g.arc(0, 0, r*0.2, 0, TAU); g.fill();
    g.fillStyle = '#f5d47a'; for (let k = 0; k < 6; k++){ const a = k*TAU/6 + 0.3; g.beginPath(); g.arc(Math.cos(a)*r*0.3, Math.sin(a)*r*0.3, Math.max(1, r*0.07), 0, TAU); g.fill(); }
    g.restore();
  };
  // a mass of flowers inside an ellipse: a dark rim and a shaded body first, then blossoms, lit from above
  const clump = (cx: number, cy: number, rx: number, ry: number, n: number, fr: number) => {
    const blobs = Array.from({ length: 14 }, () => { const a = rnd()*TAU, d = Math.sqrt(rnd())*0.62; return [cx + Math.cos(a)*d*rx, cy + Math.sin(a)*d*ry, (0.36 + rnd()*0.2)*Math.min(rx, ry)]; });
    g.strokeStyle = 'rgba(96,30,62,.85)'; g.lineWidth = 5; for (const [x, y, r] of blobs){ g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
    g.fillStyle = '#b4648a'; for (const [x, y, r] of blobs){ g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    const fl = Array.from({ length: n }, () => { const a = rnd()*TAU, d = Math.sqrt(rnd()); return [cx + Math.cos(a)*d*rx*0.92, cy + Math.sin(a)*d*ry*0.92]; }).sort((a, b) => b[1] - a[1]);
    for (const [x, y] of fl) blossom(x, y, fr*(0.8 + rnd()*0.45), rnd()*TAU, Math.min(1, Math.max(0, (cy + ry - y)/(2*ry))));
  };
  cell(0, () => clump(128, 132, 104, 92, 46, 17));
  cell(1, () => {
    g.strokeStyle = '#3c2219'; g.lineWidth = 4; g.beginPath(); g.moveTo(130, 6); g.bezierCurveTo(120, 80, 140, 160, 126, 250); g.stroke();   // the weeping twig
    clump(128, 128, 60, 108, 30, 15);
  });

  // a maple leaf: seven pointed lobes; a ginkgo leaf: a notched fan on a stem
  const maple = (x: number, y: number, r: number, rot: number, col: string) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.beginPath();
    for (let i = 0; i <= 84; i++){ const a = i*TAU/84 - Math.PI/2, k = Math.pow(Math.abs(Math.cos(a*3.5 + Math.PI*0.5*3.5)), 2.5), rr = r*(0.40 + 0.60*k)*(1 + 0.05*Math.sin(a*30)); if (i) g.lineTo(Math.cos(a)*rr, Math.sin(a)*rr); else g.moveTo(Math.cos(a)*rr, Math.sin(a)*rr); }
    g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(70,14,8,.75)'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(255,200,140,.35)'; g.lineWidth = 1; for (let k = 0; k < 7; k++){ const a = k*TAU/7 - Math.PI/2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a)*r*0.85, Math.sin(a)*r*0.85); g.stroke(); }
    g.restore();
  };
  const ginkgo = (x: number, y: number, r: number, rot: number, col: string) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.moveTo(0, 0);
    for (let i = 0; i <= 30; i++){ const a = -Math.PI/2 - 1.0 + 2.0*i/30, notch = 1 - 0.22*Math.exp(-Math.pow((i - 15)/2.2, 2)); g.lineTo(Math.cos(a)*r*notch, Math.sin(a)*r*notch); }
    g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(92,58,8,.7)'; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = 'rgba(120,80,10,.28)'; g.lineWidth = 0.8; for (let k = 1; k < 8; k++){ const a = -Math.PI/2 - 1.0 + 2.0*k/8; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a)*r*0.9, Math.sin(a)*r*0.9); g.stroke(); }
    g.strokeStyle = '#6b4a12'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, r*0.45); g.stroke();
    g.restore();
  };
  const leafMass = (cx: number, cy: number, rx: number, ry: number, n: number, r: number, gold: number) => {
    g.fillStyle = gold > 0.5 ? '#8a5a12' : '#6e1a10';
    for (let k = 0; k < 10; k++){ const a = rnd()*TAU, d = Math.sqrt(rnd())*0.55; g.beginPath(); g.arc(cx + Math.cos(a)*d*rx, cy + Math.sin(a)*d*ry, 0.42*Math.min(rx, ry), 0, TAU); g.fill(); }
    const at = Array.from({ length: n }, () => { const a = rnd()*TAU, d = Math.sqrt(rnd()); return [cx + Math.cos(a)*d*rx*0.85, cy + Math.sin(a)*d*ry*0.85]; }).sort((a, b) => b[1] - a[1]);
    for (const [x, y] of at){
      const lit = Math.min(1, Math.max(0, (cy + ry - y)/(2*ry))), rr = r*(0.8 + rnd()*0.4), rot = rnd()*TAU;
      if (rnd() < gold) ginkgo(x, y, rr, rot, mix([214, 150, 30], [250, 214, 92], lit));
      else maple(x, y, rr, rot, mix([168, 32, 20], [236, 108, 40], lit));
    }
  };
  cell(2, () => leafMass(128, 132, 100, 88, 30, 27, 0.25));
  cell(3, () => leafMass(128, 132, 100, 88, 32, 28, 0.85));

  // festival lanterns (提灯), drawn the way HANE draws its shrine lanterns: red paper with 火羽, white with red bands and 奉納,
  // black rims top and bottom, bamboo ribs; lit from inside, hanging from a cord
  const lantern = (white: boolean) => {
    const x = 128, y = 26, w = 128, cy = y + 0.81*w, y0 = y + 0.1*w, y1 = y + 1.52*w;
    g.strokeStyle = '#2a1c14'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 8); g.lineTo(x, y); g.stroke();
    const paper = g.createRadialGradient(x - w*0.1, cy - w*0.12, 0, x, cy, w*0.66);
    for (const [at, c] of (white ? [[0, '#fffaf0'], [0.45, '#ffe5b8'], [0.8, '#f1b07a'], [1, '#b8774a']] : [[0, '#ffe4ae'], [0.35, '#ffa25a'], [0.75, '#df552b'], [1, '#952a17']]) as [number, string][]) paper.addColorStop(at, c);
    g.save(); g.beginPath(); g.rect(x - w, y0, w*2, y1 - y0); g.clip();
    g.beginPath(); g.ellipse(x, cy, w*0.5, w*0.78, 0, 0, TAU); g.fillStyle = paper; g.fill();
    g.strokeStyle = 'rgba(90,28,14,.7)'; g.lineWidth = 3; g.stroke(); g.clip();
    if (white){ g.fillStyle = '#d6432a'; g.fillRect(x - w, y0, w*2, w*0.17); g.fillRect(x - w, y1 - w*0.17, w*2, w*0.17); }
    g.strokeStyle = 'rgba(110,40,20,.3)'; g.lineWidth = 3;
    for (let r = y0 + w*0.12; r < y1 - w*0.04; r += w*0.12){ g.beginPath(); g.moveTo(x - w*0.6, r + w*0.03); g.quadraticCurveTo(x, r - w*0.05, x + w*0.6, r + w*0.03); g.stroke(); }
    const [a, b] = white ? '奉納' : '火羽';
    g.font = `700 ${w*0.34}px "Noto Serif SC","Songti SC","STSong","SimSun",serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(40,14,8,.85)';
    g.fillText(a, x, cy - w*0.2); g.fillText(b, x, cy + w*0.2);
    g.restore();
    g.fillStyle = '#130d0b'; g.fillRect(x - w*0.29, y, w*0.58, w*0.11); g.fillRect(x - w*0.31, y1 - w*0.01, w*0.62, w*0.11);
  };
  // drawn again once the serif font has loaded, as the plaques are
  drawLanterns = () => { cell(4, () => { g.clearRect(0, 0, 256, 256); lantern(false); }); cell(5, () => { g.clearRect(0, 0, 256, 256); lantern(true); }); };
  drawLanterns();

  // rafts: petals or leaves afloat, thickest in the middle, under a faint haze of their colour
  const raft = (n: number, f: (x: number, y: number) => void, haze: string) => {
    const h = g.createRadialGradient(128, 128, 0, 128, 128, 112); h.addColorStop(0, haze); h.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = h; g.fillRect(8, 8, 240, 240);
    for (let i = 0; i < n; i++){ const a = rnd()*TAU, d = 100*Math.pow(rnd(), 0.8); f(128 + Math.cos(a)*d, 128 + Math.sin(a)*d*0.85); }
  };
  cell(6, () => raft(170, (x, y) => {
    g.save(); g.translate(x, y); g.rotate(rnd()*TAU); g.beginPath(); g.ellipse(0, 0, 5 + rnd()*2.5, 3 + rnd()*1.2, 0, 0, TAU);
    g.fillStyle = mix([240, 150, 182], [255, 236, 242], rnd()); g.fill(); g.strokeStyle = 'rgba(140,60,90,.35)'; g.lineWidth = 0.8; g.stroke(); g.restore();
  }, 'rgba(236,160,190,.45)'));
  cell(7, () => raft(46, (x, y) => {
    if (rnd() < 0.55) ginkgo(x, y, 9 + rnd()*4, rnd()*TAU, mix([206, 140, 26], [246, 204, 80], rnd()));
    else maple(x, y, 9 + rnd()*4, rnd()*TAU, mix([150, 28, 18], [228, 96, 36], rnd()));
  }, 'rgba(180,110,40,.3)'));
}
const atlasTex = new THREE.CanvasTexture(atlas);
atlasTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
if (document.fonts && document.fonts.load) document.fonts.load('700 36px "Noto Serif SC"').then(() => { drawLanterns(); atlasTex.needsUpdate = true; }).catch(() => {});

/* ---------- the dress: cards around each gate, in gate units (x and z across its 9.5 width, y up its height) ---------- */
// mode 0 faces the camera, 1 hangs upright below its anchor and turns to the camera (lanterns), 2 floats flat on the water,
// 3 is a puff of snow off a beam's edge (no atlas cell: deco.frag.glsl draws its flakes).
// kasa 1 marks cards on or under the top beam, which plain wood gates straighten.
type Card = [x: number, y: number, z: number, size: number, season: number, cell: number, mode: number, rot: number, kasa: number];
const cards: Card[] = [];
{
  const rnd = mulberry32(31), top = (x: number) => kasaY(x) + 0.055;
  for (const sx of [-1, 1]){
    // spring: blossom along the top beam, and weeping strands from both of its ends, outside the posts and far from any mast
    for (const x of [0.17, 0.24, 0.31, 0.38, 0.45, 0.52, 0.585, 0.635]) cards.push([sx*x, top(x) + 0.02, (rnd() - 0.5)*0.03, 0.62 + 0.3*x, 1, 0, 0, rnd()*6.28, 1]);
    for (const x of [0.28, 0.42, 0.56]) for (const sz of [-1, 1]) cards.push([sx*x, top(x) + 0.006, sz*0.032, 0.62, 1, 0, 0, rnd()*6.28, 1]);
    for (const [x0, z0] of [[0.575, 0.026], [0.622, -0.026]]){
      for (let k = 0; k < 6; k++) cards.push([sx*(x0 + 0.008*Math.sin(k*1.7)), kasaY(x0) + 0.01 - 0.056*k, z0, 0.80 - 0.07*k, 1, 1, 0, (rnd() - 0.5)*0.3, 1]);
    }
    cards.push([sx*0.475, 0.705, 0, 0.5, 1, 0, 0, rnd()*6.28, 0]);
    // summer: festival lanterns between the tie beam and the beam above it, and from the top beam's ends outside the posts
    cards.push([sx*0.155, 0.8395, 0, 0.62, 2, 4, 1, 0, 0], [sx*0.272, 0.8395, 0, 0.62, 2, 5, 1, 0, 0], [sx*0.535, kasaY(0.535), 0, 0.66, 2, 4, 1, 0, 1]);
    // autumn: a crown of gold ginkgo and maple along the top beam, a short spray at each end, leaves on the leg caps
    [0.16, 0.22, 0.28, 0.34, 0.40, 0.46, 0.52, 0.58, 0.63].forEach((x, k) => cards.push([sx*x, top(x) + 0.018, (rnd() - 0.5)*0.03, 0.60 + 0.3*x, 3, k % 3 === 1 ? 2 : 3, 0, rnd()*6.28, 1]));
    [0.25, 0.37, 0.49, 0.60].forEach((x, k) => cards.push([sx*x, top(x) + 0.004, (k % 2 ? 1 : -1)*0.034, 0.6, 3, 3, 0, rnd()*6.28, 1]));
    for (let k = 0; k < 2; k++) cards.push([sx*0.605, kasaY(0.605) - 0.02 - 0.05*k, 0.02, 0.55 - 0.08*k, 3, k ? 3 : 2, 0, rnd()*6.28, 1]);
    for (const sz of [-1, 1]) cards.push([sx*0.40, 0.50, sz*0.17, 0.32, 3, 2 + (rnd() < 0.5 ? 0 : 1), 0, rnd()*6.28, 0]);
    // winter: snow sifting off the edges of the snow on the top beam and the tie beam
    [0.10, 0.21, 0.33, 0.45, 0.57].forEach((x, k) => cards.push([sx*x, top(x) + 0.05, (k % 2 ? 1 : -1)*sx*0.05, 0.7, 4, 0, 3, 0, 1]));
    for (const x of [0.18, 0.36]) cards.push([sx*x, 0.725, sx*0.03, 0.6, 4, 0, 3, 0, 0]);
  }
  // petals and leaves afloat around the legs, clear of the lanes her escorts sail
  for (const [season, c] of [[1, 6], [3, 7]]) for (let k = 0; k < 12; k++){
    const sx = k % 2 ? 1 : -1;
    cards.push([sx*(0.30 + rnd()*0.38), 0, (rnd() - 0.5)*0.95, 1.1 + rnd()*0.9, season, c, 2, rnd()*6.28, 0]);
  }
}
{
  const n = cards.length, A = new Float32Array(n*6*4), B = new Float32Array(n*6*4), C = new Float32Array(n*6*3);
  const corners = [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];
  cards.forEach((c, i) => corners.forEach(([u, v], k) => {
    const j = i*6 + k;
    A.set([c[0], c[1], c[2], c[3]], j*4); B.set([c[4], c[5], c[6], c[7]], j*4); C.set([u, v, c[8]], j*3);
  }));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n*6*3), 3));
  g.setAttribute('aCard', new THREE.Float32BufferAttribute(A, 4)); g.setAttribute('aInfo', new THREE.Float32BufferAttribute(B, 4)); g.setAttribute('aCorner', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aT', iTA); g.setAttribute('aDeco', iDeco); g.instanceCount = NM;
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign(pick('uTime','uTravel','uMirror','uWin','uPx','uFogColor','uFogDensity','uFleetGlow','uFleetS','uToon','uRiseA','uRiseB','uRiseC'), { tDeco:{ value:atlasTex }, uCalm:{ value:0 } }),
    side:THREE.DoubleSide, alphaToCoverage:true,
    vertexShader: decoVert,
    fragmentShader: decoFrag
  });
  // reduced motion stills the sway and the shake and stops the snow sifting
  onMotion(calm => { mat.uniforms.uCalm.value = calm ? 1 : 0; });
  const dress = new THREE.Mesh(g, mat);
  dress.frustumCulled = false; scene.add(dress);
}

/* ---------- the day's weather, around the camera; hidden while motion is reduced ---------- */
{
  const N = 900, rnd = mulberry32(77), seed = new Float32Array(N*4*4), slot = new Float32Array(N*4);
  for (let i = 0; i < N*4; i++){ for (let k = 0; k < 4; k++) seed[i*4+k] = rnd(); slot[i] = i % 4; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N*4*3), 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4)); g.setAttribute('aSlot', new THREE.Float32BufferAttribute(slot, 1));
  const weather = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: pick('uTime','uTravel','uSeason','uMirror','uPx','uPR','uFogColor','uFogDensity'),
    transparent:true, depthWrite:false, premultipliedAlpha:true,
    vertexShader: weatherVert,
    fragmentShader: weatherFrag
  }));
  weather.frustumCulled = false; scene.add(weather);
  onMotion(calm => { weather.visible = !calm; });
}

// spring, summer, autumn and winter on day t, easing from one to the next over about a week around each turn
export function updateSeasons(t: number){
  let i = NM - 1; while (i > 0 && MONTHS[i].d > t) i--;
  const mo = MONTHS[i], d1 = i + 1 < NM ? MONTHS[i+1].d : di(mo.y, mo.m + 1, 1);
  const s = (((mo.m + 9) % 12) + Math.min(1, Math.max(0, (t - mo.d)/(d1 - mo.d))))/3;   // 0 on 1 March, 4 a year later
  const k = Math.floor(s) % 4, f = s - Math.floor(s), e = 0.07, W = [0, 0, 0, 0];
  W[k] = 1;
  if (f < e){ const u = 0.5 + 0.5*f/e; W[k] = u; W[(k + 3) % 4] = 1 - u; }
  else if (f > 1 - e){ const u = 0.5 + 0.5*(1 - f)/e; W[k] = u; W[(k + 1) % 4] = 1 - u; }
  U.uSeason.value.set(W[0], W[1], W[2], W[3]);
}
