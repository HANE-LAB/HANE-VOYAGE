#include <voyage/fog>
uniform float uTravel; uniform float uFogDensity; varying vec2 vUV; varying float vS; varying vec3 vW;
void main(){
  float u = vUV.x, v = vUV.y;
  // With MSAA, a pixel that the thin strip only partly covers still reads vUV at the pixel centre, outside the strip.
  // Past the end, pow() of a negative base gives NaN, which bloom smeared into black dashes; past the sides, the
  // wake would subtract light. Both factors are kept at zero or above.
  float a = pow(max(1.0 - v, 0.0), 1.7)*max(1.0 - u*u, 0.0)*smoothstep(0.0, 0.05, v);
  a *= 0.55 + 0.45*sin(u*7.0 + (vW.z + uTravel)*1.6);
  a *= 0.07*vS;
  vec3 c = mix(vec3(1.0, 0.66, 0.36), vec3(0.55, 0.68, 0.85), smoothstep(0.0, 0.5, v));
  gl_FragColor = vec4(c*a*(1.0 - fogF(length(vW - cameraPosition), uFogDensity)), 1.0);
}
