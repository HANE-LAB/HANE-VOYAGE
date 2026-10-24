// the same three waves as K and swellJS() in src/uniforms.ts, which keep the flagship's deck on the water; change both together
uniform float uTime; uniform float uTravel;
const vec2 K1 = vec2(0.100, 0.035); const vec2 K2 = vec2(-0.055, 0.138); const vec2 K3 = vec2(0.200, -0.160);
float swellH(vec2 p){ p.y += uTravel;
  return 0.30*sin(dot(p,K1)-uTime*0.60) + 0.19*sin(dot(p,K2)-uTime*0.80+1.7) + 0.11*sin(dot(p,K3)-uTime*1.10+4.1); }
vec2 swellG(vec2 p){ p.y += uTravel;
  return 0.30*K1*cos(dot(p,K1)-uTime*0.60) + 0.19*K2*cos(dot(p,K2)-uTime*0.80+1.7) + 0.11*K3*cos(dot(p,K3)-uTime*1.10+4.1); }
