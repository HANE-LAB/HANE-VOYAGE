attribute vec4 aT; attribute vec2 aCell; uniform float uMirror; uniform vec2 uWin;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vS; varying float vFade;
void main(){
  vec3 pos = position;
  #include <voyage/torii_place>
  vW = w; vN = normal; vS = aT.w; vUv = aCell + uv*vec2(0.06250, 0.12500);   // one atlas cell, 1/ACOLS by 1/AROWS in src/torii.ts
  vFade = 1.0 - smoothstep(uWin.y - 50.0, uWin.y, aT.w);
  w.y *= uMirror;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (vFade <= 0.0 || rise <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
