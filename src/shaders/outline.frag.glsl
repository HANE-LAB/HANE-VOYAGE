#include <voyage/fog>
uniform vec3 uFogColor; uniform float uFogDensity; varying float vFade; varying vec3 vW;
void main(){ float f = max(fogF(length(vW - cameraPosition), uFogDensity), 1.0 - vFade); gl_FragColor = vec4(mix(vec3(0.02, 0.016, 0.035), uFogColor, f), 1.0); }
