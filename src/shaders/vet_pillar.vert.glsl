#include <voyage/swell>
#include <voyage/fog>
// 漁火光柱: a pillar of light standing over a 老船长's masthead, like the light pillars over fishing lights on a cold
// night. aLvl is the tier eased by the clock (veterans.ts): 满月 1, 半年 2, a year 3, one more for each year after. The
// pillar is a strip turned about the vertical to face the camera; it stays at least two pixels wide, dimmed by as much
// as it was widened, so far pillars never break up into pixels.
attribute vec2 aUV; attribute vec4 aOff; attribute vec2 aDyn; attribute vec3 aTop; attribute float aLvl;
uniform float uMirror; uniform float uPx; uniform float uPR; uniform float uFogDensity;
varying vec2 vUV; varying float vLvl; varying float vA; varying float vH; varying float vRingW; varying float vSeed;
void main(){
  // world units, the same for every rank: 1.4, 2.6 and 4.0, then 0.9 more each year; it grows up from the masthead
  float H = aLvl < 1.0 ? 1.4*aLvl : (aLvl < 2.0 ? mix(1.4, 2.6, aLvl - 1.0) : (aLvl < 3.0 ? mix(2.6, 4.0, aLvl - 2.0) : 4.0 + 0.9*(aLvl - 3.0)));
  float sc = aOff.w, c = cos(aOff.z), s = sin(aOff.z);
  vec3 lp = aTop*sc;
  vec3 rp = vec3(lp.x*c + lp.z*s, lp.y, -lp.x*s + lp.z*c);
  vec2 g = swellG(aOff.xy);
  vec3 b = vec3(aOff.x + rp.x, swellH(aOff.xy) + rp.y + dot(rp.xz, g), aOff.y + rp.z);
  vec3 toC = cameraPosition - b; float d = max(length(toC), 0.1);
  float W = 0.20, k = max(1.0, 2.0*uPR*d/(uPx*W));
  vec3 w = b + normalize(vec3(toC.z, 0.0, -toC.x) + vec3(1e-5, 0.0, 0.0))*aUV.x*W*k + vec3(0.0, aUV.y*H, 0.0);
  w.y *= uMirror;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  vUV = vec2(aUV.x*k, aUV.y); vLvl = aLvl; vH = H; vSeed = fract(aOff.y*0.37 + aOff.x*0.11);
  vRingW = max(0.07, 1.2*d/uPx);   // a ring's half height in world units: at least about a pixel
  vA = aDyn.x*aDyn.y*(1.0 - 0.6*fogF(d, uFogDensity))/k*smoothstep(0.0, 0.6, aLvl);
  if (sc <= 0.0 || aDyn.y <= 0.0 || aLvl < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
