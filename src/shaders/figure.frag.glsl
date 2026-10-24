#include <voyage/fog>
uniform sampler2D tMap; uniform float uToon; uniform vec3 uKeyF; uniform vec2 uSweep;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uLamp; uniform vec3 uLampPos; uniform float uFleetGlow; uniform float uFlash;
uniform float uCastSat; uniform vec3 uRimC; uniform vec3 uColor;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vB; varying float vHgt;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
void main(){
  // The costume change (src/figures.ts): a ragged edge sweeps up her body, the new look below it and the old one above.
  // uSweep: x how far up the edge is (her height is 1), y -1 on the new look, 1 on the old one, 0 when nothing changes.
  // The edge is a function of the rest pose, so it stays put on the body while she moves.
  float edge = 0.0;
  if (uSweep.y != 0.0){
    float h = vHgt + 0.035*sin(vB.x*41.0 + vB.z*29.0)*sin(vB.z*37.0 - vB.x*23.0 + vB.y*11.0);
    if ((h - uSweep.x)*uSweep.y < 0.0) discard;
    edge = 1.0 - smoothstep(0.0, 0.03, abs(h - uSweep.x));
  }
  vec3 col;
#ifdef LINE
  col = vec3(0.02, 0.016, 0.035);
#else
  // the textures hold display colours, used as written like every colour on the page (no sRGB decoding)
  vec3 base = uColor;
  #ifdef HAS_MAP
  base *= texture2D(tMap, vUv).rgb;
  #endif
  vec3 n = normalize(gl_FrontFacing ? vN : -vN), v = normalize(cameraPosition - vW);
  vec3 warm = vec3(1.0, 0.60, 0.28), ld = uLampPos - vW;
  // her bonfire just ahead of them: warm light on what faces it, dimming with distance as on the ships
  float lr = max(length(ld), 0.01), lamp = uLamp*exp(-lr/8.0)*(0.3 + 0.7*max(dot(n, ld/lr), 0.0));
  if (uToon < 0.5){
    vec3 amb = vec3(0.045, 0.060, 0.105)*(0.55 + 0.45*n.y);
    float rim = pow(1.0 - abs(dot(n, v)), 3.0);
    col = base*(amb + warm*(lamp*0.55 + uFleetGlow*0.05 + uFlash*0.08)) + base*vec3(0.10, 0.13, 0.22)*rim*0.6;
  } else {
    // cel shading after GGXrd: a key fixed in their own frame (src/figures.ts turns it with them), so only the body's
    // own turns move a shadow edge, never a moving light. Shade is a cool mid tone, not black.
    float kd = dot(n, uKeyF), aa = max(fwidth(kd), 0.015), band = smoothstep(0.10 - aa, 0.10 + aa, kd);
    vec3 litC = base*vec3(1.04, 0.97, 0.90)*0.58;
    vec3 shdC = base*vec3(0.66, 0.58, 0.80)*0.50 + vec3(0.008, 0.010, 0.028);
    col = mix(shdC, litC, band);
    // the moving lights only add, smoothly
    col += base*warm*(lamp*0.22 + uFlash*0.06 + uFleetGlow*0.02);
    // edge light on the shaded side along the silhouette, moonlight mixed in; it fades out on a figure small on screen,
    // where it would sparkle
    float e = 1.0 - abs(dot(n, v)), ew = fwidth(e) + 0.01, big = 1.0 - smoothstep(0.10, 0.20, ew);
    col = mix(col, uRimC, smoothstep(0.68 - ew, 0.68 + ew, e)*(1.0 - band)*big*0.8);
    col = max(mix(vec3(dot(col, LUMA)), col, uCastSat), 0.0);
  }
  col = mix(col, vec3(1.0, 0.55, 0.25)*0.62, edge);
  // nothing lit here may cross the bloom threshold (0.60) with every moving light at full: brightness eases toward 0.58
  float l = dot(col, LUMA), lc = l < 0.46 ? l : 0.46 + 0.12*(1.0 - exp((0.46 - l)/0.12));
  col *= lc/max(l, 1e-4);
#endif
  gl_FragColor = vec4(mix(col, uFogColor, fogF(length(vW - cameraPosition), uFogDensity)), 1.0);
}
