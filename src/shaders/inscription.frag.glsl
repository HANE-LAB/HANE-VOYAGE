#include <voyage/torii>
uniform sampler2D tIns; varying vec2 vUv; varying vec3 vW; varying float vA; varying float vGold; varying float vWood;
void main(){
  nearFade(vW);
  float ink = texture2D(tIns, vUv).a*vA;
  if (ink < 0.004) discard;
  // On lacquer: pale 胡粉 white (luma about 0.53), gilded letters gold (about 0.55); fixed colours under the bloom
  // threshold 0.60, so no moving light can push them over it. On plain wood: sumi, near black with a little lacquer.
  vec3 col = mix(mix(vec3(0.60, 0.53, 0.44), vec3(0.76, 0.55, 0.22), vGold), mix(vec3(0.035, 0.028, 0.028), vec3(0.055, 0.020, 0.026), uToon), vWood);
  float f = fogF(length(vW - cameraPosition), uFogDensity)*0.85;
  gl_FragColor = vec4(mix(col, uFogColor, f), ink);
}
