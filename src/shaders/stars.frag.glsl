varying float vA; varying float vStar;
void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q)*2.0; if(r>1.0) discard;
  float a = smoothstep(1.0,0.1,r);
  // bright stars become four-pointed sparkles in the 二次元 style
  vec2 aq = abs(q)*2.0;
  float rays = max((1.0 - smoothstep(0.0, 0.09, aq.x))*(1.0 - aq.y), (1.0 - smoothstep(0.0, 0.09, aq.y))*(1.0 - aq.x));
  float core = smoothstep(0.38, 0.0, r);
  a = mix(a, max(core, rays*0.85), vStar);
  gl_FragColor = vec4(vec3(0.86,0.90,1.0)*a*vA, 1.0); }
