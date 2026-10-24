import * as THREE from 'three';
import { scene } from './renderer';
import { FS, pick } from './uniforms';
import { crestVert, crestFrag } from './shaders';

/* ---------- a feather crest on her sail, so her ship reads as hers ---------- */
const crestCanvas = document.createElement('canvas'); crestCanvas.width = crestCanvas.height = 256;
{
  const g = crestCanvas.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = '#b8321f'; g.lineWidth = 13; g.beginPath(); g.arc(128, 128, 106, 0, Math.PI*2); g.stroke();
  g.save(); g.translate(128, 132); g.rotate(-0.5);
  g.fillStyle = '#c8402a';
  g.beginPath(); g.moveTo(0, 84); g.bezierCurveTo(-40, 40, -42, -42, 0, -90); g.bezierCurveTo(32, -42, 36, 40, 0, 84); g.fill();
  g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.lineWidth = 4;
  for (let i = 0; i < 5; i++){ const y = -52 + i*24; g.beginPath(); g.moveTo(-2, y); g.lineTo(-44, y - 22); g.stroke(); g.beginPath(); g.moveTo(2, y + 6); g.lineTo(44, y - 14); g.stroke(); }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = '#7a1c10'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 106); g.quadraticCurveTo(5, 0, 0, -88); g.stroke();
  g.restore();
}
export const crest = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: Object.assign(pick('uMirror','uLamp','uLampPos','uFogColor','uFogDensity'), { tCrest:{ value:new THREE.CanvasTexture(crestCanvas) } }), side:THREE.DoubleSide,
  vertexShader: crestVert,
  fragmentShader: crestFrag
}));
crest.frustumCulled = false; crest.scale.setScalar(0.30*FS); scene.add(crest);

/* ---------- where she and Kobuta stand (src/figures.ts) ---------- */
// At her bow, facing forward (+z, toward 回望): x, y (the deck there) and z in ship units (the hull is 1 long, its bow
// toward +z), and how tall, in ship units too (FS world units each). Her head and her hand raised in 挥手 stay under 5.6
// on the highest swell (0.6), where the year gates' paper streamers and the winter icicles hang (src/torii.ts).
// The redone ship sets these.
export const BOW = { hinome:{ x:0.05, y:0.135, z:0.19, h:0.32 }, kobuta:{ x:0.17, y:0.135, z:0.21, h:0.19 } };
