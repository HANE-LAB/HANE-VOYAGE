#include <voyage/torii>
uniform sampler2D tFeather; varying vec2 vUv; varying vec3 vW; varying float vS; varying float vFade; varying float vSize;
void main(){
  nearFade(vW);
  vec4 tc = texture2D(tFeather, vUv);
  tc.a *= vSize;
  if (tc.a < 0.08) discard;
  // Fire feathers carry their own light, so no moving light touches them: one fixed tone, and a steady glow toward the pale tip.
  // The tips sit above the bloom threshold and the rest below it, always; a flash or her lamp would move that edge and pop the glow.
  vec3 col = tc.rgb*mix(vec3(0.55, 0.50, 0.52), vec3(0.85, 0.66, 0.60), uToon);
  col += tc.rgb*0.30*smoothstep(0.45, 0.85, dot(tc.rgb, vec3(0.3, 0.5, 0.2)));
  float f = max(fogF(length(vW - cameraPosition), uFogDensity), 1.0 - vFade);
  gl_FragColor = vec4(mix(col, uFogColor, f), tc.a);
}
