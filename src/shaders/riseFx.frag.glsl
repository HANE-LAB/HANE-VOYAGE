#include <voyage/fog>
// Every piece of water is a 2D distance field in its own card (world units), so an edge is one smooth step wide and an
// ink line is the same width in pixels everywhere.
// 写实: night water is seen by the light it catches: a faint grey-blue body and a bright line along the edges facing the
// moon, warmed smoothly by the fleet and her lamp. 二次元: a pale cyan body, a white rim toward the moon and a painted
// shade away from it, small drops as white dots, an ink line only round big shapes, and drawings on twos (12 a second),
// as hand-drawn effects move. Which way an edge faces comes from the field's own screen derivatives; no light is
// involved. Both stay under the bloom threshold whatever the lights do.
uniform float uToon; uniform float uFleetGlow; uniform float uLamp; uniform vec3 uLampPos; uniform float uFlash;
uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vW; varying vec4 vK; varying vec4 vX; varying vec2 vP; varying float vAge; varying vec4 vS; varying vec4 vT;
// integer hashes (PCG, after Jarzynski and Olano 2020): sin-based hashes band and repeat once their input grows
uint pcg(uint v){ uint s = v*747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s)*277803737u; return (w >> 22u) ^ w; }
float vnoise(vec2 p){ vec2 f = fract(p); f = f*f*(3.0 - 2.0*f); ivec2 i = ivec2(floor(p));
  float a = float(pcg(uint(i.x) + pcg(uint(i.y))) >> 8u), b = float(pcg(uint(i.x + 1) + pcg(uint(i.y))) >> 8u);
  float c = float(pcg(uint(i.x) + pcg(uint(i.y + 1))) >> 8u), d = float(pcg(uint(i.x + 1) + pcg(uint(i.y + 1))) >> 8u);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y)/16777216.0; }
// the same along a line: two hashes where the 2D one takes four
float vnoise1(float x){ float f = fract(x); int i = int(floor(x));
  return mix(float(pcg(uint(i + 65536)) >> 8u), float(pcg(uint(i + 65537)) >> 8u), f*f*(3.0 - 2.0*f))/16777216.0; }
// distance to a segment whose radius runs from ra to rb (a tapered capsule), and a smooth union
float segD(vec2 p, vec2 a, vec2 b, float ra, float rb){ vec2 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*t) - mix(ra, rb, t); }
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0)/k; return min(a, b) - h*h*k*0.25; }
// a splash plume: a leaning main jet and two smaller ones over a skirt on the water, drops flung off the tips as it falls back
float plume(vec2 p, float W, float hgt, float s, float ph){
  float c0 = (fract(s*5.3) - 0.5)*0.2*W, lean = (fract(s*9.1) - 0.5)*0.35*W, r = 0.09*W + 0.04;
  float h1 = hgt*(0.45 + 0.4*fract(s*7.13)), h2 = hgt*(0.35 + 0.4*fract(s*3.71));
  vec2 t0 = vec2(c0 + lean, hgt), t1 = vec2(c0 - 0.36*W, h1), t2 = vec2(c0 + 0.34*W, h2);
  float d = segD(p, vec2(c0, -0.1), t0, r*1.4, r*0.75);
  d = smin(d, segD(p, vec2(c0 - 0.15*W, -0.1), t1, r*1.1, r*0.5), r);
  d = smin(d, segD(p, vec2(c0 + 0.15*W, -0.1), t2, r*1.0, r*0.45), r);
  d = smin(d, segD(p, vec2(-0.42*W, -0.05), vec2(0.42*W, -0.05), r*1.1, r*1.1), r*1.2);
  float fly = smoothstep(0.35, 1.0, ph);
  d = min(d, length(p - t0 - vec2(lean*0.3, r*1.6 + fly*0.5*hgt)) - r*(0.7 - 0.3*fly));
  d = min(d, length(p - t1 - vec2(-0.08*W, r*1.3 + fly*0.35*hgt)) - r*(0.5 - 0.2*fly));
  d = min(d, length(p - t2 - vec2(0.07*W, r*1.2 + fly*0.3*hgt)) - r*(0.45 - 0.2*fly));
  return d;
}
// the underside of a beam's long edge at x, in gate units (as in riseFx.vert.glsl)
float edgeY(float ev, float wood, float x){ return ev > 0.5 ? 0.64 : 0.888 + (wood > 0.5 ? 0.0 : 0.075*pow(min(abs(x)/(9.50*0.64), 1.0), 2.4)); }
// A hash of two whole numbers (a pour's seed is one, riseFx.vert.glsl), as four numbers in [0, 1] from its four bytes:
// one hash where three were needed. Rounded first, since a varying that holds one value over a card can still differ in
// its last bits from pixel to pixel.
vec4 hash4(float a, float b){
  uint h = pcg(uint(int(floor(a + 0.5)) + 65536) ^ pcg(uint(int(floor(b + 0.5)) + 65536)));
  return vec4(uvec4(h, h >> 8u, h >> 16u, h >> 24u) & 255u)/255.0;
}
// A band of water centred at x, half width w (bx the fragment's place along the beam), that left the edge from tau 0
// until stop (dt: how far outside that time the water here is, in world units); rounded where it ends.
float band(float bx, float x, float w, float dt){ float dl = abs(bx - x) - w; return length(max(vec2(dl, dt), 0.0)) + min(max(dl, dt), 0.0); }
// The drops a strand or a stream breaks into below its break-up (Plateau–Rayleigh): bf of them a second, round, each a
// little bigger or smaller than rd, one in five missing, and each drifting sideways as it falls (spread a second), so
// they scatter instead of hanging in a row. tau: when the water here left the edge, tf: how long it has fallen, brk:
// when it broke up, v: how fast it falls; id tells strands apart. As shape() returns: the distance, the drop's radius.
vec3 drops(float bx, float x, float rd, float tau, float tf, float brk, float v, float bf, float spread, float id, float dt){
  float j = floor(tau*bf), bt = (fract(tau*bf) - 0.5)/bf;
  vec4 h = hash4(j, id);
  float dx = (h.y - 0.5)*spread*max(tf - brk, 0.0), r = rd*(0.7 + 0.6*h.x);
  return vec3(h.x < 0.2 ? 1e3 : max(length(vec2(bx - x - dx, bt*v)) - r, dt), r, -1.0);
}
// the nearer of two pieces of water
vec3 nearer(vec3 a, vec3 b){ return a.x < b.x ? a : b; }
// The pour off one side of a beam's edge, u across the card (riseFx.vert.glsl). Each height below the edge holds the water
// that left the edge at one moment tau. Water reads as water when it falls fast and breaks up at once into small,
// scattered drops; thick ropes, big rounded beads and slow, coherent flow read as syrup (Paulun et al. 2015, van Assen
// et al. 2018). So the sheet is whole only just under the edge: within at most a sixth of a second's fall it tears into
// thin strands, one every 0.6 units, and a tenth of a second later each breaks into small drops. Each strand stops
// leaving the edge at a moment of its own, earlier the farther it is from where the water gathers, earliest at the top
// beam's upturned ends, so the sheet opens from the top while what left before still falls below. At two or three
// points (vX.xyz) the water gathers into thin streams that pour on until vS.xyz, thin out, and break into drops a third
// of a second below the edge.
// When the water at x along the edge stops leaving it: last at the points where it gathers into streams, earlier the
// farther away, earliest at the top beam's upturned ends
float stopAt(float x){
  float hw = 0.5*vX.w, s = vS.w;
  for (int k = 0; k < 3; k++) s = max(s, mix(0.4*vS[k], vS.w, smoothstep(hw, hw + 1.0, abs(x - vX[k]))));
  return s - (vT.w > 0.5 ? 0.0 : 0.15*smoothstep(5.0, 6.0, abs(x)));
}
// How long the water that left the edge at tau, at x, falls before it tears: the first water pours thickest and holds
// together longest, and as the flow drops the sheet tears ever closer to the edge, along a ragged line; after a third of
// a second it is a lip a few pixels deep (a deeper one read as a panel hanging off the beam). The last fifth of a second
// before the water there stops (st) tears at once: as a sheet it fell away as a flat plate.
float tearAt(float x, float tau, float st){ return (mix(0.10, 0.02, smoothstep(0.0, 0.3, tau)) + 0.04*vnoise1(x*7.0 + tau*3.0 + vK.z))*smoothstep(0.0, 0.2, st - tau); }
vec3 stream(float u, float t){
  float bx = u*vP.y, h = vT.x, hw = 0.5*vX.w;   // the fragment's place along the beam (the card is centred on the gate)
  float dy = edgeY(vT.w, vT.z, bx)*h + vT.y - vW.y, y = max(dy, 0.0);
  float tf = (sqrt(V0*V0 + 2.0*G*y) - V0)/G, tau = t - tf, v = V0 + G*tf;   // how long it has been falling, so when it left
  // How far from its line a strand's water gets at this depth (its width and a pixel, then its drops' drift), and a
  // stream's, which drifts less.
  float reach = min(0.17 + 0.25*tf, 0.45), sreach = 0.27 + 0.08*tf;
  // Once the water away from the streams has stopped, most of the card is empty: there is water here only if a stream
  // is in reach, or the water within reach had not yet stopped when this water left. The stops rise toward the streams,
  // so the latest within reach is at one end of it. Checked first, this saves the rest on most of the card (2026-10-23:
  // on a laptop GPU at a phone's pixel count the pours cost about as much as everything else in the rise put together).
  // The 0.05 s margins keep what is skipped more than a pixel from any water, so no edge loses its smoothing; main()
  // takes the pixel's size from the card, not from this field, which jumps where the work is skipped.
  float near = min(min(abs(bx - vX.x), abs(bx - vX.y)), abs(bx - vX.z));
  if (near > sreach && tau > max(stopAt(bx - reach), stopAt(bx + reach)) + 0.05) return vec3(1e3, 0.5, -1.0);
  // The sheet, whole down to where it tears, as thick as that is long, streaked along its fall. Its leading edge is
  // ragged: the first water off the edge leaves as the strands below and the sheet fills in behind them over a tenth of
  // a second; with a straight front it fell away as a flat plate.
  // (only near the edge: it tears within 0.14 s of falling)
  float st = stopAt(bx), narrow = max(sqrt(V0/v), 0.5);   // narrow: the strands thin as the water speeds up
  vec3 d = vec3(1e3, 0.5, -1.0);
  if (tau < st + 0.05 && tf < 0.25){
    float tear = tearAt(bx, tau, st), lead = 0.03 + 0.07*vnoise1(bx*3.0 + vK.z*0.37);
    d = vec3(max(max(lead - tau, tau - st), tf - tear)*v, 0.5*tear*(V0 + 0.5*G*tear) + 0.01, smoothstep(0.45, 0.75, vnoise1(bx*5.0 + vK.z*0.73)));
  }
  // The strands hanging from its torn edge, each breaking into drops a little lower. Those out of reach are skipped
  // before the rest of their work; each tears at its own depth (a fixed offset, where the sheet's edge takes a noise).
  for (int i = -1; i <= 1; i++){
    float cell = floor(bx/0.6) + float(i);
    vec4 r = hash4(cell, vK.z);
    if (r.x < 0.25) continue;   // a quarter of them go into their neighbours
    float xk = (cell + 0.15 + 0.7*r.x)*0.6 + 0.03*sin(tau*6.0 + r.y*6.3);   // the strand, swaying a little
    if (abs(bx - xk) > reach) continue;
    float near = min(min(abs(xk - vX.x), abs(xk - vX.y)), abs(xk - vX.z)), by = 1.6 - 0.6*smoothstep(hw, hw + 1.2, near);   // thicker by a stream
    float sk = stopAt(xk), dt = max(-tau, tau - sk)*v, wk = (0.018 + 0.022*r.y)*by*narrow;
    float brk = (mix(0.10, 0.02, smoothstep(0.0, 0.3, tau)) + 0.04*r.w)*smoothstep(0.0, 0.2, sk - tau) + 0.08 + 0.12*r.z;
    d = nearer(d, tf < brk ? vec3(band(bx, xk, wk, dt), wk, -1.0) : drops(bx, xk, 0.03*by, tau, tf, brk, v, 14.0 + 8.0*r.y, 0.5, cell*7919.0 + vK.z, dt));
  }
  for (int k = 0; k < 3; k++){
    if (abs(bx - vX[k]) > sreach) continue;
    float ws = hw*narrow*(1.0 - smoothstep(0.5*vS[k], vS[k], tau)), dt = max(-tau, tau - vS[k])*v;
    d = nearer(d, tf < 0.32 ? vec3(band(bx, vX[k], ws, dt), ws, -1.0) : drops(bx, vX[k], 1.7*ws, tau, tf, 0.32, v, 12.0, 0.15, float(k)*104729.0 + vK.z, dt));
  }
  return vec3(max(d.x, max(-dy - 0.03, abs(bx) - (vT.w > 0.5 ? 4.75 : 6.08))), d.yz);   // not above the edge or past the beam's ends
}
// a drop hanging under the beam (p.y = 0 at the beam): a bulb that draws out a short neck only just before it lets go
float pendant(vec2 p){
  float rb = vX.x, nl = vX.y, nr = vX.z;
  return smin(length(p - vec2(0.0, -nl - rb)) - rb, segD(p, vec2(0.0, 0.03), vec2(0.0, -nl - 0.4*rb), 0.9*rb, nr), 0.6*rb);
}
// The shape's distance field; half its width where it is, to keep it at least a pixel wide and to tell thin from thick;
// and on a pour's sheet, its streaks (-1 elsewhere). One return at the end: with a return in each branch, Direct3D's
// compiler warned the result might be unset.
vec3 shape(vec2 p, float kind){
  vec3 d;
  if (kind < 0.5) d = stream(p.x, vAge);
  else if (kind < 1.5) d = vec3(length(p) - vX.x, vX.x, -1.0);
  // a falling drop: round, a little drawn out above in 写实 by the frame's exposure (riseFx.vert.glsl); the segment
  // keeps some length, as one of none divides by zero
  else if (kind < 2.5) d = vec3(segD(p, vec2(0.0, vX.x), vec2(0.0, max(vX.y - vX.x, vX.x*1.01)), vX.x, vX.x*0.6), vX.x, -1.0);
  else if (kind < 3.5) d = vec3(plume(p, vX.x, vX.z, vK.z, vK.w), 0.09*vX.x + 0.04, -1.0);
  else if (kind < 4.5) d = vec3(abs(length(p) - vX.x) - vX.y, vX.y, -1.0);   // a drop's ring on the sea
  else d = vec3(pendant(p), vX.x, -1.0);
  return d;
}
void main(){
  // the seconds since this beam left the water, on twos (12 a second) in 二次元: the same moment of a rise always looks
  // the same, whenever the gate comes up
  float kind = vK.x, tq = mix(vAge, floor(vAge*12.0)/12.0, uToon);
  // fw: a pixel's size in world units, from the card's own coordinates (every card's vP is in world units, and a pour's
  // vP.y is constant); hpx: half the local width, in pixels
  vec3 sh = shape(vP, kind);
  float d = sh.x, fw = max(max(fwidth(vP.x), fwidth(vP.y)), 1e-5), hpx = sh.y/fw;
  // most of a pour's card is empty: done with it before any of the colouring (a pour's colour needs no derivatives of
  // the field, below, so leaving a pixel early does not upset its neighbours')
  if (kind < 0.5 && d > 2.0*fw) discard;
  // a pour's sheet is thin water, whatever its size on screen: drawn as light streaked along its fall, never as a body
  // with a rim, which made it a solid plate
  bool sheet = sh.z >= 0.0;
  // Never thinner than a pixel (写实) or a pixel and a half (二次元): thinner, a strand or a drop crawls and sparkles as
  // it moves. It is drawn that wide instead and fainter by as much (a drop by its area), and a drop under a quarter of a
  // pixel fades out.
  bool dotty = kind > 0.5 && kind < 2.5 || kind > 4.5, ring = abs(kind - 4.0) < 0.5;
  float mh = mix(0.5, 0.75, uToon), thinA = 1.0;
  if (hpx < mh){ thinA = dotty ? (hpx/mh)*(hpx/mh)*smoothstep(0.06, 0.125, hpx) : hpx/mh; d -= (mh - hpx)*fw; hpx = mh; }
  // which way the edge here faces on the screen: 1 toward the moon (upper left), -1 away (lower right); the rim is a
  // band along the edge, a pixel and a half or a third of the half width. Not for the pours: their strands, drops and
  // streams are thin and all light, and their sheet is drawn as streaks.
  float facing = 0.0, rim = 0.0, cover = smoothstep(fw, -fw, d);
  if (kind > 0.5){
    vec2 gd = vec2(dFdx(d), dFdy(d));
    facing = dot(gd/max(length(gd), 1e-6), vec2(-0.7071, 0.7071));
    rim = smoothstep(-max(1.5*fw, 0.3*sh.y) - fw, -max(1.5*fw, 0.3*sh.y) + fw, d);
  }
  vec3 col; float a;
  if (uToon < 0.5){
    // 写实: anything under about three pixels across is all bright line; the plumes' body is broken up by a noise
    // anchored to the card (vP) that runs down it (world coordinates made the old hash band)
    float warm = 0.08*clamp(uFleetGlow, 0.0, 1.15) + 0.2*uLamp*exp(-length(vW - uLampPos)/10.0) + 0.05*uFlash;
    vec3 body = vec3(0.24, 0.28, 0.35) + vec3(1.0, 0.58, 0.28)*warm, glint = vec3(0.46, 0.50, 0.56) + vec3(1.0, 0.58, 0.28)*0.6*warm;
    float hl = sheet ? 0.25 + 0.5*sh.z : (kind < 0.5 ? 1.0 : max(1.0 - smoothstep(1.5, 3.0, hpx), rim*smoothstep(0.0, 0.5, facing)));
    float ba = abs(kind - 3.0) < 0.5 ? 0.16 + 0.14*vnoise(vP*vec2(6.0, 1.5) + vec2(vK.z*37.0, tq*5.0)) : 0.25;
    col = mix(body, glint, hl); a = cover*mix(ba, 0.65, hl);
  } else {
    // 二次元: anything under about five pixels across is all white, as hand-drawn small drops are; an ink line about
    // 1.4 px wide just inside the edge only on round shapes wider than about seven pixels (on smaller ones it was most of
    // the shape), and never on the pours, whose strands it turned into dark bars, or on the rings
    float lit = sheet ? 1.0 - 0.7*sh.z : (kind < 0.5 ? 1.0 : max(1.0 - smoothstep(2.0, 3.0, hpx), rim*smoothstep(0.1, 0.3, facing)));
    float shade = ring || sheet ? 0.0 : rim*smoothstep(0.1, 0.3, -facing)*(1.0 - lit);
    float ink = ring || kind < 0.5 ? 0.0 : 1.4*fw*smoothstep(3.0, 4.0, hpx);
    col = mix(mix(vec3(0.42, 0.53, 0.60), vec3(0.24, 0.33, 0.45), shade), vec3(0.56, 0.58, 0.60), lit);   // luma 0.50, 0.32, 0.58
    col = mix(vec3(0.07, 0.09, 0.15), col, smoothstep(fw, -fw, d + ink));
    a = cover;
  }
  // under the bloom threshold (0.60) whatever the lights do: at most 0.58
  col *= min(1.0, 0.58/max(dot(col, vec3(0.299, 0.587, 0.114)), 1e-4));
  a *= clamp(vK.y, 0.0, 1.0)*thinA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(col, uFogColor, fogF(length(vW - cameraPosition), uFogDensity)), a);
}
