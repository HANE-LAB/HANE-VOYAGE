#include <voyage/fog>
attribute vec4 aSeed; attribute float aSlot;
uniform float uTime; uniform float uTravel; uniform vec4 uSeason; uniform float uMirror; uniform float uPx; uniform float uPR; uniform float uFogDensity; uniform vec3 uFogColor;
varying vec4 vCol; varying float vRot; varying float vTilt; varying float vKind;
const float TAU = 6.2831853;
const vec3 BOX = vec3(64.0, 36.0, 64.0);
// The weather of the day being shown, around the camera: slot 0 spring petals, 1 summer fireflies, 2 autumn leaves,
// 3 winter snow, each as strong as its season's weight (src/seasons.ts). Flakes are anchored in the world and go by with
// the sea; the box wraps around the camera and they thin out toward its faces, so none pops in or out.
void main(){
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); vRot = 0.0; vTilt = 1.0; vKind = aSlot;
  float wgt = aSlot < 0.5 ? uSeason.x : aSlot < 1.5 ? uSeason.y : aSlot < 2.5 ? uSeason.z : uSeason.w;
  if (wgt <= 0.0 || uMirror < 0.0) return;
  vec4 s = aSeed; float t = uTime;
  vec3 p = (s.xyz - 0.5)*BOX, col; float size, a = 1.0;
  if (aSlot > 0.5 && aSlot < 1.5){
    p.y = mix(0.6, 5.5, s.y);
    p += vec3(1.4*sin(t*0.23 + s.w*TAU), 0.45*sin(t*0.19 + s.x*TAU), 1.4*cos(t*0.21 + s.z*TAU));
    size = 0.13; a = 0.55 + 0.45*sin(t*1.1 + s.w*TAU); col = vec3(0.62, 0.95, 0.30);
  } else {
    float fall = aSlot < 0.5 ? 0.55 : aSlot < 2.5 ? 0.85 : 0.7;
    p.y -= fall*t; p.x += (aSlot > 2.5 ? 0.2 : 0.7)*t;   // a light wind across her course
    p.x += 0.7*sin(t*0.7 + s.w*TAU); p.z += 0.6*cos(t*0.6 + s.y*TAU);
    vRot = t*(0.8 + s.w) + s.z*TAU; vTilt = 0.35 + 0.65*abs(cos(t*(0.9 + 0.8*s.y) + s.x*TAU));
    // night colours, under the bloom threshold
    if (aSlot < 0.5){ size = 0.12; col = mix(vec3(0.55, 0.28, 0.38), vec3(0.58, 0.40, 0.46), s.w); }
    else if (aSlot < 2.5){ size = 0.16; col = mix(vec3(0.52, 0.16, 0.07), vec3(0.58, 0.42, 0.10), s.w); }
    else { size = 0.085; col = vec3(0.44, 0.47, 0.56); }
  }
  p.z -= uTravel;   // the air goes by with the sea
  vec3 rel = mod(p - cameraPosition + BOX*0.5, BOX) - BOX*0.5;
  if (aSlot > 0.5 && aSlot < 1.5) rel.y = p.y - cameraPosition.y;   // fireflies keep to their height over the water
  vec3 w = cameraPosition + rel, e = abs(rel)/(BOX*0.5);
  a *= wgt*(1.0 - smoothstep(0.7, 1.0, max(e.x, max(e.y, e.z))))*smoothstep(-0.3, 0.6, w.y);
  vec4 mv = viewMatrix*vec4(w, 1.0); float d = max(-mv.z, 0.1);
  gl_Position = projectionMatrix*mv;
  // never smaller than 1.6 px: below that the sprite keeps its size and dims with its area, so it fades instead of crawling
  float px = size*uPx/d, pmin = 1.6*uPR;
  a *= min(1.0, (px/pmin)*(px/pmin))*smoothstep(3.0, 9.0, d);   // and none comes so close it fills the frame
  float f = fogF(d, uFogDensity);
  vCol = vec4(mix(col, uFogColor, f), a*(1.0 - f));
  gl_PointSize = a > 0.003 ? min(max(px, pmin)*(aSlot > 0.5 && aSlot < 1.5 ? 3.0 : 1.0), 32.0*uPR) : 0.0;
}
