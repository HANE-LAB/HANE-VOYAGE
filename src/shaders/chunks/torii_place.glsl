// each gate rises out of the sea a little ahead of her bow, so nothing ever cuts through a hull; 9.50 is TORII_W in src/torii.ts.
// The including shader sets pos, the shape in gate units. It starts 1.10 of its height down, its top 0.95 under the mean
// sea (1.15 for a year gate): the swell's troughs reach 0.60, and at 1.03 the top beam showed through one in the frame
// the gate began to be drawn. 1.10 is also in src/rise.ts (BEAM_AT), riseFx.vert.glsl, deco.vert.glsl, feather.vert.glsl.
float rise = smoothstep(-12.0, -5.5, aT.w);
vec3 w = vec3(aT.x + pos.x*9.50, pos.y*aT.z - (1.0 - rise)*aT.z*1.10, aT.y + pos.z*9.50);
