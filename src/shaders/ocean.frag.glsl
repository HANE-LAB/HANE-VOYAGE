#include <voyage/swell>
#include <voyage/fog>
#include <voyage/sky>
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uLamp; uniform vec3 uLampPos; uniform vec2 uFleetC; uniform vec2 uFleetR;
uniform sampler2D tRefl; uniform vec2 uRes; uniform float uReflOn; uniform float uFlash; varying vec3 vW;
#if RISING
uniform sampler2D tRip; uniform vec3 uRipC;
#endif
#if WAVES
uniform sampler2D tWave; uniform mat4 projectionMatrix;
// The small waves (src/water.ts) at two sizes: WL, and WL/3.3 turned by 37 degrees at half the height, so the tile never
// shows. Mipmaps average them away with distance; what the averaging loses comes back as variance (the mean of the
// slope squared less the squared mean slope), which widens the reflection and her lamp's highlight instead of
// sparkling. Where the texture is magnified (near the camera) bilinear filtering makes up variance that is not there,
// so it fades out below one texel per pixel.
const mat2 R2 = mat2(0.7986, 0.6018, -0.6018, 0.7986);
vec4 smallWaves(vec2 p){   // slope xz, height, slope variance
  p.y += uTravel;
  vec2 ua = p/WL, ub = R2*p*(3.3/WL);
  vec4 a = texture2D(tWave, ua), b = texture2D(tWave, ub);
  float ma = smoothstep(0.5, 1.0, length(fwidth(ua))*WSIZE), mb = smoothstep(0.5, 1.0, length(fwidth(ub))*WSIZE);
  float var = max(a.w - dot(a.xy, a.xy), 0.0)*ma + 0.25*max(b.w - dot(b.xy, b.xy), 0.0)*mb;
  return vec4(a.xy + (b.xy*R2)*0.5, a.z + 0.5*b.z/3.3, var);   // b.xy*R2 is transpose(R2)*b.xy: back to world axes
}
// where a reflected ray lands in the mirror pass: a flat mirror shows it at the screen point of its mirror image
vec2 mirrorUV(vec3 r){ vec4 c = projectionMatrix*(viewMatrix*vec4(r.x, -r.y, r.z, 0.0)); return c.xy/max(c.w, 1e-3)*0.5 + 0.5; }
float hashO(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float noiseO(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(hashO(i), hashO(i + vec2(1.0, 0.0)), f.x), mix(hashO(i + vec2(0.0, 1.0)), hashO(i + vec2(1.0, 1.0)), f.x), f.y); }
#else
// without half-float render targets: the five sines the sea used before the wave texture
vec3 wv(vec2 p, vec2 k, float a, float w, float ph){ float s = dot(p,k) - uTime*w + ph; return vec3(a*k*cos(s), a*sin(s)); }
vec3 detail(vec2 p){ p.y += uTravel; vec3 r = vec3(0.0);
  r += wv(p, vec2(0.83,0.41), 0.034, 2.1, 0.0); r += wv(p, vec2(-0.52,0.95), 0.028, 2.5, 1.3);
  r += wv(p, vec2(1.70,-0.60), 0.012, 3.4, 2.2); r += wv(p, vec2(-1.10,-1.60), 0.010, 3.9, 0.4);
  r += wv(p, vec2(2.90,1.40), 0.005, 5.1, 3.0); return r; }
#endif
void main(){
  float dist = length(vW - cameraPosition);
  float far = smoothstep(30.0, 420.0, dist);
#if WAVES
  vec4 sw = smallWaves(vW.xz);
  vec2 g = swellG(vW.xz) + sw.xy;
  float var = sw.w + 0.0004;
#else
  vec3 dt = detail(vW.xz);
  vec2 g = swellG(vW.xz) + dt.xy*mix(1.0, 0.3, far);
  float var = 0.0;
#endif
#if RISING
  // a gate rising (src/rise.ts, which compiles this in only then): its rings and the dome tilt the water, its foam lies on
  // it. The texture holds height, slope and foam cover, fades to nothing at its edges and clamps there.
  vec4 rip = textureLod(tRip, (vW.xz - uRipC.xy)/RIP_W + 0.5, 0.0);
  g += rip.yz;
#endif
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vW);
  float fres = 0.02 + 0.98*pow(1.0 - max(dot(n,v), 0.0), 5.0);
  vec3 r = reflect(-v, n); r.y = abs(r.y);
  float fsky = fres;
#if WAVES
  // 二次元 blocks the sea in by depth first, as an anime background is painted: three flat tones by how much sky the
  // water mirrors, darkest near. The edges between them follow the waves at half strength, a step one pixel wide, and
  // give way to the plain blend where the tones would break up finer than a pixel. Only the view and the waves move
  // them, never a light.
  vec3 nh = normalize(vec3(-g.x*0.5, 1.0, -g.y*0.5));
  float ft = 0.02 + 0.98*pow(1.0 - max(dot(nh, v), 0.0), 5.0), fw2 = fwidth(ft);
  float tone = 0.035 + 0.15*smoothstep(0.045 - fw2, 0.045 + fw2, ft) + 0.35*smoothstep(0.20 - fw2, 0.20 + fw2, ft);
  fsky = mix(fres, mix(tone, fres, smoothstep(0.03, 0.08, fw2)), uToon);
#endif
  vec3 col = mix(envGrade(vec3(0.004, 0.009, 0.020)), skyColor(r), fsky);
  vec2 suv = gl_FragCoord.xy/uRes;
  // 二次元 paints the reflection the way an anime background does: a longer streak, and only of the lights. Each tap is
  // weighted by its own brightness, so the sky and the dark hulls drop out and the lanterns stretch down the water;
  // the streak then breaks into dashes on the waves (a function of place and time, never of the lights).
  // The weighting is a smooth, bounded function of the reflected light (no step), and the sum is scaled back to the plain
  // blur's weight (4.36), so 写实 is untouched and a brighter tap can at most double its share.
  vec3 rl = vec3(0.0); float wsum = 0.0;
#if WAVES
  // The reflection follows the tilted facet a little of the way (a facet tilted by a turns the ray by 2a, the answer for
  // things far off; hulls on the water want far less), and the slopes too small to see stretch it up and down the screen
  // by a quarter of 2σ: seven taps, with a coarser mip where they are more than a texel and a half apart.
  // (Anisotropic filtering looked the same and cost 4 ms a frame on a laptop GPU at a phone's pixel count.)
  vec2 ruv = mix(suv, mirrorUV(reflect(-v, n)), 0.12);
  float rstep = max(0.25*sqrt(var)*projectionMatrix[1][1]/3.0, 0.004)*mix(1.0, 1.6, uToon);
  float lod = clamp(log2(max(rstep*uRes.y*0.5/1.5, 1.0)), 0.0, 1.5);
  for (int k = -3; k <= 3; k++){ float fk = float(k); vec3 t = textureLod(tRefl, ruv + vec2(0.0, fk*rstep), lod).rgb;
    float w = (1.0 - abs(fk)*0.22)*mix(1.0, smoothstep(0.0, 0.40, dot(t, vec3(0.299, 0.587, 0.114))), uToon); rl += t*w; wsum += w; }
  float dash = mix(1.0, mix(0.15, 1.0, smoothstep(-0.3, 0.5, sw.z/WH)), uToon*(1.0 - far)*0.9);   // dashes on the crests
#else
  vec2 off = n.xz*vec2(0.05, 0.10)*mix(1.0, 0.35, far);
  float rstep = mix(0.004, 0.011, uToon);
  for (int k = -3; k <= 3; k++){ float fk = float(k); vec3 t = texture2D(tRefl, suv + off + vec2(0.0, fk*rstep)).rgb;
    float w = (1.0 - abs(fk)*0.22)*mix(1.0, smoothstep(0.0, 0.40, dot(t, vec3(0.299, 0.587, 0.114))), uToon); rl += t*w; wsum += w; }
  float dash = mix(1.0, mix(0.15, 1.0, smoothstep(0.35, 0.65, 0.5 + 0.5*sin((vW.z + uTravel)*2.6 + dt.z*35.0))), uToon*(1.0 - far)*0.9);
#endif
  rl *= 4.36/max(wsum, 1.0);
  col += rl*0.27*mix(0.45, 1.0, fres)*uReflOn*dash;
#if WAVES
  // ...paints the open sea with short horizontal strokes that ride the water: a line across the screen every 1.5 units,
  // drifting with the sea and bending with the small waves, broken into dashes by noise along it and shown on the
  // crests. Perspective packs them toward the horizon; they fade before they come 4 px apart.
  float su = vW.z + uTravel + 0.35*sw.z/WH, sfw = max(fwidth(su), 1e-5), sid = floor(su/1.5 + 0.5);
  float sline = 1.0 - smoothstep(0.5, 1.4, abs(fract(su/1.5 + 0.5) - 0.5)*1.5/sfw);
  float sdash = noiseO(vec2(vW.x*0.45 + sid*7.31, sid*1.7)), sdw = max(fwidth(sdash), 1e-3);
  float stroke = sline*smoothstep(0.6 - sdw, 0.6 + sdw, sdash)*smoothstep(-0.4, 0.5, sw.z/WH)*(1.0 - smoothstep(1.5/6.0, 1.5/4.0, sfw));
  col = mix(col, envGrade(vec3(0.11, 0.14, 0.22)) + vec3(1.0, 0.56, 0.24)*uFleetGlow*0.05, stroke*0.75*uToon);
  // ...and puts a few glints in the lights' reflection: a four-point star 7 px across on one point of the water in each
  // 1.3-unit cell (the cells drift with the sea), waxing and waning slowly, exactly as bright as the reflection under
  // it, so a moving light only scales it
  if (uToon > 0.5 && far < 1.0 && dot(rl, vec3(0.3, 0.6, 0.1)) > 0.02){
    vec2 ci = floor(vec2(vW.x, vW.z + uTravel)/1.3), cp = (ci + vec2(hashO(ci), hashO(ci + 17.0))*0.8 + 0.1)*1.3;
    vec4 sc = projectionMatrix*viewMatrix*vec4(cp.x, 0.0, cp.y - uTravel, 1.0);
    vec2 sp = abs((sc.xy/sc.w*0.5 + 0.5)*uRes - gl_FragCoord.xy);
    float star = (1.0 - smoothstep(0.6, 1.2, sp.y))*(1.0 - smoothstep(1.0, 3.5, sp.x)) + (1.0 - smoothstep(0.6, 1.2, sp.x))*(1.0 - smoothstep(1.0, 3.5, sp.y));
    // the bloom's high pass is a hard step at 0.60: a glint waxing past it would pop into the glow in one frame, so it
    // only lifts a pixel up to 0.58 and adds nothing where the reflection is brighter than that already
    vec3 gl = rl*star*smoothstep(0.55, 1.0, sin(uTime*1.7 + hashO(ci + 3.0)*6.283))*0.9*uReflOn*(1.0 - far);
    col += gl*clamp((0.58 - dot(col, vec3(0.299, 0.587, 0.114)))/max(dot(gl, vec3(0.299, 0.587, 0.114)), 1e-4), 0.0, 1.0);
  }
#else
  // ...and draws the wave crests: a thin contour of the detail height on the slope that leans toward the camera (so an
  // arc on the near side of each crest, not a ring), 1.5 px by fwidth, fading out where the arcs would crowd
  vec2 toCam = normalize(cameraPosition.xz - vW.xz);
  float hw = fwidth(dt.z);
  float crest = (1.0 - smoothstep(0.0, hw*1.5, abs(dt.z - 0.052)))*(1.0 - smoothstep(0.003, 0.008, hw))*smoothstep(0.0, 0.25, fres)*smoothstep(0.0, 0.05, dot(-dt.xy, toCam));
  col = mix(col, vec3(0.34, 0.40, 0.52)*(0.6 + 0.4*uFleetGlow), crest*0.55*uToon);
#endif
  // her bonfire's highlight widens with the same variance (Toksvig) and keeps its energy, so far off it spreads and dims
  // instead of sparkling across the bloom threshold
  vec3 L = uLampPos - vW; float ld = length(L.xz);
  float sp = 50.0/(1.0 + 50.0*var), lspec = pow(max(dot(r, normalize(L)), 0.0), sp)*(sp + 2.0)/52.0;
  col += uLamp*vec3(1.0, 0.55, 0.24)*(0.09*exp(-ld/6.0) + 0.42*lspec*exp(-ld/40.0));
  vec2 q = (vW.xz - uFleetC)/uFleetR;
  float inside = 1.0 - smoothstep(0.55, 1.25, length(q));
  col += uFleetGlow*inside*vec3(1.0, 0.56, 0.24)*(0.010 + 0.09*fres);
  col += vec3(1.0, 0.70, 0.42)*uFlash*0.05*(0.3 + fres);
  // the foam, broken up by noise that drifts with the water: moonlit grey in 写实, flat white with an antialiased edge in
  // 二次元, which also draws the rings as contours of their height every 0.03 (1.4 px, only where they stand up, fading
  // where they would crowd). Fixed colours laid over the lights, so a flash never takes them past the bloom threshold.
#if RISING
  float ph = rip.x/0.03, pw = fwidth(ph), ffw = max(fwidth(rip.w), 1e-3);
  float rline = (1.0 - smoothstep(0.0, pw*1.4, abs(fract(ph + 0.5) - 0.5)))*smoothstep(0.008, 0.025, abs(rip.x))*(1.0 - smoothstep(0.3, 0.6, pw));
  col = mix(col, vec3(0.26, 0.29, 0.35), clamp(rip.w*0.9, 0.0, 1.0)*(1.0 - uToon));
  col = mix(col, vec3(0.48, 0.51, 0.56), max(smoothstep(0.32 - ffw, 0.32 + ffw, rip.w), rline*0.85)*uToon);
#endif
  gl_FragColor = vec4(mix(col, uFogColor, fogF(dist, uFogDensity)), 1.0);
}
