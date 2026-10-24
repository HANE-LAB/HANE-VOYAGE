// The sea's small waves on one WL x WL tile (src/water.ts): NW Gerstner waves, read back at fixed points of the surface.
// uWA: wavevector, height amplitude, phase; uWB: Q x amplitude along the wave's direction, angular speed.
// Gerstner waves move the water sideways toward each crest, which sharpens it. A texel is a fixed place on the surface,
// so the surface point that ends up there is found first (one fixed-point step is enough at this steepness), then its
// slope through the Jacobian. Out: slope x, slope z, height, slope squared (mipmaps keep its mean, so the sea can tell
// how much slope the averaging lost).
uniform float uTime; uniform vec4 uWA[NW]; uniform vec4 uWB[NW]; varying vec2 vUv;
void main(){
  vec2 x = vUv*WL, d = vec2(0.0);
  for (int i = 0; i < NW; i++) d += uWB[i].xy*cos(dot(uWA[i].xy, x) - uWB[i].z*uTime + uWA[i].w);
  vec2 p = x - d;
  float h = 0.0; vec2 g = vec2(0.0); vec3 j = vec3(0.0);   // j: the symmetric 2x2 Jacobian's xx, zz, xz less one
  for (int i = 0; i < NW; i++){
    float th = dot(uWA[i].xy, p) - uWB[i].z*uTime + uWA[i].w, s = sin(th), c = cos(th);
    h += uWA[i].z*s; g += uWA[i].xy*uWA[i].z*c;
    vec2 q = uWB[i].xy*s; j -= vec3(q.x*uWA[i].x, q.y*uWA[i].y, q.x*uWA[i].y);
  }
  // no crest folds over (Q in src/water.ts), so the Jacobian stays invertible
  vec2 sl = inverse(mat2(1.0 + j.x, j.z, j.z, 1.0 + j.y))*g;
  gl_FragColor = vec4(sl, h, dot(sl, sl));
}
