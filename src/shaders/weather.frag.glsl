varying vec4 vCol; varying float vRot; varying float vTilt; varying float vKind;
// premultiplied: fireflies add their light (alpha 0); petals, leaves and snow cover what is behind them
void main(){
  vec2 q = gl_PointCoord*2.0 - 1.0;
  if (vKind > 0.5 && vKind < 1.5){
    float r = length(q); if (r > 1.0) discard;
    float g = pow(1.0 - r, 2.2) + 0.6*smoothstep(0.3, 0.0, r);
    gl_FragColor = vec4(vCol.rgb*g*vCol.a, 0.0);
    return;
  }
  float c = cos(vRot), s = sin(vRot);
  q = vec2(c*q.x - s*q.y, s*q.x + c*q.y);
  // a petal or a leaf is an ellipse that turns edge-on now and then as it tumbles; snow is round
  vec2 e = vKind > 2.5 ? q : vec2(q.x/max(vTilt, 0.2), q.y*(vKind < 0.5 ? 1.6 : 1.25));
  float m = 1.0 - smoothstep(0.55, 1.0, length(e));
  if (m <= 0.0) discard;
  gl_FragColor = vec4(vCol.rgb*m*vCol.a, m*vCol.a);
}
