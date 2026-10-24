uniform vec3 uN; uniform vec3 uE1; uniform vec3 uE2; varying vec2 vUv;
float h13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y)*p.z); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  float a = h13(i), b = h13(i + vec3(1.0,0.0,0.0)), c = h13(i + vec3(0.0,1.0,0.0)), d = h13(i + vec3(1.0,1.0,0.0));
  float e = h13(i + vec3(0.0,0.0,1.0)), g = h13(i + vec3(1.0,0.0,1.0)), k = h13(i + vec3(0.0,1.0,1.0)), l = h13(i + vec3(1.0,1.0,1.0));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(k,l,f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a*vn(p); p = p*2.02 + vec3(3.1, 1.7, 5.3); a *= 0.5; } return s; }
void main(){
  float phi = (vUv.x - 0.5)*6.2831853, th = (vUv.y - 0.5)*3.1415927;
  vec3 d = vec3(cos(th)*cos(phi), sin(th), cos(th)*sin(phi));
  float b = dot(d, uN);
  float lon = atan(dot(d, uE2), dot(d, uE1));
  float q = (lon - 0.5)/0.8;
  float bulge = exp(-q*q);
  float w = 0.085 + 0.06*bulge;
  float core = exp(-b*b/(w*w));
  float halo = exp(-b*b/(w*w*7.0));
  float n1 = fbm(d*3.0), n2 = fbm(d*8.0 + 2.3);
  float clouds = smoothstep(0.30, 0.80, n1)*0.75 + 0.45*n2;
  float ql = (b - 0.012)/(w*0.38);
  float dust = smoothstep(0.42, 0.72, fbm(d*6.0 + vec3(5.2, 1.3, 2.7)))*exp(-ql*ql);
  vec3 col = vec3(0.16, 0.20, 0.34)*halo*0.55;
  col += mix(vec3(0.42, 0.46, 0.66), vec3(0.80, 0.66, 0.54), bulge)*core*clouds*0.9;
  col *= 1.0 - 0.82*dust;
  col += vec3(0.08, 0.06, 0.10)*halo*bulge*0.5;
  gl_FragColor = vec4(col*0.55, 1.0);
}
