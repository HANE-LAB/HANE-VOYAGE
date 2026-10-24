uniform float uA; uniform float uTime; uniform float uToon;
varying vec2 vQ;
// a line at radius r0 (in the ring's units), w pixels wide whatever the distance
float ring(float r, float r0, float w){ float px = max(fwidth(r), 1e-4); return 1.0 - smoothstep(w*0.5 - 0.5, w*0.5 + 0.5, abs(r - r0)/px); }
void main(){
  float r = length(vQ)*1.6;
  // a steady ring with a white core, and a ripple that spreads from it and fades every 1.8 s; the ripple comes in from
  // nothing, so it never pops when it starts again
  float f = fract(uTime/1.8), pulse = ring(r, 1.0 + 0.5*f, 2.0)*smoothstep(0.0, 0.15, f)*pow(1.0 - f, 1.5);
  float main = ring(r, 1.0, 4.0), core = ring(r, 1.0, 1.5);
  // under the bloom threshold (0.60, a hard step) everywhere: a fading ring that crossed it would glow up in one frame
  vec3 c = mix(mix(vec3(0.68, 0.52, 0.33), vec3(0.92, 0.22, 0.15), uToon), mix(vec3(0.68, 0.52, 0.33), vec3(0.76, 0.47, 0.42), uToon), core);
  float a = max(main, pulse*0.7)*uA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(c, a);
}
