uniform float uMirror; varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; w.y *= uMirror; gl_Position = projectionMatrix*viewMatrix*w; }
