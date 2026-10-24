#include <voyage/fog>
attribute vec4 aCol; attribute float aSize; uniform float uPx; uniform float uPR; uniform float uMirror; uniform float uFogDensity; varying vec4 vC;
void main(){ vec3 w = position; w.y *= uMirror; vec4 mv = viewMatrix*vec4(w, 1.0); gl_Position = projectionMatrix*mv; float d = max(-mv.z, 0.1);
  vC = vec4(aCol.rgb, aCol.a*(1.0 - 0.5*fogF(d, uFogDensity))); gl_PointSize = aCol.a > 0.001 ? max(1.5*uPR, uPx*aSize/d) : 0.0; }
