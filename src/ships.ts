import * as THREE from 'three';
import { Builder, type GroupKey } from './geometry';

/* =====================================================================
   THE FLEET'S SHIPS (2026-10-24): 御座船, rank shown by the deck house. 舰长 sail a small 弁才船 with one lit sail and no
   house; 提督 add a one-storey house (屋形) of lit paper aft; 总督 a two-storey one under a 唐破风, with banners (幟);
   her flagship is the 御座船 of Itsukushima's 管絃祭: three boats lashed under one deck, a pavilion hung with lanterns,
   four high lanterns, no sail. 无名之舰 are small boats with a blank sail the colour of the moon.
   Model space: +z the bow, +x starboard, y up, the water at y = 0, about 1 long. Built here at load; nothing is stored.
   ===================================================================== */
type V = number[];
// Hulls are dark tarred wood so the lit paper carries the fleet; the top strake shows the rank (wood, vermilion,
// vermilion and gold). Lit faces stay under the bloom threshold with every moving light at full (FRONTEND rule 10).
const HULL = [0.075,0.06,0.055], STRAKE = [0.24,0.16,0.11], DECK = [0.14,0.11,0.09], DARK = [0.10,0.08,0.07], LACQ = [0.05,0.04,0.04],
  RED = [0.62,0.15,0.08], GOLD = [0.46,0.32,0.12], WASHI = [0.96,0.88,0.74], ROOF = [0.07,0.06,0.065], CURTAIN = [0.42,0.41,0.39],
  LAMP_R = [1.0,0.30,0.15], LAMP_W = [0.92,0.64,0.42], FIRE = [1.0,0.50,0.16],
  ANON_HULL = [0.08,0.09,0.12], ANON_DECK = [0.16,0.17,0.20], MOON = [0.62,0.70,0.86], COOL = [0.62,0.76,1.0];
// glow: a paper sail lit from inside like a lantern, with the rank crest (ship.frag.glsl); a house's paper wall (shoji),
// lit from inside, with its lattice; a light
const SAIL = 0.5, SHOJI = 0.35, EM = 1;
const lerp = (a: number, b: number, t: number) => a + (b - a)*t;

// a triangle wound to face away from c, with the corners it shrinks to (f); degenerate ones are skipped
function triF(b: Builder, p: V[], f: V[], col: V, c: V, glow = 0){
  const ux = p[1][0]-p[0][0], uy = p[1][1]-p[0][1], uz = p[1][2]-p[0][2], vx = p[2][0]-p[0][0], vy = p[2][1]-p[0][1], vz = p[2][2]-p[0][2];
  const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
  if (Math.hypot(nx, ny, nz) < 1e-9) return;
  const mx = (p[0][0]+p[1][0]+p[2][0])/3 - c[0], my = (p[0][1]+p[1][1]+p[2][1])/3 - c[1], mz = (p[0][2]+p[1][2]+p[2][2])/3 - c[2];
  if (nx*mx + ny*my + nz*mz < 0) b.triF(p[0], p[2], p[1], f[0], f[2], f[1], col, glow);
  else b.triF(p[0], p[1], p[2], f[0], f[1], f[2], col, glow);
}
const quadF = (b: Builder, p: V[], f: V[], col: V, c: V, glow = 0) => { triF(b, [p[0], p[1], p[2]], [f[0], f[1], f[2]], col, c, glow); triF(b, [p[0], p[2], p[3]], [f[0], f[2], f[3]], col, c, glow); };
const quad = (b: Builder, p: V[], col: V, c: V, glow = 0) => quadF(b, p, p.map(q => b.far ? b.far(q) : q), col, c, glow);
// emit with every vertex shrinking to the point `to`, for parts only the detailed model has. A point, not a line: a
// triangle shrunk onto a line can still cover a sample once its corners snap to the pixel grid.
function shrink(b: Builder, to: V, f: () => void){ b.far = () => to; f(); b.far = null; }

/* ---------- hull: a 和船, flat bottom and flared planked sides; the sheer rises to a high square stern (戸立) and to
   the bow, where the stem (水押) sweeps up and forward past the deck. The detailed hull has NT stations, a chine and a
   coloured top strake; the far hull (for ships a few pixels tall) has three stations, one dark straight side and one
   deck across, and every vertex of the detailed one knows where on the far one it lies (the strake on the gunwale),
   so the one becomes the other without a jump. ---------- */
interface HullO { beam: number; depth: number; stern: number; bow: number; len?: number; z0?: number; x?: number; nar?: number;
  stem?: number; stemC?: V; side: V; band?: V; deck: V; rudder?: boolean }
interface St { z: number; hb: number; ys: number; bb: number; yb: number }
const NT = 6, TF = [0, 0.45, 1];
function station(o: HullO, t: number): St {
  const len = o.len ?? 0.86, z0 = o.z0 ?? -0.44, nar = o.nar ?? 0.45;
  const w = t < nar ? 0.78 + 0.22*Math.sin(t/nar*Math.PI/2) : Math.pow(Math.cos((t - nar)/(1 - nar)*Math.PI/2), 0.7);
  return { z: z0 + t*len, hb: o.beam/2*w, bb: o.beam/2*w*0.55,
    ys: o.depth + o.stern*Math.pow(Math.max(0, 1 - t/0.38), 2) + o.bow*Math.pow(Math.max(0, (t - 0.55)/0.45), 1.6),
    yb: -0.05 + 0.07*Math.pow(Math.max(0, (t - 0.72)/0.28), 1.5) };
}
// a station's side from the keel's centre line (s = 0) to the gunwale (s = 1): the flat bottom to 0.25, then the planked
// side flaring out through a chine at 0.6 to the top strake from 0.85. The far hull's side is straight, and the strake
// lies on its gunwale.
const SEC = [0, 0.25, 0.6, 0.85, 1];
function sec(st: St, s: number, far: boolean): number[] {
  if (s <= 0.25) return [st.bb*s/0.25, st.yb];
  const P = far ? [[0.25, st.bb, st.yb], [0.85, st.hb, st.ys], [1, st.hb, st.ys]]
    : [[0.25, st.bb, st.yb], [0.6, lerp(st.bb, st.hb, 0.75), lerp(st.yb, st.ys, 0.5)], [0.85, lerp(st.bb, st.hb, 0.97), lerp(st.yb, st.ys, 0.78)], [1, st.hb, st.ys]];
  for (let i = 0; i < P.length - 1; i++) if (s <= P[i+1][0]){ const u = (s - P[i][0])/(P[i+1][0] - P[i][0]); return [lerp(P[i][1], P[i+1][1], u), lerp(P[i][2], P[i+1][2], u)]; }
  return [st.hb, st.ys];
}
// a point of the hull's side (s from 0 to 1) or deck (s from -1 on the centre line to -2 at the gunwale), on the
// starboard (sx = 1) or port side, of the detailed hull or of the far one
function hullPt(o: HullO, t: number, s: number, sx: number, far: boolean): V {
  const x = o.x ?? 0;
  const at = (st: St, f: boolean) => s < 0 ? [(-s - 1)*st.hb, st.ys] : sec(st, s, f);
  if (!far){ const st = station(o, t), p = at(st, false); return [x + sx*p[0], p[1], st.z]; }
  const i = t >= TF[1] ? 1 : 0, u = (t - TF[i])/(TF[i+1] - TF[i]), A = station(o, TF[i]), B = station(o, TF[i+1]);
  const P = (st: St, q: number) => { const p = sec(st, q, true); return [x + sx*p[0], p[1], st.z]; };
  if (s < 0.25){ const a = at(A, true), c = at(B, true); return [x + sx*lerp(a[0], c[0], u), lerp(a[1], c[1], u), lerp(A.z, B.z, u)]; }
  // on the far side's quad from the bottom's edge (a = 0) to the gunwale (a = 1), on whichever of its two triangles
  // (split from the stern's bottom edge to the bow end's gunwale, as hull() emits it) the point falls in, so the
  // detailed side shrinks onto the far one exactly
  const a = Math.min(1, (s - 0.25)/0.6), q0 = P(A, 0.25), q1 = P(A, 1), q2 = P(B, 1), q3 = P(B, 0.25);
  return [0, 1, 2].map(k => a >= u ? q0[k] + a*(q1[k] - q0[k]) + u*(q2[k] - q1[k]) : q0[k] + u*(q3[k] - q0[k]) + a*(q2[k] - q3[k]));
}
// the detailed hull (each vertex knowing where it shrinks to), or the far hull alone
function hull(b: Builder, o: HullO, far = false){
  const x = o.x ?? 0, c = [x, o.depth*0.5, (o.z0 ?? -0.44) + (o.len ?? 0.86)*0.45];
  const P = (t: number, s: number, sx: number) => hullPt(o, t, s, sx, far), F = (t: number, s: number, sx: number) => hullPt(o, t, s, sx, true);
  const face = (k: number[][], sx: number, col: V) => quadF(b, k.map(([t, s]) => P(t, s, sx)), k.map(([t, s]) => F(t, s, sx)), col, c);
  if (far){
    // the far hull: each side one quad from the bottom's edge to the gunwale, the deck one quad across, the transom one;
    // the flat bottom is under water
    const deck = (t: number, sx: number) => P(t, -2, sx);
    for (let i = 0; i < TF.length - 1; i++){
      for (const sx of [1, -1]) face([[TF[i], 0.25], [TF[i], 1], [TF[i+1], 1], [TF[i+1], 0.25]], sx, o.side);
      const d = [deck(TF[i], -1), deck(TF[i], 1), deck(TF[i+1], 1), deck(TF[i+1], -1)];
      quadF(b, d, d, o.deck, c);
    }
    const tr = [P(0, 0.25, -1), P(0, 0.25, 1), P(0, 1, 1), P(0, 1, -1)];
    quadF(b, tr, tr, o.side, c);
    return;
  }
  const T = Array.from({ length: NT + 1 }, (_, i) => i/NT), S = SEC.slice(1);
  for (let i = 0; i < T.length - 1; i++){
    const t0 = T[i], t1 = T[i+1];
    for (const sx of [1, -1]){
      for (let j = 0; j < S.length - 1; j++){
        const s0 = S[j], s1 = S[j+1];
        face([[t0, s0], [t0, s1], [t1, s1], [t1, s0]], sx, s0 < 0.25 ? HULL : s0 >= 0.85 ? (o.band ?? o.side) : o.side);
      }
      face([[t0, -1], [t0, -2], [t1, -2], [t1, -1]], sx, o.deck);
    }
  }
  // the transom
  for (const sx of [1, -1]) for (let j = 0; j < S.length - 1; j++){
    const s0 = S[j], s1 = S[j+1], col = s0 >= 0.85 ? (o.band ?? o.side) : o.side;
    const mid = (p: V) => [x, p[1], p[2]], a = P(0, s0, sx), d = P(0, s1, sx), fa = F(0, s0, sx), fd = F(0, s1, sx);
    quadF(b, [a, d, mid(d), mid(a)], [fa, fd, mid(fd), mid(fa)], col, c);
  }
  const S0 = station(o, 0), E = station(o, 1), bowPt = [x, E.ys, E.z];
  // the stem (水押): a wedge from the forefoot up and forward past the deck, thinning to its tip
  shrink(b, bowPt, () => {
    const foot = [x, E.yb, E.z - 0.03], mid = [x, E.ys, E.z + 0.025], tip = [x, E.ys + (o.stem ?? 0.10), E.z + 0.11];
    const sc = [x, (E.ys + E.yb)/2 - 0.05, E.z - 0.05], w0 = 0.022, w1 = 0.016, w2 = 0.006, col = o.stemC ?? o.band ?? HULL;
    for (const sx of [1, -1]){
      quad(b, [[x + sx*w0, foot[1], foot[2]], [x + sx*w1, mid[1], mid[2]], [x + sx*w1, mid[1], mid[2] - 0.06], [x + sx*w0, foot[1] + 0.02, foot[2] - 0.05]], col, sc);
      quad(b, [[x + sx*w1, mid[1], mid[2]], [x + sx*w2, tip[1], tip[2]], [x + sx*w2, tip[1] - 0.02, tip[2] - 0.04], [x + sx*w1, mid[1], mid[2] - 0.06]], col, sc);
    }
    quad(b, [[x - w0, foot[1], foot[2]], [x + w0, foot[1], foot[2]], [x + w1, mid[1], mid[2]], [x - w1, mid[1], mid[2]]], col, sc);
    quad(b, [[x - w1, mid[1], mid[2]], [x + w1, mid[1], mid[2]], [x + w2, tip[1], tip[2]], [x - w2, tip[1], tip[2]]], col, sc);
    quad(b, [[x - w2, tip[1], tip[2]], [x + w2, tip[1], tip[2]], [x + w2, tip[1] - 0.02, tip[2] - 0.04], [x - w2, tip[1] - 0.02, tip[2] - 0.04]], col, sc);
  });
  // the stern deck overhangs the transom a little, and the big rudder hangs behind it
  shrink(b, [x, S0.ys, S0.z], () => b.box(x, S0.ys - 0.012, S0.z + 0.01, S0.hb*2.06, 0.024, 0.07, o.band ?? o.side));
  if (o.rudder ?? true) shrink(b, [x, S0.ys*0.42, S0.z - 0.04], () => b.box(x, S0.ys*0.42, S0.z - 0.04, 0.016, S0.ys*0.95, 0.07, HULL));
}
// a low bulwark (垣立) on the sheer along both sides, from the stern to t1
function bulwark(b: Builder, o: HullO, t1: number, h: number, col: V){
  for (let i = 0; i < NT && i/NT < t1; i++){
    const A = station(o, i/NT), B = station(o, Math.min((i + 1)/NT, t1)), x = o.x ?? 0, t = 0.012;
    for (const sx of [1, -1]){
      const ax = x + sx*(A.hb - t), bx = x + sx*(B.hb - t);
      b.hexa([[ax - t, A.ys - 0.005, A.z], [ax + t, A.ys - 0.005, A.z], [ax + t, A.ys + h, A.z], [ax - t, A.ys + h, A.z],
              [bx - t, B.ys - 0.005, B.z], [bx + t, B.ys - 0.005, B.z], [bx + t, B.ys + h, B.z], [bx - t, B.ys + h, B.z]], col);
    }
  }
}
// a square sail (弁才船 帆) hung from a yard, bellied forward, lit like a paper lantern by the ship's own light. The far
// sail is flat, one quad; the detailed one flattens into it.
function sail(b: Builder, z: number, y0: number, h: number, w: number, o: { nx?: number; ny?: number; bel?: number; col?: V; yard?: V } = {}, far = false){
  const nx = far ? 1 : o.nx ?? 4, ny = far ? 1 : o.ny ?? 3, bel = o.bel ?? 0.05, col = o.col ?? WASHI;
  const P = (u: number, v: number, flat: boolean) => [(u - 0.5)*w, y0 + v*h, z + 0.02 + (flat ? 0 : bel*Math.sin(Math.PI*u)*Math.sin(Math.PI*(0.15 + 0.85*v)))];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){
    const c = [[i/nx, j/ny], [(i + 1)/nx, j/ny], [(i + 1)/nx, (j + 1)/ny], [i/nx, (j + 1)/ny]];
    for (const [a, d, e] of [[0, 1, 2], [0, 2, 3]])
      b.triF(P(c[a][0], c[a][1], far), P(c[d][0], c[d][1], far), P(c[e][0], c[e][1], far), P(c[a][0], c[a][1], true), P(c[d][0], c[d][1], true), P(c[e][0], c[e][1], true), col, SAIL, c[a], c[d], c[e]);
  }
  if (o.yard && !far) shrink(b, [0, y0 + h + 0.008, z + 0.02], () => b.box(0, y0 + h + 0.008, z + 0.02, w*1.10, 0.018, 0.018, o.yard!));
}
const mast = (b: Builder, z: number, y0: number, y1: number, col: V) => shrink(b, [0, (y0 + y1)/2, z], () => b.box(0, (y0 + y1)/2, z, 0.024, y1 - y0, 0.024, col));
// a lantern (提灯): lit paper between black lacquered rims, red or white with a red band (HANE's 紅白)
function lantern(b: Builder, x: number, y: number, z: number, s: number, col: V = LAMP_R){
  b.box(x, y, z, s*0.8, s, s*0.8, col, EM);
  if (col === LAMP_W) b.box(x, y - s*0.32, z, s*0.82, s*0.18, s*0.82, LAMP_R, EM);
  b.box(x, y + s*0.55, z, s*0.6, s*0.12, s*0.6, LACQ); b.box(x, y - s*0.55, z, s*0.6, s*0.12, s*0.6, LACQ);
}
// a lantern on a post at the stern: the ship's own light (LANPOS)
function sternLantern(b: Builder, o: HullO, y: number, s = 0.06, col = LAMP_R){
  const S = station(o, 0), z = S.z + 0.04, at = [0, y, z];
  shrink(b, at, () => { b.box(0, (S.ys + y)/2, z - 0.005, 0.012, y - S.ys, 0.012, DARK); lantern(b, 0, y, z, s, col); });
  return at;
}
// a deck house (屋形): paper walls lit from inside between posts, their lattice drawn in ship.frag.glsl (u counts the
// bars, v goes up the wall), and a gabled roof with eaves; kara arches the front eave into a 唐破風 edged with gold
function house(b: Builder, z0: number, z1: number, w: number, y0: number, y1: number, o: { roof?: V; rh?: number; eave?: number; post?: V; kara?: boolean; gable?: V } = {}){
  const hw = w/2, rh = o.rh ?? 0.08, ev = o.eave ?? 0.03, roof = o.roof ?? ROOF, BAR = 0.055;
  const wall = (a: number[], d: number[]) => {
    const L = Math.hypot(d[0] - a[0], d[1] - a[1])/BAR, A = [a[0], y0, a[1]], D = [d[0], y0, d[1]], A1 = [a[0], y1, a[1]], D1 = [d[0], y1, d[1]];
    b.tri(A, D, D1, WASHI, SHOJI, [0, 0], [L, 0], [L, 1]); b.tri(A, D1, A1, WASHI, SHOJI, [0, 0], [L, 1], [0, 1]);
  };
  wall([-hw, z1], [hw, z1]); wall([hw, z1], [hw, z0]); wall([hw, z0], [-hw, z0]); wall([-hw, z0], [-hw, z1]);
  // the sill, and the posts at the corners
  b.box(0, y0 + 0.006, (z0 + z1)/2, w + 0.012, 0.012, z1 - z0 + 0.012, o.post ?? DARK);
  if (o.post) for (const sx of [-1, 1]) for (const z of [z0, z1]) b.box(sx*hw, (y0 + y1)/2 + 0.004, z, 0.018, y1 - y0 + 0.008, 0.018, o.post);
  // two slopes from the eaves to the ridge along z, with a thick edge; the gable boards and the ridge
  const ze0 = z0 - ev, ze1 = z1 + ev, xe = hw + ev, yr = y1 + rh, rc = [0, y1, (z0 + z1)/2];
  for (const sx of [-1, 1]){
    quad(b, [[sx*xe, y1 - 0.01, ze0], [sx*xe, y1 - 0.01, ze1], [0, yr, ze1], [0, yr, ze0]], roof, rc);
    quad(b, [[sx*xe, y1 - 0.025, ze0], [sx*xe, y1 - 0.025, ze1], [sx*xe, y1 - 0.01, ze1], [sx*xe, y1 - 0.01, ze0]], roof, rc);
  }
  for (const [z, s] of [[ze0, -1], [ze1, 1]]){
    const p = [[-xe + 0.01, y1 - 0.01, z - s*0.005], [xe - 0.01, y1 - 0.01, z - s*0.005], [0, yr - 0.004, z - s*0.005]];
    triF(b, p, p, s > 0 ? (o.gable ?? roof) : roof, [0, y1, z - s*0.2]);
  }
  b.box(0, yr + 0.004, (ze0 + ze1)/2, 0.022, 0.016, ze1 - ze0 + 0.01, o.kara ? GOLD : roof);
  if (o.kara){
    const N = 6, zf = ze1 + 0.012, X = (u: number) => -xe*0.85 + u*xe*1.7, Y = (u: number) => y1 - 0.01 + rh*0.62*Math.sin(Math.PI*u) + rh*0.22*Math.pow(Math.sin(Math.PI*u), 8);
    for (let i = 0; i < N; i++){
      const a0 = i/N, a1 = (i + 1)/N;
      quad(b, [[X(a0), Y(a0), zf - 0.06], [X(a1), Y(a1), zf - 0.06], [X(a1), Y(a1), zf + 0.02], [X(a0), Y(a0), zf + 0.02]], roof, [0, y1 - 0.1, zf - 0.02]);
      quad(b, [[X(a0), Y(a0) - 0.022, zf + 0.02], [X(a1), Y(a1) - 0.022, zf + 0.02], [X(a1), Y(a1), zf + 0.02], [X(a0), Y(a0), zf + 0.02]], GOLD, [0, y1, zf - 0.1]);
    }
  }
}
// a tall banner (幟) on a pole, flying aft
function banner(b: Builder, x: number, z: number, y0: number, h: number, w: number, col: V){
  b.box(x, y0 + h*0.5 + 0.02, z, 0.012, h + 0.04, 0.012, DARK);
  quad(b, [[x, y0 + h*0.3, z - 0.006], [x, y0 + h, z - 0.006], [x, y0 + h, z - w], [x, y0 + h*0.3, z - w]], col, [x + 1, y0 + h*0.6, z - w/2]);
}
// her bonfire (篝火): an iron basket on a stand, the fire inside it
function bonfire(b: Builder, x: number, z: number, y0: number, h: number){
  b.box(x, y0 + h*0.5, z, 0.024, h, 0.024, LACQ);
  for (const s of [-1, 1]) b.box(x + s*0.03, y0 + h*0.25, z, 0.012, h*0.5, 0.06, LACQ);
  const r0 = 0.035, r1 = 0.06, ya = y0 + h, yb = ya + 0.06;
  b.hexa([[x - r0, ya, z - r0], [x + r0, ya, z - r0], [x + r1, yb, z - r1], [x - r1, yb, z - r1], [x - r0, ya, z + r0], [x + r0, ya, z + r0], [x + r1, yb, z + r1], [x - r1, yb, z + r1]], LACQ);
  b.box(x, yb + 0.012, z, r1*1.5, 0.03, r1*1.5, FIRE, EM);
  return [x, yb + 0.03, z];
}
// every ship carries aFar; where nothing shrinks it is the position itself
const geo = (b: Builder) => { const g = b.geo(); if (!g.getAttribute('aFar')) g.setAttribute('aFar', g.getAttribute('position')); return g; };

/* ---------- the five ships ---------- */
const KAN: HullO = { beam:0.30, depth:0.12, stern:0.10, bow:0.05, side:HULL, band:STRAKE, deck:DECK };
const ANON: HullO = { beam:0.26, depth:0.10, stern:0.06, bow:0.04, side:ANON_HULL, band:ANON_HULL, deck:ANON_DECK };
const TEI: HullO = { beam:0.32, depth:0.13, stern:0.08, bow:0.05, side:HULL, band:RED, deck:DECK, stemC:LACQ };
const SOU: HullO = { beam:0.36, depth:0.14, stern:0.08, bow:0.05, side:HULL, band:RED, deck:DECK, stemC:GOLD };
// the ship's own light (the lantern point, src/fleet.ts) and the masthead (veterans.ts stands its pillar of light there), model space
export const LANPOS = {} as Record<GroupKey, V>;
export const MAST_TOP = {} as Record<'sou' | 'tei' | 'kan', V>;
// her crest (flagship.ts) hangs at the middle of the 唐破風, in front of its gilt edge (z 0.122), as a 兎の毛通し
// hangs from one: its top at the curve's peak (y 0.436). Until 2026-10-24 it stood at z 0.105 and reached y 0.49, so
// the curved roof cut through its upper half.
export const CREST = { z:0.128, y:0.392, s:0.09 };

function kan(far: boolean){
  const b = new Builder();
  hull(b, KAN, far); sail(b, 0.06, 0.30, 0.56, 0.46, { yard:DARK }, far);
  if (!far){ mast(b, 0.06, 0.10, 0.93, DARK); LANPOS.kan = sternLantern(b, KAN, station(KAN, 0).ys + 0.12); MAST_TOP.kan = [0, 0.93, 0.06]; }
  return geo(b);
}
function anon(far: boolean){
  const b = new Builder();
  hull(b, ANON, far); sail(b, 0.04, 0.26, 0.50, 0.38, { col:MOON, nx:2, ny:2 }, far);
  if (!far){ mast(b, 0.04, 0.08, 0.80, ANON_HULL); LANPOS.anon = sternLantern(b, ANON, station(ANON, 0).ys + 0.11, 0.05, COOL); }
  return geo(b);
}
function tei(){
  const b = new Builder(), y = station(TEI, 1/NT).ys;
  hull(b, TEI);
  house(b, -0.40, -0.10, 0.22, y, y + 0.12, { post:LACQ });
  mast(b, 0.10, 0.10, 0.90, DARK); sail(b, 0.10, 0.34, 0.50, 0.42, { yard:DARK });
  MAST_TOP.tei = [0, 0.90, 0.10];
  LANPOS.tei = sternLantern(b, TEI, y + 0.24, 0.055);
  return geo(b);
}
function sou(){
  const b = new Builder(), y = station(SOU, 1/NT).ys;
  hull(b, SOU); bulwark(b, SOU, 0.62, 0.035, GOLD);
  house(b, -0.40, -0.02, 0.28, y, y + 0.13, { post:RED, rh:0.05 });
  house(b, -0.34, -0.10, 0.20, y + 0.17, y + 0.28, { post:RED, kara:true, gable:GOLD });
  mast(b, 0.18, 0.10, 0.86, DARK); sail(b, 0.18, 0.40, 0.40, 0.36, { yard:DARK });
  MAST_TOP.sou = [0, 0.86, 0.18];
  banner(b, 0.16, -0.43, y, 0.48, 0.09, RED); banner(b, -0.16, -0.43, y, 0.48, 0.09, RED);
  for (const sx of [-1, 1]) lantern(b, sx*0.17, y + 0.09, -0.02, 0.045, LAMP_W);
  LANPOS.sou = sternLantern(b, SOU, y + 0.36, 0.055);
  return geo(b);
}
function flag(){
  const b = new Builder();
  // three boats lashed side by side under one deck
  hull(b, { beam:0.22, depth:0.12, stern:0.06, bow:0.05, side:RED, band:LACQ, deck:DECK, stemC:LACQ, stem:0.08 });
  for (const sx of [-1, 1]) hull(b, { beam:0.17, depth:0.11, stern:0.05, bow:0.04, len:0.68, z0:-0.40, side:RED, band:LACQ, deck:DECK, stemC:LACQ, stem:0.05, x:sx*0.25, rudder:false });
  const yd = 0.135, zb = 0.30;
  b.box(0, yd - 0.01, (-0.42 + zb)/2, 0.70, 0.02, zb + 0.42, [0.24,0.17,0.12]);
  // a vermilion railing round the deck, open at the bow where she and kobuta stand
  for (const sx of [-1, 1]) b.box(sx*0.35, yd + 0.035, (-0.42 + zb)/2, 0.015, 0.05, zb + 0.42, RED);
  b.box(0, yd + 0.035, -0.42, 0.70, 0.05, 0.015, RED);
  // the pavilion: paper walls, a 唐破風 over the front with her crest, curtains under the eaves, lanterns along them
  const y1 = yd + 0.21;
  house(b, -0.36, 0.04, 0.40, yd, y1, { post:RED, rh:0.12, eave:0.05, kara:true, gable:GOLD });
  for (const sx of [-1, 1]) b.box(sx*0.207, y1 - 0.035, -0.16, 0.006, 0.05, 0.40, CURTAIN);
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) lantern(b, sx*0.236, y1 - 0.07, -0.32 + i*0.085, 0.036, i === 2 ? LAMP_W : LAMP_R);
  // four high lanterns (高張提灯) at the deck's corners
  for (const sx of [-1, 1]) for (const z of [-0.40, 0.28]){ b.box(sx*0.33, yd + 0.30, z, 0.014, 0.60, 0.014, LACQ); lantern(b, sx*0.33, yd + 0.56, z, 0.08); }
  // her bonfire on the port bow, behind her and kobuta as the 回望 camera (off the starboard bow) sees them
  LANPOS.flag = bonfire(b, -0.22, 0.20, yd, 0.10);
  return geo(b);
}
// the detailed model of each kind; kan and anon also have a far one, which the ships small on screen draw instead
export const SHIP_MODELS: Record<GroupKey, { near: THREE.BufferGeometry; far?: THREE.BufferGeometry }> = {
  flag: { near: flag() }, sou: { near: sou() }, tei: { near: tei() },
  kan: { near: kan(false), far: kan(true) }, anon: { near: anon(false), far: anon(true) },
};
