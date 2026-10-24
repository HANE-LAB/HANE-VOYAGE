// a name carved on a gate's post (src/inscriptions.ts): one column of text on the post's face toward the 回望 camera
attribute vec4 aT; attribute vec4 aAt; attribute vec4 aUV; attribute vec3 aDim;
uniform float uMirror; uniform vec2 uWin; uniform float uPx;
varying vec2 vUv; varying vec3 vW; varying float vA; varying float vGold; varying float vWood;
void main(){
  // the column's middle on the face, in gate units; aAt.w is ±1 on the main posts (the side) and 0 on the legs
  vec3 pos = aAt.xyz;
  #include <voyage/torii_place>
  // The main posts lean in and their faces slope back as they rise (src/torii.ts: x 0.40 to 0.375, half depth 0.040 to
  // 0.033 over 0.93 of the height), so the column follows the face; the legs stand straight. aDim is the column's width
  // and height in world units, and its alpha (how far it has come in) plus 2 if it is gilded and 4 on a plain wood gate.
  vec3 ay = normalize(vec3(-0.025*aAt.w*9.50, 0.93*aT.z, -0.007*abs(aAt.w)*9.50));
  w += vec3(1.0, 0.0, 0.0)*(position.x - 0.5)*aDim.x + ay*(position.y - 0.5)*aDim.y;
  vW = w; vUv = mix(aUV.xy, aUV.zw, position.xy);
  vGold = step(2.0, mod(aDim.z, 4.0)); vWood = step(4.0, aDim.z);
  // characters (as tall as the column is wide) fade out while they shrink from 7 to 4 px on screen, before they would
  // shimmer, and with their gate at the far end of the voyage
  float px = uPx*aDim.x/max(length(w - cameraPosition), 0.1);
  vA = mod(aDim.z, 2.0)*smoothstep(4.0, 7.0, px)*(1.0 - smoothstep(uWin.y - 50.0, uWin.y, aT.w));
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  // not in the reflection: there it would be a few pixels that only shimmer
  if (vA <= 0.0 || rise <= 0.0 || uMirror < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
