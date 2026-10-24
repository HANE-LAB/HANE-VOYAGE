// The two newest gates rising (src/rise.ts): uRiseA, their centre x and z, height and rise; uRiseB, the seconds since
// each of their three beams came out of the sea (w: how far the older gate has faded out); uRiseC, the seconds since
// each stopped rising. A gate is known by its S, which is minus its z.
uniform vec4 uRiseA[2]; uniform vec4 uRiseB[2]; uniform vec2 uRiseC;
// Seconds since height y of a gate (gate units) came out of the sea, from when its three beams came out (B, at heights
// 0.92, 0.665 and 0.43), how far it has risen (r) and when it stopped rising (c): along straight lines between the
// beams; below the lowest beam out, down to the waterline while it is rising (paused mid-rise, the water there still
// touches it); and once it has stopped, as that left each height then, plus the time since. Written out without a loop
// over the beams: as a loop it cost a laptop GPU noticeably more on every gate drawn while one was rising.
float outAge(float y, float r, vec4 B, float c){
  float yw = 1.10*(1.0 - r);   // the waterline on the gate now (torii_place.glsl)
  if (B.x < 0.0) return -1.0;
  if (y >= 0.92) return B.x;
  if (B.y < 0.0) return B.x*(y - yw)/max(0.92 - yw, 1e-3);
  if (y >= 0.665) return mix(B.y, B.x, (y - 0.665)/0.255);
  if (B.z < 0.0) return B.y*(y - yw)/max(0.665 - yw, 1e-3);
  if (y >= 0.43) return mix(B.z, B.y, (y - 0.43)/0.235);
  return c < 0.0 ? B.z*(y - yw)/max(0.43 - yw, 1e-3) : (B.z - c)*y/0.43 + c;
}
