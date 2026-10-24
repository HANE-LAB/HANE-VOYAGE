#include <voyage/torii_shape>
attribute vec3 aOutN; uniform float uMirror; uniform vec2 uWin;
varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vY; varying float vS; varying float vFade; varying float vSnow; varying vec3 vOn; varying vec3 vP;
#if RISING
#include <voyage/rise_age>
varying float vOut;
#endif
void main(){
  vec3 pos = toriiShape(position);
  #include <voyage/torii_place>
  vOn = aOutN; vP = pos;   // smooth normal for the edge light; shape-unit position for the hatching
  vW = w; vC = toriiColor(color); vN = normal; vY = pos.y; vS = aT.w; vSnow = aPart > 1.5 && abs(aPart - 3.0) > 0.5 ? 1.0 : 0.0;   // snow and icicles
  vFade = 1.0 - smoothstep(uWin.y - 50.0, uWin.y, aT.w);
#if RISING
  // the seconds since this height came out of the sea, for the wet look (torii.frag.glsl): straight between the
  // vertices, close enough to the bends at the beams, and cheaper here than for every pixel of the two nearest gates
  bool g0 = abs(aT.w + uRiseA[0].y) < 0.5;
  vOut = g0 || abs(aT.w + uRiseA[1].y) < 0.5 ? outAge(pos.y, g0 ? uRiseA[0].w : uRiseA[1].w, g0 ? uRiseB[0] : uRiseB[1], g0 ? uRiseC.x : uRiseC.y) : 1e3;
#endif
  w.y *= uMirror;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (vFade <= 0.0 || rise <= 0.0 || !toriiWears()) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
