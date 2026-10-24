#include <voyage/fog>
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uLamp; uniform vec3 uLampPos; uniform float uFleetGlow; uniform vec2 uFleetS; uniform float uFlash; uniform float uMirror; uniform float uToon; uniform vec3 uKeyT;
// cel version, painted the way an anime background is: every face gets one of four tones by which way it faces
// (toward the key, away from it, up to the night sky, down to the lantern-lit sea). The key is fixed per view, so the
// tones never move; the fleet's warmth and her bonfire only tint them, smoothly. Shadow stays a deep vermilion, not black.
// how much a face turns toward the fixed key; fronts and backs count the same (see toriiToon)
float toriiKey(vec3 n){ return dot(vec3(n.x, n.y, abs(n.z)), uKeyT); }
vec3 toriiToon(vec3 c, vec3 n, vec3 v, float y, float S, vec3 w){
  float inF = exp(-max(0.0, max(uFleetS.x - S, S - uFleetS.y))/14.0)*clamp(uFleetGlow, 0.0, 1.0);
  float dark = 1.0 - smoothstep(0.05, 0.22, max(c.r, max(c.g, c.b)));
  vec3 ct = c + vec3(0.040, 0.040, 0.085)*dark;   // black lacquer reads as ink blue
  // a gate is the same front and back and the fleet surrounds it, so both faces count as lit; the two tones come from its sides
  float side = smoothstep(0.02, 0.10, toriiKey(n));
  float top = smoothstep(0.45, 0.60, n.y), bot = smoothstep(0.45, 0.60, -n.y);
  // values are night values: lit vermilion lands near 0.65 on screen and shadow near 0.35, a clear two-tone, never black
  vec3 litC = ct*mix(vec3(0.62, 0.48, 0.56), vec3(0.95, 0.70, 0.62), inF);
  litC *= 1.0 + 0.12*smoothstep(0.55, 0.62, toriiKey(n));   // a third tone on faces turned right at the key (at most ~0.46 with every light up)
  vec3 shdC = ct*mix(vec3(0.30, 0.24, 0.46), vec3(0.40, 0.30, 0.50), inF) + vec3(0.010, 0.012, 0.030);
  vec3 col = mix(shdC, litC, side);
  col = mix(col, mix(ct*vec3(0.62, 0.55, 0.92) + vec3(0.030, 0.036, 0.080), vec3(0.25, 0.26, 0.39), dark), top);   // tops catch the night sky; lacquer gets a moonlit slate sheen, so gates never read black from above
  col = mix(col, ct*mix(vec3(0.34, 0.26, 0.44), vec3(0.58, 0.36, 0.36), inF) + vec3(0.016, 0.006, 0.0)*inF, bot);   // undersides: darker than the face, warmed by the lanterns below
  col *= mix(0.96, 1.0, inF)*mix(1.0, mix(1.24, 0.80, clamp(y, 0.0, 1.0)), inF*(1.0 - top));   // a painted gradient, as in anime backgrounds: brighter low down, where the lanterns are
  return col + vec3(1.0, 0.55, 0.25)*(uLamp*exp(-length(w - uLampPos)/12.0)*0.20 + uFlash*0.08)*(0.4 + 0.6*c.r);
}
// moonlit snow: pale blue-white on top, a cooler blue on the sides; the same fixed key decides which side is in shade.
// The top stays near 0.40 in luma, so her lamp, a firework flash and the fleet's warmth together (+0.16) leave it under
// the bloom threshold (0.60): bloom's high pass is a hard step, and snow crossing it would flash into a glow in one frame.
vec3 snowToon(vec3 n, float S, vec3 w){
  float inF = exp(-max(0.0, max(uFleetS.x - S, S - uFleetS.y))/14.0)*clamp(uFleetGlow, 0.0, 1.0);
  float side = smoothstep(0.02, 0.10, toriiKey(n)), top = smoothstep(0.45, 0.60, n.y);
  vec3 col = mix(mix(vec3(0.17, 0.19, 0.28), vec3(0.30, 0.32, 0.40), side), vec3(0.40, 0.42, 0.47), top);   // whiter than the lacquer's slate top
  return col + vec3(1.0, 0.55, 0.25)*(uLamp*exp(-length(w - uLampPos)/12.0)*0.20 + uFlash*0.08 + 0.08*inF)*0.85;
}
vec3 toriiLight(vec3 n, vec3 v, float y, float S, vec3 w){
  float inF = exp(-max(0.0, max(uFleetS.x - S, S - uFleetS.y))/14.0);
  float under = 0.35 + 0.65*max(0.0, -n.y);
  float fl = uFleetGlow*inF*(1.0 - 0.55*clamp(y, 0.0, 1.0))*under;
  float lh = uLamp*exp(-length(w - uLampPos)/12.0)*0.7;
  vec3 amb = vec3(0.022, 0.028, 0.052)*(0.6 + 0.4*n.y);
  float rim = pow(1.0 - abs(dot(n, v)), 3.0);
  return amb + vec3(1.0, 0.56, 0.26)*(fl*0.30 + lh + uFlash*0.12) + vec3(0.06, 0.08, 0.14)*rim*0.5;
}
// dissolve only if the camera gets too close, and keep the underwater part out of the reflection.
// (Gates leaving the far end now sink into the fog instead of dissolving: a screen-door dither shimmers as the view moves.)
void nearFade(vec3 w){
  if (uMirror < 0.0 && w.y < 0.0) discard;
  float nf = smoothstep(1.0, 2.5, length(w - cameraPosition));
  float dith = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (nf < dith) discard;
}
