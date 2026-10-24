#include <voyage/swell>
#include <voyage/fog>
attribute vec4 aOff; attribute vec4 aInfo; attribute vec2 aDyn; attribute vec3 aLanPos; uniform float uPx; uniform float uPR; uniform float uFogDensity; uniform float uMirror;
varying float vA; varying vec3 vCol;
void main(){
  float kind = aInfo.w; float sc = aOff.w;
  vec3 lp = aLanPos*sc;
  float c = cos(aOff.z), s = sin(aOff.z);
  vec3 rp = vec3(lp.x*c + lp.z*s, lp.y, -lp.x*s + lp.z*c);
  vec2 g = swellG(aOff.xy);
  vec3 w = vec3(aOff.x + rp.x, swellH(aOff.xy) + rp.y + dot(rp.xz, g), aOff.y + rp.z);
  w.y *= uMirror;
  vec4 mv = viewMatrix*vec4(w, 1.0);
  gl_Position = projectionMatrix*mv;
  float flick = 0.84 + 0.16*sin(uTime*7.1 + aInfo.y*53.0)*sin(uTime*12.7 + aInfo.y*19.0);
  float lan = aInfo.z*aDyn.x*aDyn.y*flick;
  float d = max(-mv.z, 0.1);
  vec3 col = vec3(1.0, 0.60, 0.26); float r = 0.12;
  if (kind > 0.5 && kind < 1.5){ col = vec3(0.50, 0.66, 1.0); r = 0.085; }
  else if (kind > 1.5 && kind < 2.5){ col = vec3(1.0, 0.52, 0.20); r = 0.10; }
  else if (kind > 2.5 && kind < 3.5){ col = vec3(1.0, 0.44, 0.18); r = 0.13; }
  else if (kind > 3.5){ col = vec3(1.0, 0.80, 0.50); r = 0.14; }
  float px = uPx*r*sc*2.0/d;
  float minPx = ((kind > 0.5 && kind < 1.5) ? 1.4 : 1.8)*uPR;
  vA = lan*(1.0 - 0.5*fogF(d, uFogDensity))*clamp(px/minPx, 0.45, 1.0)*2.4;
  vCol = col;
  gl_PointSize = (sc <= 0.0 || lan <= 0.002) ? 0.0 : max(minPx, px);
}
