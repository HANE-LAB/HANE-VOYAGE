#include <voyage/swell>
varying vec3 vW; void main(){ vec3 p = position; p.y = swellH(p.xz); vW = p; gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0); }
