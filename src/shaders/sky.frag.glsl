#include <voyage/sky>
uniform vec3 uFogColor; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); vec3 col = skyColor(d); col = mix(uFogColor, col, smoothstep(-0.015, 0.012, d.y)); gl_FragColor = vec4(col, 1.0); }
