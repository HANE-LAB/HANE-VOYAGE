#include <voyage/fog>
// One shell of fireworks (src/fx.ts). Every point is a function of the seconds since launch, so the CPU only sets uTau.
// position: a star's direction times its speed (round shells), or its place in the figure (shapes), in the camera's
// right / up / back, so a shape always faces the viewer; a round shell looks the same either way. Rising trail: x is
// its wobble phase. aSeg: x how far behind the head (s; rising trail: parts of the climb), y brightness, z size,
// w 0 star, 1–3 a figure's other colours (ornaments, eyes, mouth), 4 rising trail.
// Per shell: uFade how fast the stars dim, uTwinkle 1 for the crackle, uDrop the fall, uSpike the burst's first flare.
attribute vec4 aSeg;
uniform float uTau, uR, uFade, uTwinkle, uDrop, uSpike, uCalm, uPx, uPR, uMirror, uFogDensity;
uniform vec3 uO, uC1, uC2, uAcc[3];
varying vec4 vC;
const float TR = 1.7;   // the climb, s
void main(){
  vec3 w, col; float I, sz;
  if (aSeg.w > 3.5){
    float uu = max(0.0, uTau/TR - aSeg.x), ee = 1.0 - (1.0 - uu)*(1.0 - uu);
    w = vec3(uO.x + sin(position.x + uu*9.0)*0.12, uO.y*ee, uO.z);
    col = vec3(1.0, 0.72, 0.42); sz = aSeg.z;
    I = uTau < TR && uu > 0.0 && uCalm < 0.5 ? aSeg.y : 0.0;
  } else {
    float tb = uTau - TR, tj = tb - aSeg.x, k = 1.0 - exp(-2.4*tj);
    // 减少 (uCalm): the figure fades in where it stands, with no burst outward, no fall and no crackle
    float rr = uR*mix(k, 0.92 + 0.08*k, uCalm), drop = (1.0 - uCalm)*uDrop*uR*tj*tj;
    w = uO + transpose(mat3(viewMatrix))*position*rr - vec3(0.0, drop, 0.0);
    float mc = clamp((tb - 0.6)/2.4, 0.0, 1.0);
    col = aSeg.w > 0.5 ? uAcc[int(aSeg.w + 0.5) - 1] : mix(uC1, uC2, mc);
    // a round shell's first tenth of a second is brighter, easing off rather than stepping down
    I = 3.0*exp(-uFade*tj)*(1.0 + (1.0 - uCalm)*uSpike*exp(-tj/0.1))*aSeg.y;
    // round shells crackle once a star has burned 2.7 s; the depth eases in, or the whole shell would halve in one frame
    float tw = uTwinkle*(1.0 - uCalm)*smoothstep(2.7, 3.2, tj);
    I *= 1.0 - tw*(0.5 - 0.5*sin(tj*41.0 + dot(position, vec3(31.7, 47.3, 13.1))));
    I *= (1.0 - smoothstep(4.6, 5.2, tb))*mix(1.0, smoothstep(0.0, 0.5, tj), uCalm);
    I = tj > 0.0 ? I : 0.0;
    sz = (0.34 + 0.18*(1.0 - mc))*aSeg.z;
  }
  w.y *= uMirror;
  vec4 mv = viewMatrix*vec4(w, 1.0); gl_Position = projectionMatrix*mv; float d = max(-mv.z, 0.1);
  vC = vec4(col, I*(1.0 - 0.5*fogF(d, uFogDensity))); gl_PointSize = I > 0.001 ? max(1.5*uPR, uPx*sz/d) : 0.0;
}
