#include <voyage/swell>
attribute vec3 aOutN; attribute vec4 aOff; attribute vec4 aInfo; attribute vec2 aDyn; attribute vec3 aFar;
uniform float uPx; uniform float uToon; uniform float uLineW; uniform float uMirror; uniform vec2 uLod;
varying float vFade; varying vec3 vW;
void main(){
  float sc = aOff.w;
  float c = cos(aOff.z), s = sin(aOff.z);
  float h = swellH(aOff.xy);
  // the same shrinking detail as the ship itself (ship.vert.glsl)
  float k = smoothstep(uLod.x, uLod.y, uPx*sc/max(length(vec3(aOff.x, h, aOff.y) - cameraPosition), 0.1));
  vec3 lp = mix(aFar, position, k)*sc;
  vec3 rp = vec3(lp.x*c + lp.z*s, lp.y, -lp.x*s + lp.z*c);
  vec2 g = swellG(aOff.xy);
  vec3 w = vec3(aOff.x + rp.x, h + rp.y + dot(rp.xz, g), aOff.y + rp.z);
  vec3 on = vec3(aOutN.x*c + aOutN.z*s, aOutN.y, -aOutN.x*s + aOutN.z*c);
  float d = max(length(w - cameraPosition), 0.1);
  float kl = uToon*smoothstep(26.0, 50.0, uPx*sc/d);
  float lw = uLineW*d/uPx;
  w += (on + normalize(w - cameraPosition)*1.5)*lw*kl;
  vW = w; vFade = aDyn.y;
  w.y *= uMirror;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (kl <= 0.001 || sc <= 0.0 || aDyn.y <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
