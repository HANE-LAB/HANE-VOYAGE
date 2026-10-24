varying float vA; varying vec3 vCol;
void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q)*2.0; if (r > 1.0) discard;
  float core = smoothstep(0.45, 0.0, r); float halo = pow(1.0 - r, 2.0);
  vec3 c = vCol*halo*0.7 + mix(vCol, vec3(1.0, 0.95, 0.85), 0.6)*core;
  gl_FragColor = vec4(c*vA, 1.0); }
