#include <voyage/swell>
// Water above the sea while a gate rises (src/rise.ts): everything follows the seconds since its beam broke the surface.
// uRiseA: the gate's centre x and z, its height, its rise; uRiseB: seconds since the top beam, the tie beam and the legs'
// cross beams broke the surface (-1: not yet).
attribute vec4 aA; attribute vec4 aB; attribute vec2 aC; attribute float aG;
uniform float uMirror; uniform float uPx; uniform vec4 uRiseA[2]; uniform vec4 uRiseB[2]; uniform vec4 uRiseI; uniform float uToon; uniform float uCalm;
// vK: kind (0 pour, 1 spray, 2 falling drop, 3 plume, 4 a drop's ring on the sea, 5 a drop hanging under the beam),
// strength, seed, phase (a pour: how far the camera's right runs across the beam); vX: the shape's frame (pour: where
// its streams gather, how wide they are; plume: width, card height, plume height; spray: radius; falling drop: radius,
// length; ring: radius, half width; hanging drop: bulb radius, neck length, neck radius); vP: the fragment in that frame,
// in world units (a pour: across the card, and how far the camera's right runs along the beam); vAge: the seconds since
// its beam left the water, the only clock its shape follows. A pour also has vS: when each stream stops, and when the
// water far from them stops; and vT: the gate's height, how far the gate is still under, whether it is plain wood, which
// beam.
varying vec3 vW; varying vec4 vK; varying vec4 vX; varying vec2 vP; varying float vAge; varying vec4 vS; varying vec4 vT;
// when drop k of a drip point's n leaves, s0 its time scale (see the drips below)
float release(float k, float n, float s0){ float q = 1.0 - k/n; return s0/(q*q) - s0; }
// the underside of a beam's long edge at x (world units from the gate's centre), in gate units: the top beam rises
// toward its ends unless the gate is plain wood (kasaY in src/torii.ts, torii_shape.glsl; also in riseFx.frag.glsl)
float edgeY(float ev, float wood, float x){ return ev > 0.5 ? 0.64 : 0.888 + (wood > 0.5 ? 0.0 : 0.075*pow(min(abs(x)/(9.50*0.64), 1.0), 2.4)); }
void main(){
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vW = vec3(0.0); vK = vec4(0.0); vX = vec4(0.0); vP = vec2(0.0); vAge = 0.0; vS = vec4(0.0); vT = vec4(0.0);
  vec4 A = aG < 0.5 ? uRiseA[0] : uRiseA[1], B = aG < 0.5 ? uRiseB[0] : uRiseB[1];
  float ev = aA.y, age = ev < 0.5 ? B.x : (ev < 1.5 ? B.y : B.z);
  float keep = aG < 0.5 ? 1.0 : 1.0 - clamp(B.w, 0.0, 1.0);   // the older gate fades out before it leaves the slots (src/rise.ts)
  // not in the reflection; the drip points keep dripping for a minute, which shows only while paused or slowed
  if (age < 0.0 || age > (abs(aA.x - 2.0) < 0.5 ? 66.0 : 6.0) || uMirror < 0.0 || keep <= 0.0) return;
  vAge = age;
  if (uCalm > 0.5 && (aA.x > 0.5 && aA.x < 1.5 || aA.x > 2.5)) return;   // reduced motion: no spray, no plumes
  float h = A.z, r = A.w;
  vec2 xz = A.xy + aA.zw;
  // both slots share one layout (src/rise.ts); the gate's own index shifts the seeds, so each gate pours its own way and
  // keeps it when it moves to the other slot
  float vary = fract((aG < 0.5 ? uRiseI.x : uRiseI.y)*0.6180339887), wood = aG < 0.5 ? uRiseI.z : uRiseI.w;
  vec3 w, right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 side = normalize(vec3(right.x, 0.0, right.z));
  if (aA.x < 0.5){
    // the pour off one side of a beam's edge (POURS in src/rise.ts). Water that left the edge has fallen V0 s + G s²/2
    // below it s seconds later (in the beam's frame), so the pour reaches from the edge down to its first water, or the
    // sea, and once its last stream has stopped, from that stream's last water down. The card faces the camera about
    // the upright, centred on the gate; riseFx.frag.glsl draws the water in it. Each stream lasts up to 0.8 s longer
    // than the shortest, by the seed, which differs from gate to gate.
    float seed = fract(aC.y + vary), end = ev > 0.5 ? 4.75 : 6.08, sink = -(1.0 - r)*h*1.10;
    vec3 last = aC.x + 0.8*vec3(fract(seed*17.1), fract(seed*29.3), fract(seed*41.7));
    float st = age - max(last.x, max(last.y, aB.z > 1e3 ? 0.0 : last.z)), e0 = edgeY(ev, wood, 0.0), e1 = edgeY(ev, wood, end);
    float top = st > 0.0 ? e1*h + sink - st*(V0 + 0.5*G*st) : e1*h + sink + 0.05;
    float bot = max(e0*h + sink - age*(V0 + 0.5*G*age), swellH(A.xy + vec2(0.0, aA.z)) - 0.6);
    if (top <= bot) return;
    float span = end*abs(side.x) + 0.3*abs(side.z) + 0.1;   // half the card's width
    w = vec3(A.x, mix(bot, top, position.y + 0.5), A.y + aA.z) + side*position.x*2.0*span;
    vK = vec4(0.0, 1.0, floor(seed*4096.0), abs(side.z));   // a whole number, for the fragment shader's hash
    vX = aB; vS = vec4(last, aA.w); vT = vec4(h, sink, wood, ev);
    vP = vec2(position.x*2.0*span, side.x);
  } else if (aA.x < 1.5){
    // spray thrown up as the beam breaks through, falling back under gravity
    vec3 p = vec3(xz.x, swellH(xz) + 0.05, xz.y) + aB.xyz*age + vec3(0.0, -4.9*age*age, 0.0);
    if (p.y < swellH(p.xz) - 0.1) return;
    float sd = fract(aB.w + vary), size = mix(0.05, 0.12, fract(sd*7.31))*mix(1.0, 1.7, uToon);
    // at least a pixel and a half across, and fainter by as much as it was enlarged (by its area), as the drips: a card
    // under a pixel can fall between pixels and blink
    float big = max(0.75*length(p - cameraPosition)/uPx/size, 1.0);
    size *= big;
    w = p + (right*position.x + up*position.y)*size*2.4;
    vK = vec4(1.0, smoothstep(0.0, 0.05, age)*(1.0 - smoothstep(0.9, 1.7, age))/(big*big), sd, 0.0);   // in over three frames
    vX = vec4(size); vP = position.xy*size*2.4;
  } else if (aA.x > 2.5){
    // a splash plume at the water line: up for half its life, back down for the rest, standing upright toward the camera
    float T = ev < 0.5 ? 0.95 : 0.75, ph = clamp(age/T, 0.0, 1.0), hgt = aB.y*sin(3.14159*ph)*(0.55 + 0.45*clamp(ph*2.5, 0.0, 1.0));
    if (age > T*1.15) return;
    float H = aB.y*1.7;
    w = vec3(xz.x, swellH(xz) - 0.1, xz.y) + side*position.x*aB.x + vec3(0.0, (position.y + 0.5)*H, 0.0);
    // in over five frames: its skirt and drops are already full size as the beam breaks through, and came in at once
    vK = vec4(3.0, smoothstep(0.0, 0.08, age)*(1.0 - smoothstep(0.85, 1.15, age/T)), fract(aB.z + vary), ph);
    vX = vec4(aB.x, H, hgt, 0.0); vP = vec2(position.x*aB.x, (position.y + 0.5)*H - 0.1);
  } else {
    // A drip point (DRIPS in src/rise.ts). With s the seconds since it began to drip, N(s) of its n drops have left: the
    // rate falls as (s + s0)^(-3/2), as for water draining off a surface (Jeffreys), so drop k leaves at release(k) and
    // where every drop is follows from s alone. Each drop hangs under the beam and swells, then falls from where it hung
    // into the sea and leaves a ring there. In 二次元 the drops leave and change shape on twos; they fall smoothly.
    float s = age - aC.y - 0.25*(fract(aB.w + vary) - 0.5), n = aB.x, s0 = aB.y;
    if (s < 0.0) return;
    float sq = mix(s, floor(s*12.0)/12.0, uToon), N = n*(1.0 - sqrt(s0/(sq + s0))), k = floor(N);
    // the point's height now (plain wood gates have a straight top beam, torii_shape.glsl)
    float yg = aC.x - (wood > 0.5 && aC.x > 0.886 ? 0.075*pow(min(abs(aA.z)/(9.50*0.64), 1.0), 2.4) : 0.0);
    float y0 = yg*h - (1.0 - r)*h*1.10, sea = swellH(xz), R = mix(0.05, 0.06, uToon), fade = 1.0 - smoothstep(40.0, 60.0, s);
    if (y0 < sea + 0.2) return;
    // at least 1.5 px across on screen, and fainter by as much as it was enlarged, so a distant drop does not sparkle
    float pw = length(vec3(xz.x, y0, xz.y) - cameraPosition)/uPx, big = max(0.75*pw/R, 1.0);
    R *= big; fade /= big*big;
    float m = max(0.3*R, 1.5*pw);   // room round the shape for its one-pixel edge
    if (aB.z < 0.0){
      // hanging: it swells as N creeps up to the next whole drop (radius as the cube root of its volume); water lets go
      // in a few thousandths of a second, so only in the last tenth does it draw out a short neck (a long, slow neck read
      // as syrup); once a drop has gone, what is left (0.4 of it) springs back for a moment
      float g = N - k, since = k > 0.5 ? sq - release(k, n, s0) : 1e3;
      float rb = R*max(pow(g, 1.0/3.0), k > 0.5 ? 0.4 : 0.0)*(1.0 + 0.25*exp(-since/0.05)*cos(since*60.0));
      if (rb < 0.004) return;
      float neck = smoothstep(0.9, 1.0, g), nl = rb*(0.15 + 0.6*neck), y = mix(-nl - 2.0*rb - m, 0.03, position.y + 0.5);
      w = vec3(xz.x, y0 + y, xz.y) + side*position.x*2.0*(rb + m);
      vK = vec4(5.0, fade, fract(aB.w + vary), 0.0);
      vX = vec4(rb, nl, rb*mix(0.8, 0.4, neck), 0.0); vP = vec2(position.x*2.0*(rb + m), y);
    } else {
      // falling: DROPS instances take the drops in turn, this one every DROPS-th; src/rise.ts spaces the schedule so it
      // is never needed again before its last drop has landed and the ring faded
      float kk = k - mod(k - aB.z, float(DROPS));
      if (kk < 1.0) return;
      float fall = s - release(kk, n, s0), yc = y0 - 2.5*R, hit = sqrt(max(yc - sea, 0.0)/(0.5*G));   // 2.5 R: where it hung
      if (fall < hit){
        // round: a falling drop of water is, and a tail made the drops read as long and sticky; in 写实 the frame's
        // exposure (1/60 s) draws it out a little as it speeds up, at most to one and a half times its width
        float v = G*fall, L = uToon > 0.5 ? 2.0*R : min(2.0*R + v/60.0, 3.0*R), y = mix(-m, L + m, position.y + 0.5);
        w = vec3(xz.x, yc - 0.5*G*fall*fall - R + y, xz.y) + side*position.x*2.0*(R + m);
        vK = vec4(2.0, fade, fract(aB.w + vary), 0.0);
        vX = vec4(R, L, 0.0, 0.0); vP = vec2(position.x*2.0*(R + m), y);
      } else {
        // where it struck the sea, a small ring spreads to half a unit and fades in 0.6 s (the ripple texture's
        // quarter-unit texels cannot hold one); flat on the swell
        float t = mix(fall - hit, floor((fall - hit)*12.0)/12.0, uToon), e = 1.0 - t/0.6;
        if (e <= 0.0) return;
        w = vec3(xz.x + position.x*1.3, 0.0, xz.y + position.y*1.3); w.y = swellH(w.xz) + 0.03;
        vK = vec4(4.0, fade*e*e, 0.0, 0.0);
        vX = vec4(mix(0.08, 0.5, 1.0 - e*e), 0.03, 0.0, 0.0); vP = position.xy*1.3;
      }
    }
  }
  vW = w; vK.y *= keep;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
}
