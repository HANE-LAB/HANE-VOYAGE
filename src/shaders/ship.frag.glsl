#include <voyage/fog>
#include <voyage/hatch>
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uLamp; uniform vec3 uLampPos; uniform float uFleetGlow; uniform float uFlash;
uniform float uToon; uniform float uCastSat; uniform vec3 uRimC; uniform float uMirror; uniform vec3 uTierK; uniform vec3 uTierT; uniform vec3 uTierS;
varying vec3 vC; varying float vGlow; varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec3 vLan3; varying float vLan; varying float vFade; varying float vWeather; varying float vFlick; varying float vHue;
varying vec2 vSail; varying vec3 vNm; varying float vKind; varying float vK; varying float vLodK;
// the crest takes its rank colour
vec3 tierColor(float k){ return k > 3.5 ? uTierS : (k > 2.5 ? uTierT : uTierK); }
void main(){
  vec3 v = normalize(cameraPosition - vW);
  // a face's normal from screen derivatives, so a part shrinking into the far model (ship.vert.glsl) is shaded as it
  // stands: in the ship's own frame for the cel key (turned the way the model's normal points), in the world and
  // toward the viewer for 写实. On a model that does not shrink they are its flat normals.
  vec3 nc = cross(dFdx(vL), dFdy(vL)), nm = normalize(vNm);
  if (dot(nc, nc) > 1e-24) nm = normalize(nc)*(dot(nc, vNm) < 0.0 ? -1.0 : 1.0);
  vec3 nf = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 n = uToon > 0.5 ? normalize(gl_FrontFacing ? vN : -vN) : nf*(dot(nf, v) < 0.0 ? -1.0 : 1.0);
  // paper: a sail (glow 0.5) lit from inside by the ship's own lantern, or a deck house's wall (shoji, 0.35); lights (1)
  float isEm = step(0.75, vGlow), isPaper = step(0.25, vGlow)*(1.0 - isEm), isShoji = isPaper*(1.0 - step(0.42, vGlow)), isSail = isPaper - isShoji;
  float hasSail = step(0.0, vSail.x)*(1.0 - isShoji);
  float tiered = (vKind < 0.5 || vKind > 2.5) ? 1.0 : 0.0;
  float anonK = (vKind > 0.5 && vKind < 1.5) ? 1.0 : 0.0;   // 无名之舰: a blank sail that takes the moon's colour
  vec3 base = vC;
  float gy = dot(base, vec3(0.299, 0.587, 0.114));
  base = mix(base, vec3(gy)*0.6, vWeather*0.6*(1.0 - isEm)*(1.0 - isPaper));
  base = mix(base, base*vec3(1.0, 0.84, 0.62), vWeather*isSail*0.8);
  vec3 warm = vec3(1.0, 0.60, 0.28);
  float own = vLan*exp(-length(vL - vLan3)*2.6)*1.5;
  float lh = uLamp*exp(-length(vW - uLampPos)/8.0)*0.45*(1.0 - 0.4*isPaper);
  float rim = pow(1.0 - abs(dot(n, v)), 3.0);
  // FAR: the far models of 舰长 and 无名之舰 (src/fleet.ts), a few pixels tall, leave out what has faded out at that size
  // anyway (the crest, the seams, the lattice, the edge light and the hatching, which fade with vLodK on the detailed
  // model), so the detailed model shrunk to the far one looks the same.
  float crest = 0.0, bars = 0.0;
#ifndef FAR
  // rank crest on the sail: a feather inside a ring, like a family crest (丸に羽).
  // It fades out once the ring would be under about a pixel wide, so thousands of far sails do not sparkle.
  vec2 cq = (vSail - vec2(0.5, 0.47))*vec2(1.0, 1.25);
  float cr = length(cq);
  vec2 fq = mat2(0.90, 0.44, -0.44, 0.90)*cq;
  float fe = length(fq*vec2(1.0/0.050, 1.0/0.135));
  float vane = (1.0 - smoothstep(0.90, 1.08, fe))*(1.0 - (1.0 - smoothstep(0.003, 0.009, abs(fq.x)))*step(-0.12, fq.y));
  float ring = 1.0 - smoothstep(0.010, 0.022, abs(cr - 0.175));
  float sailPx = length(fwidth(cq));
  crest = hasSail*tiered*max(ring, vane)*(1.0 - smoothstep(0.03, 0.06, sailPx));
  // shoji: the lattice (組子), a bar at each whole u and at thirds of the wall's height; it fades before it gets thinner
  // than a pixel. The paper is warmest low down, where the lamps inside stand.
  float bu = abs(fract(vSail.x + 0.5) - 0.5), bv = abs(fract(vSail.y*3.0 + 0.5) - 0.5), wu = fwidth(vSail.x), wv = fwidth(vSail.y*3.0);
  bars = isShoji*max((1.0 - smoothstep(wu*0.5, wu*1.5, bu))*(1.0 - smoothstep(0.15, 0.35, wu)), (1.0 - smoothstep(wv*0.5, wv*1.5, bv))*(1.0 - smoothstep(0.15, 0.35, wv)));
#endif
  vec3 col;
  if (uToon < 0.5){
    vec3 amb = vec3(0.030, 0.040, 0.075)*(0.55 + 0.45*n.y);
    col = base*(amb + warm*(own + lh + uFleetGlow*0.05 + uFlash*0.08)) + base*vec3(0.10, 0.13, 0.22)*rim*0.6;
    vec3 paper = mix(vec3(1.0, 0.86, 0.70), vec3(1.0, 0.74, 0.58), vHue);
    col += base*mix(warm*paper, vec3(0.34, 0.48, 0.86), anonK)*isPaper*(0.04 + 0.62*vLan*vLan)*vFlick*(1.0 - 0.3*isShoji);
    col *= 1.0 - 0.7*bars;
    col += vC*isEm*(0.3 + 1.2*vLan)*vFlick*vK;
    col = mix(col, tierColor(vKind)*(0.08 + 0.5*vLan*vLan)*vFlick, crest*0.7*isSail);
  } else {
    // cel shading after GGXrd: a light vector fixed in the ship's own frame against the flat face normal, so the
    // shadow edge sits on a geometric edge and nothing that moves (swell, her bonfire, fireworks) can drag it.
    // Shadow is a tinted mid tone as in Genshin's palette, never black; lantern light is added on top, smoothly.
    float kd = dot(nm, vec3(0.3293, 0.7683, 0.5488));
    float band = smoothstep(0.06, 0.12, kd);
    vec3 bt = base + vec3(0.030, 0.032, 0.070)*(1.0 - smoothstep(0.05, 0.22, max(base.r, max(base.g, base.b))));
    vec3 litC = bt*vec3(1.22, 0.96, 0.80)*(0.82 + 0.30*vLan);
    vec3 shdC = bt*vec3(0.52, 0.44, 0.68) + vec3(0.010, 0.012, 0.032);
    // three tones, still set only by the fixed key: faces turned right at it get a brighter tone, faces turned right
    // away a deeper shade. Only wood and dark parts brighten: red or white ones near her bonfire would cross the bloom threshold.
    litC *= 1.0 + 0.22*smoothstep(0.66, 0.70, kd)*(1.0 - step(0.25, dot(base, vec3(0.299, 0.587, 0.114))));
    shdC *= 1.0 - 0.20*(1.0 - smoothstep(-0.42, -0.38, kd));
    col = mix(shdC, litC, band);
#ifndef FAR
    // hatching in the shadow band only (a static mask), cross-hatched in the core shadow, in the ship's own frame;
    // it fades to flat colour on ships under about 15 px (fwidth is in ship lengths per pixel), where even the finest strokes would crowd
    vec2 hp = hatchPatch(vL, nm);
    float hm = (1.0 - band)*(1.0 - isPaper)*(1.0 - hasSail)*(1.0 - isEm)*(1.0 - smoothstep(0.06, 0.12, length(fwidth(hp))))*vLodK;
    col *= 1.0 - 0.46*hm*hatch(hp, 1.0 - smoothstep(-0.42, -0.25, kd));
#endif
    col += bt*warm*(exp(-length(vL - vLan3)*2.4)*vLan*0.9 + lh*0.8 + uFlash*0.10 + uFleetGlow*0.03);
    if (hasSail > 0.5){
      // washi sail lit from behind: an orange core near the lamp, paler paper above, one anti-aliased step between them
      float glowS = 1.0 - smoothstep(0.0, 0.95, length((vSail - vec2(0.5, 0.1))*vec2(1.3, 1.0)));
      float gw = fwidth(glowS);
      float stepS = mix(0.74, 1.0, smoothstep(0.46 - gw, 0.46 + gw, glowS));
      vec3 paperT = mix(vec3(1.0, 0.78, 0.48), vec3(1.0, 0.55, 0.21), glowS*0.85)*mix(0.95, 1.0, vHue);
      paperT = mix(paperT, mix(vec3(0.46, 0.58, 0.86), vec3(0.34, 0.50, 0.95), glowS*0.85), anonK);
      vec3 sailCol = isSail > 0.5
        ? paperT*(0.36 + 0.64*vLan)*stepS*vFlick
        : base*mix(vec3(0.42, 0.40, 0.62), vec3(1.15, 0.88, 0.62), clamp(lh*2.5, 0.0, 1.0));
#ifndef FAR
      // cloth seams (反) as on a 弁才船 sail; they fade out before they get thinner than a pixel, so far sails never shimmer
      float sx = fract(vSail.x*6.0), sw = fwidth(vSail.x*6.0);
      float seam = (1.0 - smoothstep(sw*0.6, sw*1.6, min(sx, 1.0 - sx)))*(1.0 - smoothstep(0.08, 0.25, sw));
      sailCol *= 1.0 - 0.16*seam;
#endif
      sailCol = mix(sailCol, tierColor(vKind)*(0.40 + 0.55*vLan)*vFlick, crest*0.85);
      // inked border, about two pixels to match the outlines; dropped on sails only a few pixels wide, where it would swallow the paper
      float e = min(min(vSail.x, 1.0 - vSail.x), vSail.y);
      float lw = fwidth(e)*2.0;
      sailCol = mix(sailCol, vec3(0.07, 0.04, 0.05), (1.0 - smoothstep(lw, lw*2.2, e))*0.92*(1.0 - smoothstep(0.06, 0.15, fwidth(vSail.x))));
      col = sailCol;
    }
    if (isShoji > 0.5){
      // the walls of a deck house: warm paper lit from inside by the ship's own lamp, under the bloom threshold
      // (about 0.55 at most) since a house is a large lit area, and the dark lattice over it
      vec3 paperS = mix(vec3(1.0, 0.80, 0.52), vec3(1.0, 0.64, 0.34), (1.0 - vSail.y)*0.6);
      col = mix(paperS*(0.28 + 0.40*vLan)*vFlick, vec3(0.10, 0.06, 0.05), bars*0.85);
    }
    // edge light on the side away from the key, from the smooth normals, anti-aliased; a constant colour mixed in, so no
    // moving light can push it over the bloom threshold. Low-poly faces seen edge-on would light up whole, so it only shows
    // where the smooth normal turns further from the view than the face (from screen derivatives) does: the strip along the
    // silhouette. It fades out on ships small on screen, where the term changes fast from pixel to pixel, so the far fleet
    // never sparkles; not in the half-size reflection either, where a thin band would alias. The far models' smooth
    // normals are not the detailed ones', so on 舰长 and 无名之舰 it grows in with the detail (vLodK) and is not there
    // while a ship draws its far model.
#ifndef FAR
    float e = abs(dot(nf, v)) - abs(dot(n, v)), ew = fwidth(e) + 0.01, big = 1.0 - smoothstep(0.08, 0.16, ew);
    col = mix(col, uRimC, smoothstep(0.32 - ew, 0.32 + ew, e)*(1.0 - band)*(1.0 - isPaper)*(1.0 - hasSail)*(1.0 - isEm)*big*vLodK*step(0.0, uMirror));
#endif
    col += vC*isEm*(0.5 + 1.4*vLan)*vFlick*vK;
    // the ships keep their colour against the faded night (uEnv); same brightness, never below zero
    col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, uCastSat), 0.0);
  }
  float d = length(vW - cameraPosition);
  float f = max(fogF(d, uFogDensity), 1.0 - vFade);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
}
