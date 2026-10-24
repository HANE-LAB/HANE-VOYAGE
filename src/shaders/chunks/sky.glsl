uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uBand; uniform sampler2D tMW; uniform float uFleetGlow; uniform vec3 uFleetDir; uniform vec4 uEnv; uniform float uToon;
// 二次元: the surroundings lose most of their colour (uEnv in src/uniforms.ts), as P3R's backgrounds fade while the cast stays vivid
vec3 envGrade(vec3 c){ return mix(c, mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uEnv.x)*uEnv.yzw, uToon); }
vec3 mwAt(vec3 d){ vec2 uv = vec2(atan(d.z, d.x)*0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0))*0.31830989 + 0.5); return texture2D(tMW, uv).rgb; }
vec3 skyColor(vec3 d){
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
  col += vec3(0.018, 0.024, 0.036)*exp(-abs(h)*24.0);
  col += mwAt(d)*uBand*smoothstep(-0.03, 0.16, h);
  col = envGrade(col);   // the fleet's warm glow below is light from the ships, so it keeps its colour
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float toward = pow(max(dot(dh, normalize(uFleetDir.xz + vec2(1e-5))), 0.0), 2.5);
  col += vec3(1.0, 0.52, 0.22)*uFleetGlow*toward*exp(-max(h, 0.0)*7.0)*0.10;
  return col;
}
