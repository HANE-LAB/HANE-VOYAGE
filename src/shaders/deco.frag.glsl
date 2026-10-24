#include <voyage/torii>
uniform sampler2D tDeco; varying vec2 vUv; varying vec3 vW; varying float vS; varying float vFade; varying float vSize; varying float vLamp; varying vec3 vPuff;
void main(){
  nearFade(vW);
  vec4 tc;
  if (vPuff.y > 0.0){
    // a puff of snow (deco.vert.glsl): nine flakes, about 0.06 units across each, spreading out from the middle as it
    // falls and thinning out at the end
    float a = 0.0;
    for (int i = 0; i < 9; i++){
      float fi = float(i);
      vec2 p = fract(sin(vec2(fi*12.9898 + vPuff.z*78.233, fi*39.346 + vPuff.z*11.135))*43758.5453) - 0.5;
      a = max(a, 1.0 - smoothstep(0.04, 0.055, length(vUv - 0.5 - p*0.85*(0.25 + 0.75*vPuff.x))));
    }
    tc = vec4(1.0, 1.0, 1.0, a*vPuff.y*(1.0 - smoothstep(0.65, 1.0, vPuff.x)));
  } else tc = texture2D(tDeco, vUv);
  tc.a *= vSize;
  if (tc.a < 0.08) discard;
  vec3 col;
  // lanterns are lit from inside: one steady glow, their bright middle always above the bloom threshold, like the plaque's gold
  if (vLamp > 0.5) col = tc.rgb*1.35;
  // snow powder: moonlit white, under the bloom threshold (luma 0.56)
  else if (vPuff.y > 0.0) col = vec3(0.52, 0.56, 0.64)*mix(0.82, 1.0, uToon);
  else {
    // blossoms and leaves take the gate's lit tone, warmer inside the fleet, and stay under the bloom threshold (rule 10)
    float inF = exp(-max(0.0, max(uFleetS.x - vS, vS - uFleetS.y))/14.0)*clamp(uFleetGlow, 0.0, 1.0);
    col = tc.rgb*mix(vec3(0.56, 0.46, 0.52), vec3(0.66, 0.52, 0.46), inF)*mix(0.82, 1.0, uToon);
  }
  float f = max(fogF(length(vW - cameraPosition), uFogDensity), 1.0 - vFade);
  gl_FragColor = vec4(mix(col, uFogColor, f), tc.a);
}
