#include <voyage/torii_shape>
attribute vec3 aOutN; uniform float uMirror; uniform vec2 uWin; uniform float uToon; uniform float uLineW;
varying vec3 vW; varying float vFade; varying vec3 vLine;
void main(){
  vec3 pos = toriiShape(position);
  #include <voyage/torii_place>
  float d = max(length(w - cameraPosition), 0.1);
  float k = uToon*smoothstep(50.0, 110.0, uPx*aT.z/d);
  w += (aOutN + normalize(w - cameraPosition)*1.5)*(uLineW*1.05*d/uPx)*k;
  vW = w; vFade = 1.0 - smoothstep(uWin.y - 50.0, uWin.y, aT.w);
  // the line takes a dark shade of what it outlines: vermilion, wood, snow or straw
  vLine = aPart > 2.5 ? vec3(0.070, 0.045, 0.016) : aPart > 1.5 ? vec3(0.050, 0.058, 0.100) : aDeco.x < 0.5 ? vec3(0.070, 0.040, 0.024) : vec3(0.085, 0.016, 0.022);
  w.y *= uMirror;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (k <= 0.001 || vFade <= 0.0 || rise <= 0.0 || !toriiWears()) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
