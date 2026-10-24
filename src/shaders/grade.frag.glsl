uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uExposure; uniform float uToon; uniform sampler3D tLut; uniform sampler2D tBloom; varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
void main(){
  vec4 b = texture2D(tBloom, vUv);   // the glow, added as r128's blend did: rgb x alpha
  vec3 c = aces((texture2D(tDiffuse, vUv).rgb + b.rgb*b.a)*uExposure);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += vec3(-0.004, 0.0, 0.012)*(1.0 - l) + vec3(0.010, 0.004, -0.008)*l;
  vec2 q = vUv - 0.5; q.x *= uRes.x/uRes.y;
  c *= 1.0 - 0.38*smoothstep(0.35, 1.05, length(q));
  // 二次元: the colour edit is a 33³ lookup table baked in src/post.ts (toonGrade), indexed by the square root of each channel
  c = mix(c, texture(tLut, sqrt(max(c, 0.0))*(32.0/33.0) + 0.5/33.0).rgb, uToon);
  c += (hash(vUv*uRes + fract(uTime)*97.0) - 0.5)*0.022*(1.0 - 0.6*uToon);
  gl_FragColor = vec4(c, 1.0);
}
