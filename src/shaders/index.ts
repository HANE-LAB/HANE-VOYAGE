import { ShaderChunk } from 'three';
import swell from './chunks/swell.glsl?raw';
import fog from './chunks/fog.glsl?raw';
import sky from './chunks/sky.glsl?raw';
import toriiPlace from './chunks/torii_place.glsl?raw';
import torii from './chunks/torii.glsl?raw';
import toriiShape from './chunks/torii_shape.glsl?raw';
import hatch from './chunks/hatch.glsl?raw';
import riseAge from './chunks/rise_age.glsl?raw';

// Shared pieces: three.js swaps `#include <voyage/...>` for these when it builds a program.
Object.assign(ShaderChunk, {
  'voyage/swell': swell,
  'voyage/fog': fog,
  'voyage/sky': sky,
  'voyage/torii_place': toriiPlace,
  'voyage/torii': torii,
  'voyage/torii_shape': toriiShape,
  'voyage/hatch': hatch,
  'voyage/rise_age': riseAge
});

export { default as bloomBlurFrag } from './bloom_blur.frag.glsl?raw';
export { default as bloomCompositeFrag } from './bloom_composite.frag.glsl?raw';
export { default as bloomHighFrag } from './bloom_high.frag.glsl?raw';
export { default as decoFrag } from './deco.frag.glsl?raw';
export { default as decoVert } from './deco.vert.glsl?raw';
export { default as crestFrag } from './crest.frag.glsl?raw';
export { default as crestVert } from './crest.vert.glsl?raw';
export { default as fullscreenVert } from './fullscreen.vert.glsl?raw';
export { default as figureFrag } from './figure.frag.glsl?raw';
export { default as figureVert } from './figure.vert.glsl?raw';
export { default as featherFrag } from './feather.frag.glsl?raw';
export { default as featherVert } from './feather.vert.glsl?raw';
export { default as fireworkVert } from './firework.vert.glsl?raw';
export { default as glowFrag } from './glow.frag.glsl?raw';
export { default as glowVert } from './glow.vert.glsl?raw';
export { default as gradeFrag } from './grade.frag.glsl?raw';
export { default as inscriptionFrag } from './inscription.frag.glsl?raw';
export { default as inscriptionVert } from './inscription.vert.glsl?raw';
export { default as lanternFrag } from './lantern.frag.glsl?raw';
export { default as lanternVert } from './lantern.vert.glsl?raw';
export { default as markFrag } from './mark.frag.glsl?raw';
export { default as markVert } from './mark.vert.glsl?raw';
export { default as milkywayFrag } from './milkyway.frag.glsl?raw';
export { default as milkywayVert } from './milkyway.vert.glsl?raw';
export { default as oceanFrag } from './ocean.frag.glsl?raw';
export { default as oceanVert } from './ocean.vert.glsl?raw';
export { default as outlineFrag } from './outline.frag.glsl?raw';
export { default as outlineVert } from './outline.vert.glsl?raw';
export { default as plaqueFrag } from './plaque.frag.glsl?raw';
export { default as plaqueVert } from './plaque.vert.glsl?raw';
export { default as shipFrag } from './ship.frag.glsl?raw';
export { default as shipVert } from './ship.vert.glsl?raw';
export { default as skyFrag } from './sky.frag.glsl?raw';
export { default as skyVert } from './sky.vert.glsl?raw';
export { default as starsFrag } from './stars.frag.glsl?raw';
export { default as starsVert } from './stars.vert.glsl?raw';
export { default as toriiFrag } from './torii.frag.glsl?raw';
export { default as toriiVert } from './torii.vert.glsl?raw';
export { default as toriiLinesFrag } from './torii_lines.frag.glsl?raw';
export { default as toriiLinesVert } from './torii_lines.vert.glsl?raw';
export { default as vetPillarFrag } from './vet_pillar.frag.glsl?raw';
export { default as vetPillarVert } from './vet_pillar.vert.glsl?raw';
export { default as weatherFrag } from './weather.frag.glsl?raw';
export { default as weatherVert } from './weather.vert.glsl?raw';
export { default as wakeFrag } from './wake.frag.glsl?raw';
export { default as wavesFrag } from './waves.frag.glsl?raw';
export { default as ripplesFrag } from './ripples.frag.glsl?raw';
export { default as riseFxVert } from './riseFx.vert.glsl?raw';
export { default as riseFxFrag } from './riseFx.frag.glsl?raw';
export { default as wakeVert } from './wake.vert.glsl?raw';
