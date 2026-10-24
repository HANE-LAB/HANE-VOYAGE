#include <voyage/fog>
uniform sampler2D tCrest; uniform float uLamp; uniform vec3 uLampPos; uniform vec3 uFogColor; uniform float uFogDensity; varying vec2 vUv; varying vec3 vW;
void main(){ vec4 c = texture2D(tCrest, vUv); if (c.a < 0.45) discard;
  float lh = uLamp*exp(-length(vW - uLampPos)/8.0)*0.45;
  vec3 col = c.rgb*(vec3(0.03, 0.04, 0.07) + vec3(1.0, 0.6, 0.28)*(lh + 0.22));
  gl_FragColor = vec4(mix(col, uFogColor, fogF(length(vW - cameraPosition), uFogDensity)), 1.0); }
