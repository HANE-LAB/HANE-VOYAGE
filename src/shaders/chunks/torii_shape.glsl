// What this month's gate wears, from aDeco (src/torii.ts): x 0 plain wood / 1 vermilion / 2 vermilion with fire feathers,
// y season 1 to 4 (4 winter), z 1 on year gates. aPart: 0 vermilion, 1 black lacquer, 2 snow, 3 shimenawa,
// 4 an icicle's root and 5 + 10 x its length an icicle's tip.
attribute vec4 aT; attribute float aPart; attribute vec4 aDeco; uniform float uPx;
// parts this gate does not wear are dropped (the caller moves them off screen)
bool toriiWears(){ return aPart < 1.5 || (abs(aPart - 3.0) < 0.5 ? aDeco.z > 0.5 : aDeco.y > 3.5); }
vec3 toriiShape(vec3 p){
  // plain wood gates have a straight top beam (神明鳥居); the icicles under it come along
  if (aDeco.x < 0.5 && (p.y > 0.886 || (aPart > 3.5 && p.y > 0.80))) p.y -= 0.075*pow(min(abs(p.x)/0.64, 1.0), 2.4);
  // icicles grow in only while the gate stands taller than 70 to 140 px on screen, so none ever thins to a crawling line
  if (aPart > 4.5) p.y += (aPart - 5.0)*0.1*(1.0 - smoothstep(70.0, 140.0, uPx*aT.z/max(length(vec3(aT.x, 0.5*aT.z, aT.y) - cameraPosition), 0.1)));
  return p;
}
// unpainted wood for the plain gates, a little darker where the vermilion gate has its lacquer; chosen so the night
// tones of toriiToon leave it wood brown, not mauve
vec3 toriiColor(vec3 c){ return aDeco.x < 0.5 && aPart < 1.5 ? (aPart < 0.5 ? vec3(0.48, 0.40, 0.21) : vec3(0.34, 0.27, 0.14)) : c; }
