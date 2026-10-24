#include <voyage/swell>
attribute float aGlow; attribute vec2 aSail; attribute vec4 aOff; attribute vec4 aInfo; attribute vec2 aDyn; attribute vec3 aLanPos; attribute vec3 aOutN;
attribute vec3 aFar; attribute float aLod;
uniform float uDay; uniform float uMirror; uniform float uToon; uniform float uPx; uniform vec2 uLod;
varying vec3 vC; varying float vGlow; varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec3 vLan3; varying float vLan; varying float vFade; varying float vWeather; varying float vFlick; varying float vHue;
varying vec2 vSail; varying vec3 vNm; varying float vKind; varying float vK; varying float vLodK;
void main(){
  float sc = aOff.w; float kind = aInfo.w; vHue = aInfo.y; vSail = aSail; vNm = normal; vKind = kind;
  vec2 g = swellG(aOff.xy);
  float h = swellH(aOff.xy);
  // the detail a ship this small on screen still shows (src/fleet.ts): parts only the detailed model has shrink to
  // where they stand on the far model (aFar), and lights among them dim with them; at uLod.x the ship is the far model
  float k = smoothstep(uLod.x, uLod.y, uPx*sc/max(length(vec3(aOff.x, h, aOff.y) - cameraPosition), 0.1));
  vec3 p = mix(aFar, position, k);
  vK = mix(1.0, k, step(1e-6, distance(aFar, position)));
  vLodK = kind < 1.5 ? k : 1.0;   // 舰长 and 无名之舰, the kinds with a far model
  vec3 lp = p*sc;
  float c = cos(aOff.z), s = sin(aOff.z);
  vec3 rp = vec3(lp.x*c + lp.z*s, lp.y, -lp.x*s + lp.z*c);
  vec3 w = vec3(aOff.x + rp.x, h + rp.y + dot(rp.xz, g), aOff.y + rp.z);
  vW = w; vL = p; vC = color; vGlow = aGlow; vLan3 = aLanPos; vFade = aDyn.y; vLan = aInfo.z*aDyn.x;
  // 二次元 shades faces by vNm, so there vN carries the smooth normal for the edge light (one varying fewer across the whole fleet)
  vec3 nn = uToon > 0.5 ? aOutN : normal;
  vN = vec3(nn.x*c + nn.z*s, nn.y, -nn.x*s + nn.z*c);
  float named = (kind < 0.5 || kind > 2.5) ? 1.0 : 0.0;
  vWeather = named*clamp((uDay - aInfo.x)/900.0, 0.0, 1.0);
  // candle flicker; anime lanterns burn steadier, so the cel style keeps only a breath of it
  float fa = mix(0.14, 0.05, uToon);
  vFlick = 1.0 - fa + fa*sin(uTime*6.3 + aInfo.y*61.0)*sin(uTime*11.1 + aInfo.y*23.0);
  w.y *= uMirror;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  // a ship the list draws in its detailed model is skipped here (aLod), as is one away or faded out
  if (sc <= 0.0 || aDyn.y <= 0.0 || aLod > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
