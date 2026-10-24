attribute vec4 aT; attribute vec4 aDeco; uniform float uMirror; uniform vec2 uWin; uniform float uPx;
varying vec2 vUv; varying vec3 vW; varying float vS; varying float vFade; varying float vSize;
void main(){
  // position is in world units around the middle of the top beam, which stands at 0.943 of the gate's height
  float rise = smoothstep(-12.0, -5.5, aT.w);
  vec3 w = vec3(aT.x + position.x, 0.943*aT.z + position.y - (1.0 - rise)*aT.z*1.10, aT.y + position.z);
  vW = w; vUv = uv; vS = aT.w;
  vFade = 1.0 - smoothstep(uWin.y - 50.0, uWin.y, aT.w);
  // a feather is about a third of its gate: it thins out while the gate shrinks from 36 to 18 px, before its barbs crawl
  vSize = smoothstep(18.0, 36.0, uPx*aT.z/max(length(w - cameraPosition), 0.1));
  w.y *= uMirror;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  if (aDeco.x < 1.5 || vFade <= 0.0 || rise <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
