import * as THREE from 'three';
import { NDAYS } from './data';

export const FS = 4.6;                       // flagship scale
export const SCALE_BY_LEVEL = [1, 2.3, 1.6, 1.0];
export const ANON_SCALE = 0.9;
export const KT = 0.3;                       // how far the fleet sails per day, for passing the torii
export const RIP_N = 160, RIP_W = 40;        // the ripple texture round a rising gate: texels, world units (src/rise.ts)
export const V3 = THREE.Vector3;

// Milky Way plane: rises from the horizon behind the fleet and arches overhead
export const BAND_N = new V3(), E1 = new V3(), E2 = new V3();
{ const a = new V3(-0.25, 0.08, -1).normalize(), b = new V3(0.55, 1, 0.35).normalize(); BAND_N.crossVectors(a, b).normalize(); E1.copy(a); E2.crossVectors(BAND_N, E1).normalize(); }

// art style: 'toon' (二次元, cel shading + ink lines) or 'real' (写实); rank colours for the sail crests (placeholder palette)
export let STYLE = 'toon';
try { STYLE = localStorage.getItem('hane-voyage-style') === 'real' ? 'real' : 'toon'; } catch(e){}
export const setStyleName = (s: string) => { STYLE = s; };
// 二次元 lighting follows the GGXrd rule (GDC 2015): light vectors are fixed and chosen per shot, never taken from moving lights,
// so a shadow edge can only sit on a geometric edge. uKeyT is the torii key for the current view; ships carry their own key in model space.
// Fronts and backs of a gate are both lit (see toriiToon); the key decides which side face is in shade.
// 回望 and 远望 see the right sides, so those stay in shade for two tones; 俯瞰 looks down on the right sides from far off, so it lights them.
export const TOON_KEYS = [new V3(-0.46, 0.30, 0.84).normalize(), new V3(0.55, 0.45, 0.70).normalize(), new V3(-0.42, 0.30, 0.86).normalize()];

export const U = {
  uTime:{value:0}, uTravel:{value:0}, uDay:{value:NDAYS-1}, uMirror:{value:1},
  uFogColor:{value:new THREE.Color(0.056,0.077,0.128)}, uFogDensity:{value:0.003},
  uZenith:{value:new THREE.Color(0.008,0.011,0.032)}, uHorizon:{value:new THREE.Color(0.040,0.056,0.098)},
  uBand:{value:1}, tMW:{value:null as THREE.Texture | null},
  uFleetGlow:{value:0.5}, uFleetDir:{value:new V3(0,0,-1)}, uFleetC:{value:new THREE.Vector2(0,-20)}, uFleetR:{value:new THREE.Vector2(10,20)}, uFleetS:{value:new THREE.Vector2(5,20)},
  uLamp:{value:1}, uLampPos:{value:new V3(0,0.42*FS,0.5*FS)}, uFlash:{value:0},
  uPx:{value:800}, uPR:{value:1}, uStarCount:{value:0},
  // a ship this many pixels long on screen (its scale over its distance, times uPx) starts to grow its detail, and has
  // it all at the second; under the first it is its far model (src/fleet.ts cullShips takes it into the detailed list at 20)
  uLod:{value:new THREE.Vector2(24, 40)},
  tRefl:{value:null as THREE.Texture | null}, tWave:{value:null as THREE.Texture | null},
  // a gate rising (src/rise.ts): the two newest gates' centre x, z, height and rise; seconds since each beam broke the
  // surface (w: how far the older gate has faded out); the ripple texture and its centre (z: 1 while it is drawn)
  uRiseA:{ value:[new THREE.Vector4(1e4, 1e4, 1, 0), new THREE.Vector4(1e4, 1e4, 1, 0)] }, uRiseB:{ value:[new THREE.Vector4(-1, -1, -1, -1), new THREE.Vector4(-1, -1, -1, -1)] },
  uRiseI:{ value:new THREE.Vector4(-1, -1, 0, 0) },   // which gate each of the two slots holds, and 1 if it is plain wood (src/rise.ts)
  uRiseC:{ value:new THREE.Vector2(-1, -1) },          // seconds since each slot's gate stopped rising (src/rise.ts)
  tRip:{value:null as THREE.Texture | null}, uRipC:{ value:new THREE.Vector3(1e4, 1e4, 0) }, uRes:{value:new THREE.Vector2(1,1)}, uReflOn:{value:0}, uWin:{value:new THREE.Vector2(-110,300)},
  uToon:{ value: STYLE === 'toon' ? 1 : 0 }, uLineW:{ value:2.3 }, uKeyT:{ value:TOON_KEYS[0].clone() },
  // 二次元 surroundings (sky, Milky Way, sea, fog) keep this much of their colour (x) and take this tint (yzw), as P3R's
  // backgrounds fade while the cast stays vivid; ships and gates are left as they are (src/shaders/chunks/sky.glsl envGrade)
  uEnv:{ value:new THREE.Vector4(0.37, 0.92, 0.95, 1.0) }, uCastSat:{ value:1.07 },   // ...and the ships and gates a little more
  // 二次元 edge light (GFD's "edge") on the shaded side of ships and gates: moonlight, a constant colour under the bloom threshold
  uRimC:{ value:new THREE.Color(0.52, 0.56, 0.66) },
  uSeason:{ value:new THREE.Vector4(0, 0, 1, 0) },   // how much of spring, summer, autumn and winter the day being shown has (src/seasons.ts)
  uTierK:{ value:new THREE.Color(0.28, 0.66, 1.0) },   // 舰长
  uTierT:{ value:new THREE.Color(0.72, 0.44, 1.0) },   // 提督
  uTierS:{ value:new THREE.Color(1.0, 0.78, 0.28) }    // 总督
};
// fog for each style: the 二次元 one goes through the same envGrade as the sky behind it
const FOG_REAL = U.uFogColor.value.clone(), FOG_TOON = (() => {
  const c = FOG_REAL, e = U.uEnv.value, l = 0.299*c.r + 0.587*c.g + 0.114*c.b, m = (x: number) => l + (x - l)*e.x;
  return new THREE.Color(m(c.r)*e.y, m(c.g)*e.z, m(c.b)*e.w);
})();
export const fogFor = (toon: boolean) => toon ? FOG_TOON : FOG_REAL;
// materials share these uniform objects, so setting U.x.value reaches every material that picked x
export const pick = <K extends keyof typeof U>(...k: K[]) => { const o = {} as Pick<typeof U, K>; k.forEach(n => o[n]=U[n]); return o; };

/* ---------- the swell; src/shaders/chunks/swell.glsl writes the same waves out for the GPU ---------- */
const K = [[0.100,0.035,0.30,0.60,0.0],[-0.055,0.138,0.19,0.80,1.7],[0.200,-0.160,0.11,1.10,4.1]];
export const swellJS = (x: number, z: number) => { const pz = z + U.uTravel.value, tm = U.uTime.value; let h = 0; for(const k of K) h += k[2]*Math.sin(x*k[0] + pz*k[1] - tm*k[3] + k[4]); return h; };
