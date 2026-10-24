// The water around a rising gate (src/rise.ts), drawn into a RIP_W x RIP_W texture centred a little ahead of her bow:
// the height of the rings and the dome, its slope (x, z), and the foam's coverage. It is a function of the seconds since
// each beam broke the surface (uRiseB), so nothing carries over from one frame to the next. The sea only reads it.
// uRiseA: each gate's centre x and z, its height, its rise; uRipC: the texture's centre.
uniform vec4 uRiseA[2]; uniform vec4 uRiseB[2]; uniform vec3 uRipC; uniform float uTravel; varying vec2 vUv;
// distance from a beam's footprint: 0 the top beam, 1 the tie beam, 2 the legs' cross beams (rounded rectangles)
float beamD(vec2 q, float e){
  if (e < 0.5) return length(vec2(max(abs(q.x) - 6.0, 0.0), q.y)) - 0.45;
  if (e < 1.5) return length(vec2(max(abs(q.x) - 4.7, 0.0), q.y)) - 0.25;
  return length(vec2(abs(q.x) - 3.8, max(abs(q.y) - 1.7, 0.0))) - 0.2;
}
// The rings from a beam leaving the water, as deep water answers a sudden push (the Cauchy-Poisson problem, by
// stationary phase; g = 8.1 as the small waves): at distance d after t seconds the crests passing have wavenumber
// k = g t²/(4 d²) and phase g t²/(4 d). So the long waves run ahead and the short ones follow, and new crests keep
// appearing at the back. The beam only makes waves near K (about 2.5 units long); waves shorter than four texels are
// left out. The current carries the rings past the gate at 0.5 a second (the caller shifts q).
const float K = 2.5, KMAX = 6.2831853/(4.0*RIP_W/RIP_N);
float ring(float d, float t, float amp){
  float dd = max(d, 0.0) + 0.4, k = 8.1*t*t/(4.0*dd*dd), s = k/K;
  s = s*s*exp(2.0*(1.0 - s))*(1.0 - smoothstep(0.6, 1.0, k/KMAX));
  return amp*s*cos(k*dd - 0.785)*exp(-t/4.0)/sqrt(1.0 + 0.4*max(d, 0.0));
}
// height and foam at a world point
vec2 water(vec2 w){
  float h = 0.0, foam = 0.0;
  for (int gi = 0; gi < 2; gi++){
    vec4 A = uRiseA[gi], B = uRiseB[gi];
    vec2 q0 = w - A.xy;
    // the older gate fades out before it leaves the slots (src/rise.ts)
    float keep = gi == 0 ? 1.0 : 1.0 - clamp(B.w, 0.0, 1.0);
    if (A.w <= 0.0 || keep <= 0.0) continue;
    for (int e = 0; e < 3; e++){
      float t = e == 0 ? B.x : (e == 1 ? B.y : B.z);
      if (t < 0.0 || t > 12.0) continue;
      float d = beamD(q0 + vec2(0.0, 0.5*t), float(e));
      h += keep*ring(d, t, e == 0 ? 0.12 : (e == 1 ? 0.08 : 0.035));
      // foam where the sheets come down: a band spreading out from the footprint and thinning, lace rather than a sheet
      float R = 0.15 + 0.9*sqrt(t), W = 0.3 + 0.25*t;
      foam = max(foam, keep*exp(-(d - R)*(d - R)/(W*W))*smoothstep(0.05, 0.3, t)*exp(-t/(e == 2 ? 1.2 : 2.4))*(e == 2 ? 0.6 : 1.0));
    }
    // the dome: the top beam lifts the water just before it breaks through (about 0.45, as experiments with rising
    // blocks predict), and it falls back over 0.3 s as the rings start
    float d0 = max(beamD(q0, 0.0), 0.0);
    h += keep*0.45*smoothstep(0.07, 0.164, A.w)*(B.x < 0.0 ? 1.0 : 1.0 - smoothstep(0.0, 0.3, B.x))*exp(-d0*d0/1.1);   // 0.164: the top beam's break (src/rise.ts)
    // the legs come out with the top beam; the water churned round them settles over ten seconds
    // (legs at x = ±3.8: the main posts and the short legs)
    vec2 a = vec2(abs(q0.x) - 3.8, q0.y);
    float dl = min(length(max(abs(a) - vec2(0.38), 0.0)), length(max(abs(vec2(a.x, abs(a.y) - 1.615)) - vec2(0.30), 0.0)));
    float settle = B.x < 0.0 ? 0.0 : smoothstep(0.0, 0.3, B.x)*(1.0 - smoothstep(4.0, 10.0, B.x));
    foam = max(foam, keep*exp(-dl*dl/0.02)*0.75*settle);
  }
  return vec2(h, foam);
}
float hashR(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float noiseR(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(hashR(i), hashR(i + vec2(1.0, 0.0)), f.x), mix(hashR(i + vec2(0.0, 1.0)), hashR(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  // world x, z; the slope from the next texel along each axis: three evaluations where central differences took five,
  // which on a laptop GPU at a phone's pixel count was most of this pass
  vec2 w = uRipC.xy + (vUv - 0.5)*RIP_W, e = vec2(RIP_W/RIP_N, 0.0);
  vec2 c = water(w);
  vec2 slope = vec2(water(w + e).x - c.x, water(w + e.yx).x - c.x)/e.x;
  // the foam broken up by noise that drifts with the water
  float fn = noiseR((w + vec2(0.0, uTravel))*2.3)*0.65 + noiseR((w + vec2(0.0, uTravel))*6.1)*0.35;
  float cover = smoothstep(0.55, 0.85, fn*0.6 + c.y*0.75)*c.y;
  // the edges fade into the open sea
  vec2 m = min(vUv, 1.0 - vUv);
  float win = smoothstep(0.0, 0.1, min(m.x, m.y));
  gl_FragColor = vec4(c.x, slope, cover)*win;
}
