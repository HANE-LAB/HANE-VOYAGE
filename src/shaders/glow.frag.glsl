varying vec4 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q)*2.0; if (r > 1.0) discard;
float a = pow(1.0 - r, 2.0); float core = smoothstep(0.35, 0.0, r);
gl_FragColor = vec4((vC.rgb*(a + core*0.5) + vec3(1.0, 0.95, 0.85)*core*0.22)*vC.a, 1.0); }
