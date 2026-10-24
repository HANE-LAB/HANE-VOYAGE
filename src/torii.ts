import * as THREE from 'three';
import { DATA, MONTHS, NDAYS, mulberry32 } from './data';
import { renderer, scene } from './renderer';
import { pick } from './uniforms';
import { Builder, outlineGeometry } from './geometry';
import { toriiVert, toriiFrag, toriiLinesVert, toriiLinesFrag, plaqueVert, plaqueFrag, featherVert, featherFrag } from './shaders';

/* ---------- torii: one per month, the fleet sails through them ---------- */
// aPart: 0 vermilion, 1 black lacquer, 2 snow (winter months only), 3 shimenawa and shide (year gates only),
// 4 an icicle's root and 5 + 10 x its length its tip (winter months only; src/shaders/chunks/torii_shape.glsl draws them in)
const X = 0.64;
export const kasaY = (x: number) => 0.888 + 0.075*Math.pow(Math.min(1, Math.abs(x)/X), 2.4);   // the top beam's underside; it rises toward its ends
function buildTorii(){
  const b = new Builder();
  const R = [0.62,0.12,0.07], Kc = [0.045,0.04,0.04];
  for (const sx of [-1, 1]){
    const xb = sx*0.40, xt = sx*0.375, hb = 0.040, ht = 0.033, y0 = -0.06, y1 = 0.87;
    b.hexa([[xb-hb,y0,-hb],[xb+hb,y0,-hb],[xt+ht,y1,-ht],[xt-ht,y1,-ht],[xb-hb,y0,hb],[xb+hb,y0,hb],[xt+ht,y1,ht],[xt-ht,y1,ht]], R);
  }
  // sea torii stand on extra legs (稚児柱), like the great torii at Itsukushima
  for (const sx of [-1, 1]){
    const x = sx*0.40;
    for (const sz of [-1, 1]){ const z = sz*0.17; b.box(x, 0.20, z, 0.032, 0.52, 0.032, R); b.box(x, 0.47, z, 0.05, 0.028, 0.06, Kc); }
    b.box(x, 0.38, 0, 0.022, 0.03, 0.36, R); b.box(x, 0.16, 0, 0.022, 0.03, 0.36, R);
  }
  b.box(0, 0.665, 0, 1.00, 0.05, 0.05, R);
  b.box(0, 0.765, 0, 0.05, 0.155, 0.045, R);
  b.box(0, 0.862, 0, 1.06, 0.045, 0.06, R);
  const N = 16;
  for (let i = 0; i < N; i++){
    const xa = -X + 2*X*i/N, xc = -X + 2*X*(i+1)/N;
    const ya = kasaY(xa), yc = kasaY(xc);
    // vermilion top beam (笠木) under a thin black-lacquered cap, so the gate does not read as a black slab from above
    const t = 0.055, t1 = 0.034, dz = 0.042 + 0.012*Math.abs((xa+xc)/2)/X, dc = dz + 0.006;
    b.hexa([[xa,ya,-dz],[xc,yc,-dz],[xc,yc+t1,-dz],[xa,ya+t1,-dz],[xa,ya,dz],[xc,yc,dz],[xc,yc+t1,dz],[xa,ya+t1,dz]], R);
    b.hexa([[xa,ya+t1,-dc],[xc,yc+t1,-dc],[xc,yc+t,-dc],[xa,ya+t,-dc],[xa,ya+t1,dc],[xc,yc+t1,dc],[xc,yc+t,dc],[xa,ya+t,dc]], Kc);
  }
  const part: number[] = [];
  for (let i = 0; i < b.P.length/3; i++) part.push(b.C[i*3] < 0.1 ? 1 : 0);
  const as = (p: number, f: () => void) => { const n = b.P.length/3; f(); for (let i = n; i < b.P.length/3; i++) part.push(p); };

  // Winter: snow lies thick on every beam that faces the sky, rounded like a cotton cap (綿帽子) and hanging a little
  // over both edges, and icicles hang under the top beam and the tie beam. The snow keeps off every corner of the wood
  // it sits on, so the wood's outline normals stay its own.
  const SNOW = [0.74,0.79,0.90];
  as(2, () => {
    // across the beam (in its half depths) and up (in snow depths); the outer points hang over the edges
    const prof = [[-1.16, -0.2], [-1.06, 0.3], [-0.72, 0.82], [0, 1], [0.72, 0.82], [1.06, 0.3], [1.16, -0.2]], L = prof.length - 1;
    // snow over a0..a1 along a beam whose top is at y(a), half depth d(a); h(a) is the snow's depth; at() places a point
    const sweep = (a0: number, a1: number, n: number, y: (a: number) => number, d: (a: number) => number, h: (a: number) => number, at: (a: number, across: number, up: number) => number[]) => {
      for (let i = 0; i < n; i++){
        const aa = a0 + (a1 - a0)*i/n, ac = a0 + (a1 - a0)*(i+1)/n, am = (aa + ac)/2;
        const P = (a2: number, k: number) => at(a2, prof[k][0]*d(a2), y(a2) + prof[k][1]*h(a2)), cen = at(am, 0, y(am) + 0.35*h(am));
        for (let k = 0; k < L; k++) b.quadOut(P(aa, k), P(ac, k), P(ac, k+1), P(aa, k+1), SNOW, 0, cen);
        b.quadOut(P(aa, 0), P(ac, 0), P(ac, L), P(aa, L), SNOW, 0, cen);
        if (i === 0) for (let k = 1; k < L; k++) b.triOut(P(aa, 0), P(aa, k), P(aa, k+1), SNOW, 0, cen);
        if (i === n-1) for (let k = 1; k < L; k++) b.triOut(P(ac, 0), P(ac, k), P(ac, k+1), SNOW, 0, cen);
      }
    };
    // lumpy, and rounded off toward both ends
    const lumpy = (h0: number, a0: number, a1: number) => (a: number) => h0*(0.86 + 0.10*Math.sin(a*53 + 1.3) + 0.06*Math.sin(a*131 + 0.4))*(0.45 + 0.55*Math.min(1, (a - a0)/0.04, (a1 - a)/0.04));
    const alongX = (z0: number) => (a: number, across: number, up: number) => [a, up, z0 + across];
    const alongZ = (x0: number) => (a: number, across: number, up: number) => [x0 + across, up, a];
    sweep(-X - 0.006, X + 0.006, 32, x => kasaY(x) + 0.055, x => 0.048 + 0.012*Math.min(1, Math.abs(x)/X), lumpy(0.050, -X - 0.006, X + 0.006), alongX(0));   // top beam, 0.48 deep
    sweep(-0.505, 0.505, 20, () => 0.69, () => 0.025, lumpy(0.032, -0.505, 0.505), alongX(0));   // tie beam
    for (const sx of [-1, 1]){
      const x0 = sx*0.40;
      for (const sz of [-1, 1]) sweep(x0 - 0.027, x0 + 0.027, 3, () => 0.484, () => 0.031, lumpy(0.030, x0 - 0.027, x0 + 0.027), alongX(sz*0.17));   // the legs' caps
      sweep(-0.18, 0.18, 8, () => 0.395, () => 0.011, lumpy(0.013, -0.18, 0.18), alongZ(x0));   // the legs' upper cross beam
    }
  });
  // icicles: thin three-sided cones, kept off the plaque and off the middle of the tie beam, where her mast and figure pass
  const ICE = [0.66,0.76,0.88], ice0 = b.P.length/3, rnd = mulberry32(17);
  const icicle = (x: number, y: number, z: number, len: number) => {
    const r = 0.0065, tip = [x, y - len, z], c = [x, y - len*0.4, z];
    const ring = [0, 1, 2].map(k => [x + r*Math.cos(k*2.094 + 0.5), y, z + r*Math.sin(k*2.094 + 0.5)]);
    for (let k = 0; k < 3; k++){   // wound outward by hand, and marked like sails so they get no ink outline
      const p = ring[k], q = ring[(k+1)%3], u = [q[0]-p[0], q[1]-p[1], q[2]-p[2]], v = [tip[0]-p[0], tip[1]-p[1], tip[2]-p[2]];
      const n = [u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]];
      const out = n[0]*((p[0]+q[0]+tip[0])/3 - c[0]) + n[1]*((p[1]+q[1]+tip[1])/3 - c[1]) + n[2]*((p[2]+q[2]+tip[2])/3 - c[2]);
      if (out < 0) b.tri(p, tip, q, ICE, 0, [0,0],[1,0],[0,1]); else b.tri(p, q, tip, ICE, 0, [0,0],[1,0],[0,1]);
    }
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    for (const x of [0.12, 0.19, 0.26, 0.31, 0.46, 0.52, 0.58]){ const xx = sx*(x + (rnd() - 0.5)*0.02); icicle(xx, kasaY(xx) - 0.001, sz*(0.036 + 0.012*Math.abs(xx)/X), 0.018 + rnd()*0.032); }
    for (const x of [0.22, 0.28, 0.33, 0.44, 0.48]) icicle(sx*(x + (rnd() - 0.5)*0.015), 0.639, sz*0.019, 0.012 + rnd()*0.018);
  }
  for (let i = ice0; i < b.P.length/3; i += 3){
    const top = Math.max(b.P[i*3+1], b.P[i*3+4], b.P[i*3+7]);
    for (let k = 0; k < 3; k++){ const y = b.P[(i+k)*3+1]; part.push(y < top - 1e-6 ? 5 + (top - y)*10 : 4); }
  }

  // New Year: a straw rope (注連縄) under the tie beam, sagging a little, with four zigzag paper streamers (紙垂).
  // Only year gates wear it, and they are taller: its lowest paper is at about 6.0, above her mast top and her figure's head (5.6 at most, on the highest swell).
  const STRAW = [0.60,0.47,0.22], STRAW_D = [0.42,0.31,0.13], PAPER = [0.58,0.57,0.54];   // off-white: brighter paper would cross the bloom threshold when her lamp passes under it
  as(3, () => {
    const NS = 20, NR = 6, r = 0.015, xr = 0.38, rope = (x: number) => 0.628 - 0.030*(1 - (x/xr)*(x/xr));
    const ring = (i: number) => { const x = -xr + 2*xr*i/NS, y = rope(x); return Array.from({ length:NR }, (_, k) => { const a = 2*Math.PI*k/NR; return [x, y + r*Math.cos(a), r*Math.sin(a)]; }); };
    for (let i = 0; i < NS; i++){
      const p = ring(i), q = ring(i+1), x = -xr + 2*xr*(i+0.5)/NS, cen = [x, rope(x), 0];
      for (let k = 0; k < NR; k++) b.quadOut(p[k], q[k], q[(k+1)%NR], p[(k+1)%NR], (i + k) % 2 ? STRAW : STRAW_D, 0, cen);   // the twist
    }
    for (const xs of [-0.24, -0.08, 0.08, 0.24]){
      let y = rope(xs) - r*0.6;
      for (let k = 0; k < 4; k++){
        const x = xs + (k % 2)*0.012, w = 0.021, h = 0.017;
        b.tri([x-w/2,y,0],[x+w/2,y,0],[x+w/2,y-h,0],PAPER,0,[0,0],[1,0],[1,1]); b.tri([x-w/2,y,0],[x+w/2,y-h,0],[x-w/2,y-h,0],PAPER,0,[0,0],[1,1],[0,1]);
        y -= h;
      }
    }
  });
  const g = b.geo();
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  return g;
}
export const NM = MONTHS.length;
// tall enough that her mast clears the tie beam; same footprint for month and year gates.
// src/shaders/chunks/torii_place.glsl writes TORII_W out as 9.50.
export const TORII_W = 9.5, TORII_H = 9.5, TORII_HY = 11.5;
export const TA = new Float32Array(NM*4), TCELL = new Float32Array(NM*2);
// plaque atlas grid; src/shaders/plaque.vert.glsl writes one cell out as 1/ACOLS by 1/AROWS
const ACOLS = 16, AROWS = 8;
MONTHS.forEach((mo, i) => { const col = i % ACOLS, row = Math.floor(i/ACOLS); TCELL[i*2] = col/ACOLS; TCELL[i*2+1] = 1 - (row+1)/AROWS; });
export const iTA = new THREE.InstancedBufferAttribute(TA, 4).setUsage(THREE.DynamicDrawUsage);

/* ---------- what each month's gate wears (src/shaders/chunks/torii_shape.glsl reads it) ----------
   x: the gates are offerings, like a shrine's thousand torii, so each follows how many sailed with her that month:
      the month's mean of the daily 大航海 total, ranked over all months as HANE ranks its gates.
      0 plain wood (神明鳥居) for the quietest 35%, 1 vermilion, 2 vermilion with a pair of fire feathers for the top 15%
   y: season by the calendar month, 1 spring to 4 winter (src/seasons.ts dresses the gate for it; winter snow is part of the gate)
   z: 1 on the year gates (January), which wear a New Year shimenawa */
export const TDECO = new Float32Array(NM*4);
{
  const mean = MONTHS.map((mo, i) => {
    const d0 = Math.max(0, mo.d), d1 = i + 1 < NM ? MONTHS[i+1].d : NDAYS;
    let s = 0; for (let d = d0; d < d1; d++) s += DATA.total[d];
    return s/Math.max(1, d1 - d0);
  });
  mean.map((_, i) => i).sort((a, b) => mean[a] - mean[b]).forEach((i, r) => {
    const q = (r + 0.5)/NM, m = MONTHS[i].m;
    TDECO[i*4] = q >= 0.85 ? 2 : q < 0.35 ? 0 : 1;
    TDECO[i*4+1] = 1 + Math.floor(((m + 9) % 12)/3);
    TDECO[i*4+2] = m === 1 ? 1 : 0;
  });
}
export const iDeco = new THREE.InstancedBufferAttribute(TDECO, 4);

export let torii: THREE.Mesh, plaques: THREE.Mesh, toriiLines: THREE.Mesh;
{
  const base = buildTorii();
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', base.getAttribute('position')); g.setAttribute('normal', base.getAttribute('normal')); g.setAttribute('color', base.getAttribute('color'));
  g.setAttribute('aPart', base.getAttribute('aPart')); g.setAttribute('aOutN', base.getAttribute('aOutN'));
  g.setAttribute('aT', iTA); g.setAttribute('aDeco', iDeco); g.instanceCount = NM;
  torii = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: pick('uMirror','uWin','uPx','uFogColor','uFogDensity','uLamp','uLampPos','uFleetGlow','uFleetS','uFlash','uToon','uKeyT','uCastSat','uRimC','uRiseA','uRiseB','uRiseC'), side:THREE.DoubleSide, vertexColors:true,
    defines: { RISING: 0 },
    vertexShader: toriiVert,
    fragmentShader: toriiFrag
  }));
  torii.frustumCulled = false; scene.add(torii);

  // ink outline for the torii (二次元 style only)
  const tob = outlineGeometry(base), tog = new THREE.InstancedBufferGeometry();
  tog.setAttribute('position', tob.getAttribute('position')); tog.setAttribute('aOutN', tob.getAttribute('aOutN')); tog.setAttribute('aPart', tob.getAttribute('aPart'));
  tog.setAttribute('aT', iTA); tog.setAttribute('aDeco', iDeco); tog.instanceCount = NM;
  // Lines only on gates big enough on screen (about 50 px and up) and they thin out before they vanish: a one-pixel
  // line on a far gate aliases and crawls, which is most of what read as flicker. Colour is a dark vermilion (色トレス), not black.
  toriiLines = new THREE.Mesh(tog, new THREE.ShaderMaterial({
    uniforms: pick('uMirror','uWin','uPx','uFogColor','uFogDensity','uToon','uLineW'), side:THREE.BackSide,
    vertexShader: toriiLinesVert,
    fragmentShader: toriiLinesFrag
  }));
  toriiLines.frustumCulled = false; scene.add(toriiLines);

  // plaques (扁額) with the year or the month, front and back; hung proud of the beams so they can be wider than the gap
  const P: number[] = [], Nn: number[] = [], UV: number[] = [];
  const PW = 0.104, PH = 0.154;
  const x0 = -PW/2, x1 = PW/2, y0 = 0.692, y1 = y0 + PH, zf = 0.033;
  const quad = (z: number, nz: number, flip: boolean) => { const a=[x0,y0,z], b2=[x1,y0,z], c=[x1,y1,z], d=[x0,y1,z];
    const ua = flip?[1,0]:[0,0], ub = flip?[0,0]:[1,0], uc = flip?[0,1]:[1,1], ud = flip?[1,1]:[0,1];
    P.push(...a,...b2,...c,...a,...c,...d); UV.push(...ua,...ub,...uc,...ua,...uc,...ud); for(let i=0;i<6;i++) Nn.push(0,0,nz); };
  quad(zf, 1, false); quad(-zf, -1, true);
  const pg = new THREE.InstancedBufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(P,3)); pg.setAttribute('normal', new THREE.Float32BufferAttribute(Nn,3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(UV,2));
  pg.setAttribute('aT', iTA); pg.setAttribute('aCell', new THREE.InstancedBufferAttribute(TCELL, 2)); pg.instanceCount = NM;
  const atlas = document.createElement('canvas'); atlas.width = 1024; atlas.height = 1024;
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const KN = ['〇','一','二','三','四','五','六','七','八','九'];
  const MK = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const drawAtlas = () => {
    const g2 = atlas.getContext('2d')!;
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.fillStyle = '#0b0909'; g2.fillRect(0, 0, 1024, 1024);
    MONTHS.forEach((mo, i) => {
      const x = (i % ACOLS)*64, y = Math.floor(i/ACOLS)*128;
      // draw at the plaque's true proportions, then squeeze into the 64x128 cell, so the letters are not stretched
      const W = 128*PW*TORII_W/(PH*(mo.m === 1 ? TORII_HY : TORII_H));
      g2.save(); g2.translate(x, y); g2.scale(64/W, 1);
      g2.fillStyle = '#120d0b'; g2.fillRect(0, 0, W, 128);
      g2.strokeStyle = '#a77a36'; g2.lineWidth = 3.4; g2.strokeRect(5, 5, W - 10, 118);
      g2.strokeStyle = '#6a4a20'; g2.lineWidth = 1.2; g2.strokeRect(10, 10, W - 20, 108);
      const txt = mo.m === 1 ? String(mo.y).split('').map(c => KN[+c]).join('') : MK[mo.m-1];
      const chars = Array.from(txt); const fs = chars.length >= 4 ? 24 : (chars.length === 3 ? 32 : 44);
      g2.fillStyle = '#f3cf86'; g2.font = `700 ${fs}px "Noto Serif SC","Songti SC","STSong","SimSun",serif`; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      const step = fs*1.02, top = 64 - step*chars.length/2;
      chars.forEach((ch, k) => g2.fillText(ch, W/2, top + step*(k + 0.5)));
      g2.restore();
    });
    atlasTex.needsUpdate = true;
  };
  drawAtlas();
  if (document.fonts && document.fonts.load) document.fonts.load('700 36px "Noto Serif SC"').then(drawAtlas).catch(() => {});
  plaques = new THREE.Mesh(pg, new THREE.ShaderMaterial({
    uniforms: Object.assign(pick('uMirror','uWin','uFogColor','uFogDensity','uLamp','uLampPos','uFleetGlow','uFleetS','uFlash','uToon','uKeyT'), { tAtlas:{ value:atlasTex } }), side:THREE.DoubleSide,
    vertexShader: plaqueVert,
    fragmentShader: plaqueFrag
  }));
  plaques.frustumCulled = false; scene.add(plaques);
}

/* ---------- 火羽: the best-crewed months' gates wear a pair of fire feathers, as in HANE ---------- */
{
  // one feather along +x, its quill bending toward +y; drawn the way HANE draws its gate feathers
  const c = document.createElement('canvas'), Lp = 256, Hp = 96; c.width = Lp; c.height = Hp;
  const g = c.getContext('2d')!, y0 = Hp*0.42, bend = Hp*0.22, u0 = 0.14, wOut = Hp*0.34, wIn = Hp*0.22, NP = 48;
  const at = (u: number): [number, number] => [8 + (Lp - 18)*u, y0 + bend*u*u];
  const dir = (u: number) => { const dx = Lp - 18, dy = 2*bend*u, n = Math.hypot(dx, dy); return [dx/n, dy/n]; };
  const prof = (u: number) => u <= u0 ? 0 : Math.pow(Math.max(0, Math.sin(Math.PI*Math.pow((u - u0)/(1 - u0), 0.7))), 0.8);
  const edge = (u: number, side: number, k = 1): [number, number] => {
    const [x, y] = at(u), [tx, ty] = dir(u), f = prof(u)*(side < 0 ? wOut : wIn)*k;
    return [x - side*ty*f + tx*f*0.45, y + side*tx*f + ty*f*0.45];
  };
  const line = (side: number) => { g.beginPath(); for (let i = 0; i <= NP; i++){ const p = edge(u0 + (1 - u0)*i/NP, side); if (i) g.lineTo(...p); else g.moveTo(...p); } };
  const outline = () => {
    g.beginPath(); g.moveTo(...at(u0));
    for (let i = 0; i <= NP; i++) g.lineTo(...edge(u0 + (1 - u0)*i/NP, -1));
    for (let i = NP; i >= 0; i--) g.lineTo(...edge(u0 + (1 - u0)*i/NP, 1));
    g.closePath();
  };
  const fire = g.createLinearGradient(8, 0, Lp - 10, 0);
  ([[0, '#7e1d10'], [0.18, '#b8301b'], [0.45, '#e2582a'], [0.7, '#f39a3e'], [0.88, '#f9cf78'], [1, '#fff1d2']] as const).forEach(([o, col]) => fire.addColorStop(o, col));
  outline(); g.fillStyle = fire; g.fill();
  g.save(); outline(); g.clip();
  g.strokeStyle = 'rgba(255,232,196,.13)'; g.lineWidth = 1.1;
  for (let u = u0 + 0.015; u < 0.98; u += 0.022) for (const s of [-1, 1]){ g.beginPath(); g.moveTo(...at(u)); g.lineTo(...edge(Math.min(1, u + 0.03), s, 1.05)); g.stroke(); }
  g.strokeStyle = 'rgba(90,20,10,.28)'; g.lineWidth = 7; line(-1); g.stroke();
  g.restore();
  g.strokeStyle = 'rgba(255,226,170,.42)'; g.lineWidth = 1.6; line(1); g.stroke();
  g.strokeStyle = 'rgba(60,14,8,.6)'; g.lineWidth = 2.4; outline(); g.stroke();
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (const [u, s, k] of [[0.46, -1, 0.55], [0.68, -1, 0.45], [0.58, 1, 0.5]]){
    const a = edge(u - 0.012, s), b2 = edge(u + 0.012, s), inner = edge(u + 0.03, s, 1 - k);
    g.beginPath(); g.moveTo(...a); g.lineTo(...inner); g.lineTo(...b2); g.closePath(); g.fill();
  }
  g.restore();
  g.lineCap = 'round';
  for (let i = 0; i < 30; i++){
    const u1 = 0.94*i/30, u2 = 0.94*(i + 1)/30;
    g.strokeStyle = `rgba(255,246,226,${(0.95 - 0.35*u1).toFixed(3)})`; g.lineWidth = 4.6*(1 - u1) + 0.9;
    g.beginPath(); g.moveTo(...at(u1)); g.lineTo(...at(u2)); g.stroke();
  }
  // two quads in the gate's plane, rooted on the middle of the top beam; each leans out and its tip turns back in.
  // World units: a feather is 3.8 long, so the pair stands about a third of the gate's height above it.
  const L = 3.8, W = L*Hp/Lp, tilt = 0.42, P: number[] = [], UV: number[] = [];
  for (const k of [-1, 1]){
    const d = [k*Math.sin(tilt), Math.cos(tilt)], n = [-k*Math.cos(tilt), Math.sin(tilt)], root = [k*0.12, -0.12];
    const pt = (x: number, y: number) => [root[0] + d[0]*x + n[0]*y, root[1] + d[1]*x + n[1]*y, 0];
    const xa = -0.06*L, xb = 0.94*L, ya = -0.42*W, yb = 0.58*W;
    P.push(...pt(xa, ya), ...pt(xb, ya), ...pt(xb, yb), ...pt(xa, ya), ...pt(xb, yb), ...pt(xa, yb));
    UV.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);
  }
  const fg = new THREE.InstancedBufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  fg.setAttribute('aT', iTA); fg.setAttribute('aDeco', iDeco); fg.instanceCount = NM;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const feathers = new THREE.Mesh(fg, new THREE.ShaderMaterial({
    uniforms: Object.assign(pick('uMirror','uWin','uPx','uFogColor','uFogDensity','uToon'), { tFeather:{ value:tex } }),
    side:THREE.DoubleSide, alphaToCoverage:true,
    vertexShader: featherVert,
    fragmentShader: featherFrag
  }));
  feathers.frustumCulled = false; scene.add(feathers);
}

