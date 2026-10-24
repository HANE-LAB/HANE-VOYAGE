#include <voyage/swell>
attribute vec2 aUV; attribute vec4 aOff; attribute vec4 aInfo; attribute vec2 aDyn; uniform float uDay;
varying vec2 vUV; varying float vS; varying vec3 vW;
void main(){
  float kind = aInfo.w; float sc = aOff.w;
  bool anon = kind > 0.5 && kind < 1.5;
  float ten = (kind > 1.5 && kind < 2.5) ? uDay : max(uDay - aInfo.x, 0.0);
  float L = anon ? 0.8 : 1.0 + 9.0*sqrt(clamp(ten/1800.0, 0.0, 1.0));
  float u = aUV.x, v = aUV.y;
  vec3 lp = vec3(u*mix(0.10, 0.60, v), 0.0, -0.40 - v*L)*sc;
  float c = cos(aOff.z), s = sin(aOff.z);
  vec2 xz = aOff.xy + vec2(lp.x*c + lp.z*s, -lp.x*s + lp.z*c);
  vec3 w = vec3(xz.x, swellH(xz) + 0.04, xz.y);
  vW = w; vUV = aUV;
  vS = aDyn.y*(anon ? 0.4 : ((kind > 1.5 && kind < 2.5) ? 1.6 : 1.0));
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (sc <= 0.0 || aDyn.y <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
