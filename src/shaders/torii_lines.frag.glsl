#include <voyage/fog>
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uMirror; varying vec3 vW; varying float vFade; varying vec3 vLine;
void main(){
  if (uMirror < 0.0 && vW.y < 0.0) discard;
  float dith = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (smoothstep(1.0, 2.5, length(vW - cameraPosition)) < dith) discard;
  float f = max(fogF(length(vW - cameraPosition), uFogDensity), 1.0 - vFade);
  gl_FragColor = vec4(mix(vLine, uFogColor, f), 1.0);
}
