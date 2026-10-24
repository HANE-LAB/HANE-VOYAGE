// Surface-stable fractal hatching (二次元, 2026-10-22). Strokes lie in the object's own frame, so they never slide on
// it; they are about 1.2 px wide on screen and keep a spacing of 7 to 14 px at any distance. The spacing comes from
// the screen derivative of the stroke coordinate (fwidth): the coarsest level whose strokes are at least 7 px apart
// is drawn in full, and when its spacing passes 14 px the next finer level fades in midway between its strokes.
// The levels share positions (every coarse stroke is also a fine stroke), so nothing jumps, and a surface that
// shrinks on screen loses strokes smoothly until the caller fades the whole thing to flat colour.
//   u   stroke coordinate (object units); fw = fwidth(u), clamped above zero
float hatchLines(float u, float fw){
  float L = log2(7.0*fw);               // level: spacing 2^ceil(L) is the coarsest at least 7 px apart
  float k = ceil(L), s = exp2(k);
  float w = exp2(k - L) - 1.0;          // 0 when that spacing is 7 px, 1 when it is 14 px (and the finer level is fully in)
  float dc = abs(fract(u/s + 0.5) - 0.5)*s/fw;         // distance to the nearest coarse stroke, in px
  float df = abs(fract(u/s*2.0 + 0.5) - 0.5)*s*0.5/fw; // ...and to the nearest fine stroke
  float lc = 1.0 - smoothstep(0.6, 1.5, dc), lf = 1.0 - smoothstep(0.6, 1.5, df);
  return max(lc, w*lf);
}
// two diagonal stroke directions on a surface patch, with a slight hand wobble; the second only where `cross` asks
float hatch(vec2 p, float cross){
  float u1 = (p.x + p.y)*0.7071 + 0.012*sin(p.y*41.0 - p.x*29.0), u2 = (p.x - p.y)*0.7071 + 0.012*sin(p.x*37.0 + p.y*31.0);
  float h = hatchLines(u1, max(fwidth(u1), 1e-6));
  return max(h, cross*hatchLines(u2, max(fwidth(u2), 1e-6)));
}
// the surface patch: the object-space position projected along the face's dominant axis
vec2 hatchPatch(vec3 p, vec3 n){ vec3 an = abs(n); return an.x > an.y && an.x > an.z ? p.zy : (an.y > an.z ? p.xz : p.xy); }
