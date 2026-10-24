attribute float aIdx; attribute float aMag; uniform float uStarCount; uniform float uTime; uniform float uPR; uniform float uToon; varying float vA; varying float vStar;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv;
  float on = clamp(uStarCount - aIdx, 0.0, 1.0);
  float tw = 0.75 + 0.25*sin(uTime*(1.1 + aMag*2.3) + aIdx*0.37);
  vStar = uToon*step(0.85, aMag);
  vA = on*(0.40 + 1.3*aMag)*tw*smoothstep(0.02, 0.10, normalize(position).y);
  gl_PointSize = on > 0.0 ? (1.2 + aMag*2.6)*uPR*(1.0 + vStar*2.6*(0.85 + 0.15*tw)) : 0.0; }
