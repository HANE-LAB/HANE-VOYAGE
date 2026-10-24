// A white core in a gold glow, brightest just above the masthead and fading upward, brighter with each tier. The glow
// shimmers slowly; from a year on one ring of light per year climbs the pillar. The rings keep their places whatever their
// number (golden-ratio spacing), so a new year adds a ring without moving the others. uPT is a clock that stops with
// reduced motion (veterans.ts). Nothing here follows a moving light: it is the ship's own light.
uniform float uToon; uniform float uPT;
varying vec2 vUV; varying float vLvl; varying float vA; varying float vH; varying float vRingW; varying float vSeed;
void main(){
  float x = vUV.x, y = vUV.y, yr = max(vLvl - 3.0, 0.0);
  float prof = exp(-x*x*5.0), core = exp(-x*x*40.0);
  float fall = pow(clamp(1.0 - y, 0.0, 1.0), 1.6)*smoothstep(0.0, 0.05, y);
  float sh = 0.88 + 0.12*sin(y*vH*5.0 - uPT*1.6 + vSeed*6.3)*sin(y*vH*2.3 - uPT*0.7 + vSeed*12.6);
  float tb = 0.70 + 0.15*clamp(vLvl - 1.0, 0.0, 1.0) + 0.15*clamp(vLvl - 2.0, 0.0, 1.0) + 0.04*yr;
  vec3 col = (vec3(1.0, 0.80, 0.52)*prof*0.45*sh + vec3(1.0, 0.95, 0.85)*core*0.75)*fall*tb;
  float rings = 0.0;
  for (int i = 0; i < 8; i++){
    float fi = float(i), on = clamp(yr + 1.0 - fi, 0.0, 1.0)*clamp(vLvl - 2.0, 0.0, 1.0);
    if (on <= 0.0) break;
    float ry = fract(uPT/7.0 + fi*0.618034 + vSeed), q = (y - ry)*vH/vRingW;
    rings += exp(-q*q)*sin(3.1416*ry)*on;
  }
  col += vec3(1.0, 0.90, 0.70)*rings*prof*0.6*min(1.0, 0.07/vRingW);
  if (uToon < 0.5) col *= 0.7;
  gl_FragColor = vec4(col*vA, 1.0);
}
