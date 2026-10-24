// the ring on the water round the picked ship (src/names.ts), facing up; uR is its radius
uniform vec3 uP; uniform float uR; uniform float uMirror;
varying vec2 vQ;
void main(){
  vQ = position.xy;
  gl_Position = projectionMatrix*viewMatrix*vec4(uP + vec3(position.x, 0.0, -position.y)*uR*1.6, 1.0);
  if (uMirror < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // not in the reflection
}
