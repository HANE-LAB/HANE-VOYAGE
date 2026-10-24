#include <voyage/swell>
#include <voyage/rise_age>
attribute vec4 aT; attribute vec4 aDeco; attribute vec4 aCard; attribute vec4 aInfo; attribute vec3 aCorner;
uniform float uMirror; uniform vec2 uWin; uniform float uPx; uniform float uCalm;
varying vec2 vUv; varying vec3 vW; varying float vS; varying float vFade; varying float vSize; varying float vLamp; varying vec3 vPuff;
// A gate's seasonal dress (src/seasons.ts). aCard: the anchor in gate units and the half size in world units;
// aInfo: season, atlas cell, mode (0 faces the camera, 1 hangs upright below its anchor, 2 floats on the water, 3 a puff
// of snow off a beam), turn; aCorner: the quad's corner, and 1 for cards on or under the top beam.
// vPuff (snow only): how far through its fall, how strong, a seed (deco.frag.glsl draws its flakes).
void main(){
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec2(0.0); vW = vec3(0.0); vS = aT.w; vFade = 0.0; vSize = 0.0; vLamp = 0.0; vPuff = vec3(0.0);
  float rise = smoothstep(-12.0, -5.5, aT.w), mode = aInfo.z, fade = 1.0 - smoothstep(uWin.y - 50.0, uWin.y, aT.w);
  if (abs(aInfo.x - aDeco.y) > 0.5 || rise <= 0.0 || fade <= 0.0 || (mode > 1.5 && uMirror < 0.0)) return;
  float y = aCard.y;
  if (aDeco.x < 0.5 && aCorner.z > 0.5) y -= 0.075*pow(min(abs(aCard.x)/0.64, 1.0), 2.4);   // plain wood gates have a straight top beam
  vec3 c = vec3(aT.x + aCard.x*9.50, y*aT.z - (1.0 - rise)*aT.z*1.10, aT.y + aCard.z*9.50);
  float s = aCard.w, r = aInfo.w;
  // The dress moves. A breeze sways every card a little at all times, in gusts that run down the row of gates. A card
  // shakes as it comes up out of the sea, and again, less, as its gate stops rising (the two newest gates, src/rise.ts):
  // a damped swing in the seconds since those moments, so it keeps its pace at any playback speed and while paused.
  // Reduced motion stills it all. The weeping cherry hangs in chains from the top beam's ends; a chain swings as one.
  bool chain = abs(aInfo.y - 1.0) < 0.5 && mode < 0.5;
  float ph = 6.2832*fract(chain ? 0.31*sign(aCard.x) + 9.7*aCard.z : dot(aCard.xyz, vec3(7.13, 3.71, 11.9)) + 0.37*aInfo.y);
  float still = 1.0 - uCalm, gust = 0.65 + 0.35*sin(uTime*0.4 - aT.w*0.07);
  float sway = still*gust*(sin(uTime*1.35 + ph) + 0.45*sin(uTime*3.1 + 1.7*ph)), shake = 0.0, came = -1.0;   // came: seconds since this card came up
  for (int k = 0; k < 2; k++) if (abs(aT.w + uRiseA[k].y) < 0.5){
    float stop = uRiseC[k];   // since the gate stopped rising
    came = outAge(y, uRiseA[k].w, uRiseB[k], stop);
    shake = still*((came < 0.0 ? 0.0 : exp(-came/0.45)*sin(13.0*came)) + (stop < 0.0 ? 0.0 : 0.45*exp(-stop/0.35)*sin(17.0*stop)));
  }
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]), w;
  if (mode < 0.5){
    // flowers and leaves turn and nod about their anchor; down a weeping chain each card swings further
    float depth = chain ? (0.898 + 0.075*pow(min(abs(aCard.x)/0.64, 1.0), 2.4) - aCard.y)*aT.z : 0.0, a = r + 0.07*sway + 0.35*shake;
    vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a))*aCorner.xy*s;
    c += right*((0.05*s + 0.05*depth)*sway + (0.18*s + 0.2*depth)*shake) + up*0.1*s*shake;
    w = c + right*q.x + up*q.y;
  } else if (mode < 1.5){
    // a lantern hangs below its anchor, turned to the camera, and swings on its cord
    vec2 f = normalize(cameraPosition.xz - c.xz + vec2(1e-4, 0.0));
    float a = 0.06*sway + 0.4*shake;
    vec2 o = mat2(cos(a), sin(a), -sin(a), cos(a))*vec2(aCorner.x, aCorner.y - 1.0)*s;
    w = c + vec3(f.y, 0.0, -f.x)*o.x + vec3(0.0, o.y, 0.0);
  } else if (mode < 2.5){
    vec2 q = mat2(cos(r), sin(r), -sin(r), cos(r))*aCorner.xy*s;
    w = vec3(c.x + q.x, 0.0, c.z + q.y); w.y = swellH(w.xz) + 0.06;
  } else {
    // Snow sifting off a beam: each card puffs every 4 to 9 s in about two turns of three, fainter out of the gusts, and
    // a gate coming up out of the sea shakes a puff off every card. A puff falls slowly, drifts with the breeze and
    // spreads as it goes (deco.frag.glsl draws its flakes). None while motion is reduced, as with the weather.
    float P = 4.0 + 5.0*fract(ph*1.37), at = uTime + ph/6.2832*P, n = floor(at/P), tp = at - n*P;
    float on = step(0.35, fract(sin(mod(n, 997.0)*12.9898 + ph)*43758.5453))*gust;
    if (came >= 0.0 && came < 1.6){ tp = came; on = 1.0; }
    if (uCalm > 0.5 || tp > 1.6 || on <= 0.0) return;
    c += vec3(0.0, -0.75*tp - 0.25*tp*tp, 0.0) + right*0.35*tp;
    w = c + (right*aCorner.x + up*aCorner.y)*s;
    vPuff = vec3(tp/1.6, on, fract(ph*3.1 + n*0.618));
  }
  vW = w; vFade = fade; vLamp = abs(mode - 1.0) < 0.5 ? 1.0 : 0.0;
  // A card fades out while it shrinks from 4 to 2 px across, before it can sparkle. It comes up out of the sea only with
  // its gate, not ahead of it: a card facing the camera is hidden until its anchor is well out. A lantern hangs below its
  // anchor, so it is there whole from when its anchor is a unit under the sea and comes up through the water, which hides
  // the rest of it. Faded in instead, every pixel of it crossed the bloom threshold in the same frame and its glow came on
  // at once (2026-10-23).
  vSize = smoothstep(2.0, 4.0, 2.0*s*uPx/max(length(w - cameraPosition), 0.1))*(abs(mode - 2.0) < 0.5 ? smoothstep(0.7, 1.0, rise) : (abs(mode - 1.0) < 0.5 ? step(-1.0, c.y) : smoothstep(0.6, 1.6, c.y)));
  vUv = mode > 2.5 ? aCorner.xy*0.5 + 0.5 : vec2(mod(aInfo.y, 4.0)*0.25, 0.5 - floor(aInfo.y/4.0)*0.5) + (aCorner.xy*0.5 + 0.5)*vec2(0.25, 0.5);
  w.y *= uMirror;
  gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.0);
}
