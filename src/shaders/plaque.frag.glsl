#include <voyage/torii>
uniform sampler2D tAtlas; varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vS; varying float vFade;
void main(){
  nearFade(vW);
  vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
  vec3 tc = texture2D(tAtlas, vUv).rgb;
  // gilded letters are self-lit, so the month reads at night whatever is lighting the gate; the lacquer stays dim.
  // Values are set above 1 so the ACES curve and bloom keep them gold rather than washing out to white.
  float gold = smoothstep(0.10, 0.35, tc.r - tc.b), txt = smoothstep(0.60, 0.78, tc.g);
  vec3 lac = tc*(0.6 + 3.0*toriiLight(n, v, 0.75, vS, vW));
  vec3 col = mix(lac, vec3(2.3, 0.95, 0.30)*mix(0.55, 1.0, txt)*mix(0.8, 1.0, uToon), gold);
  float f = max(fogF(length(vW - cameraPosition), uFogDensity)*0.85, 1.0 - vFade);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
}
