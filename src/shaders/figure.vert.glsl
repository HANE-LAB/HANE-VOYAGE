// Her and Kobuta (src/figures.ts): skinned, then shaded in world space. LINE draws the ink outline: the same skin pushed
// out along its normals by uLineW screen pixels, back faces only, as the ships' outline.vert.glsl does.
#include <skinning_pars_vertex>
uniform mat3 uMapT; uniform mat4 uRest; uniform vec2 uHgt;
#ifdef LINE
uniform float uPx; uniform float uLineW; uniform float uToon; uniform float uSize;
#endif
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vB; varying float vHgt;
void main(){
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  // the rest pose (src/figures.ts), for what must stay put on the body while it moves: the costume change's edge
  vec4 bp = uRest*vec4(position, 1.0);
  vB = bp.xyz; vHgt = (bp.y - uHgt.x)*uHgt.y;
  vUv = (uMapT*vec3(uv, 1.0)).xy;
  vec3 w = (modelMatrix*vec4(transformed, 1.0)).xyz, n = normalize(mat3(modelMatrix)*objectNormal);
  #ifdef LINE
  // only on a figure big enough on screen, thinning before it goes
  float d = max(length(w - cameraPosition), 0.1), k = uToon*smoothstep(26.0, 50.0, uPx*uSize/d);
  w += (n + normalize(w - cameraPosition)*1.5)*uLineW*d/uPx*k;
  #endif
  vW = w; vN = n;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
  #ifdef LINE
  if (k <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #endif
}
