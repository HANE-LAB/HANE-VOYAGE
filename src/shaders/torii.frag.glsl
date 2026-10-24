#include <voyage/torii>
#include <voyage/hatch>
varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vY; varying float vS; varying float vFade; varying float vSnow; varying vec3 vOn; varying vec3 vP;
uniform float uCastSat; uniform vec3 uRimC;
#if RISING
#include <voyage/rise_age>
varying float vOut;   // the seconds since this height came out of the sea (torii.vert.glsl)
// an integer hash (PCG, after Jarzynski and Olano 2020) of a whole number, in [0, 1)
float hashT(float n){ uint s = uint(int(n) + 4096)*747796405u + 2891336453u, w = ((s >> ((s >> 28u) + 4u)) ^ s)*277803737u; return float(((w >> 22u) ^ w) >> 8u)/16777216.0; }
#endif
void main(){
  nearFade(vW);
  vec3 v = normalize(cameraPosition - vW);
  vec3 col;
  if (uToon < 0.5) col = vC*toriiLight(normalize(gl_FrontFacing ? vN : -vN), v, vY, vS, vW);
  else if (vSnow > 0.5) col = snowToon(normalize(vN), vS, vW);
  else col = toriiToon(vC, normalize(vN), v, vY, vS, vW);   // faces are built outward, so the reflection pass shades the same
  // edge light on the shaded sides (as on the ships, see ship.frag.glsl), not on snow, above the water and out of the reflection.
  // The beams and posts are boxes: a whole side seen edge-on would light up, so the light only shows where the smooth
  // normal turns further from the view than the face does, which is the strip along the silhouette edge. It fades out on
  // gates small on screen, where the term changes fast from pixel to pixel.
  vec3 n = normalize(vN);
  float e = abs(dot(n, v)) - abs(dot(normalize(vOn), v)), ew = fwidth(e) + 0.01, big = 1.0 - smoothstep(0.08, 0.16, ew);
  float shade = (1.0 - smoothstep(0.02, 0.10, toriiKey(n)))*(1.0 - smoothstep(0.45, 0.60, n.y))*(1.0 - vSnow);
  if (uToon > 0.5){
    // hatching on the shaded sides and undersides, in gate units (9.5 per unit of the shape); cross-hatched where the key is fully
    // behind; fades to flat on gates under about 40 px (fwidth is in gate units per pixel)
    vec2 hp = hatchPatch(vP, n)*9.5;
    float hm = shade*(1.0 - smoothstep(0.18, 0.36, length(fwidth(hp))));
    col *= 1.0 - 0.42*hm*hatch(hp, 1.0 - smoothstep(-0.30, -0.10, toriiKey(n)));
  }
  if (uToon > 0.5) col = mix(col, uRimC, smoothstep(0.32 - ew, 0.32 + ew, e)*shade*big*0.8*step(0.0, vY)*step(0.0, uMirror));
  if (uToon > 0.5) col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, uCastSat), 0.0);   // the gates keep their colour against the faded night
#if RISING
  // A gate that has just come out of the sea is wet. src/rise.ts follows the newest two gates and compiles this in only
  // then; a gate is known by its S, which is minus its z. Each height dries from the moment it came out (outAge, per vertex), and
  // the lower it is the longer its film takes to drain (Jeffreys: the time to thin to a given depth grows with the
  // distance from the top); the swell keeps wetting the feet. So the top dries first and the feet last, and the gloss
  // goes before the darkening. Lacquer takes up no water: it darkens a little and shines with a cool sheen (a fixed
  // colour, under the bloom threshold), strongest on the faces turned up to the sky. Plain wood (and straw, paper and
  // snow, the colours with green above 0.2) soaks it up: darker, hardly shining. The older gate's wet look fades out with
  // it before it leaves the slots, and every gate's is gone before this code is compiled out (src/rise.ts: when every
  // beam has been out 12 s), so nothing dries in one frame.
  bool g0 = abs(vS + uRiseA[0].y) < 0.5, g1 = !g0 && abs(vS + uRiseA[1].y) < 0.5;
  vec4 B = g0 ? uRiseB[0] : uRiseB[1];
  float keep = (g1 ? 1.0 - clamp(uRiseB[1].w, 0.0, 1.0) : 1.0)*(B.z < 0.0 ? 1.0 : 1.0 - smoothstep(9.0, 11.0, B.z));
  if ((g0 || g1) && keep > 0.0){   // nothing to do on a gate that has dried
    float wood = step(0.2, vC.g);
    float age = vOut, d = clamp(0.92 - vY, 0.0, 1.0) + 0.5*(1.0 - smoothstep(0.05, 0.15, vY));
    float gloss = 1.0 - smoothstep(0.5 + 2.0*d, 2.5 + 4.0*d, age), dark = 1.0 - smoothstep(1.5 + 3.0*d, 4.5 + 4.0*d, age);
    float trail = 0.0;
    // Water running down the main posts from the joint under the top beam, three runs to a face (the posts taper from 0.40
    // at the foot to 0.375 at the top, half width 0.040 to 0.033; src/torii.ts). Each run is a straight wet track, widest
    // where it leaves the joint and narrowing to a soft front that goes down in fits and starts (its speed swings between
    // 0.2 and 1.8 times the mean); it is dark and glossy like the rest of the wet wood and dries from the top over 3 s.
    // No bead of light at the front and no wandering: a round bright head on a wavy line read as something alive
    // (2026-10-23). Where a track would be under a pixel wide, none is drawn.
    float px = abs(vP.x), f = clamp((vY + 0.06)/0.93, 0.0, 1.0), cx = mix(0.40, 0.375, f), hx = mix(0.040, 0.033, f);
    if (B.x > 0.0 && vY > -0.06 && vY < 0.84 && abs(px - cx) < hx + 0.002 && abs(vP.z) < hx + 0.002 && max(abs(n.x), abs(n.z)) > 0.9){
      bool fb = abs(n.z) > 0.9;   // the front or back, or a side
      float s = clamp(fb ? (px - cx)/hx : vP.z/hx, -1.0, 1.0), c = min(floor((s + 1.0)*1.5), 2.0);
      float id = c + 3.0*(fb ? step(n.z, 0.0) : 2.0 + step(n.x*vP.x, 0.0)) + 12.0*step(0.0, vP.x);
      float h1 = hashT(id), h2 = hashT(id + 31.0), h3 = hashT(id + 57.0), h4 = hashT(id + 83.0);
      float tt = B.x - 0.4 - 1.2*h1;   // seconds since it set off
      if (tt > 0.0){
        float sp = 0.09 + 0.05*h2, om = 6.28/(1.0 + 0.8*h3), ph = 6.28*h4;
        float yh = 0.84 - sp*tt - 0.8*sp/om*(sin(om*tt + ph) - sin(ph));   // the front
        float w = mix(0.0055, 0.003, clamp((0.84 - vY)/max(0.84 - yh, 1e-3), 0.0, 1.0));   // half width, narrowing to the front
        float dx = abs(s - ((c + 0.5)/1.5 - 1.0 + 0.3*(h2 - 0.5)))*hx;   // from its line
        float aa = fwidth(dx) + 1e-5, big = smoothstep(0.5, 1.0, 0.004/aa);
        trail = big*smoothstep(yh - 0.005, yh + 0.025, vY)*exp(-max(tt - (0.84 - vY)/sp, 0.0)/3.0)*(1.0 - smoothstep(w - aa, w + aa, dx));
      }
    }
    col *= mix(1.0, mix(0.86, 0.62, wood), max(dark, trail)*keep);
    col = mix(col, vec3(0.36, 0.40, 0.50), keep*max(gloss*mix(0.30, 0.10, wood)*(0.35 + 0.65*smoothstep(0.45, 0.6, n.y)), 0.3*trail));
  }
#endif
  col *= mix(0.4, 1.0, smoothstep(0.0, 0.07, vY));
  float f = max(fogF(length(vW - cameraPosition), uFogDensity), 1.0 - vFade);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
}
