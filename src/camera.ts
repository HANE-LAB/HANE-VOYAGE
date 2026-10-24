import type { Vector3 } from 'three';
import { PR, camera, canvas, reduceMotion } from './renderer';
import { TOON_KEYS, U, V3 } from './uniforms';
import { skyGroup } from './sky';
import { S0, clock, setVmax, worldX, xPath, type FleetLayout } from './formation';
import { FW_ALT, fwLift } from './fx';

/* =====================================================================
   CAMERA
   ===================================================================== */
export const VIEWS = [ { name:'回望', fov:34 }, { name:'俯瞰', fov:40 }, { name:'远望', fov:30 } ];
export const cam = { view:0, userAz:0, userEl:0, zoom:1 };
export const camC = new V3(20, 6, 30), camT = new V3(0, 0, -20);
let camFov = 32;
// canvas height plus the view offset under the dock; resize() sets it
export let fullH = 1;
export const setFullH = (h: number) => { fullH = h; };
// the lowest canvas row the scene's key action may use, just above the dock, and the highest, below the readout on a
// tall screen (0 otherwise); resize() sets them
let safeBottom = 1e9;
export let safeTop = 0;
export const setSafeBottom = (y: number) => { safeBottom = y; };
export const setSafeTop = (y: number) => { safeTop = y; };
// 回望 on a wide screen: each gate breaks the surface a little ahead of her bow (src/rise.ts), close to the camera and
// low in the frame, where a short window puts it behind the dock. The near end of the top beam's water line is brought
// just above the dock: first the view turns down, at most TILT (more pushes the sky out at 1280×720), then it widens for
// the rest, keeping its aim (widening alone shrank the front gate by a third at 1280×720). Where the line already shows
// (a tall window) nothing changes; at most 16° wider. Turns T down in place and returns the field of view.
const BREAK_S = -10.33;   // where the top beam comes out: smoothstep(-12, -5.5, S) = 1 - 0.92/1.10 (src/rise.ts)
const TILT = 3*Math.PI/180;
function clearDock(C: Vector3, T: Vector3, fov: number){
  const vo = camera.view?.enabled ? camera.view.offsetY : 0;
  const room = 2*(safeBottom + vo)/fullH - 1;   // how far below the view's axis the dock's edge is, in the full view's NDC
  if (room < 0.1) return fov;
  const P = new V3(xPath(BREAK_S) + 6, 0, -BREAK_S + 0.6);
  const d = T.clone().sub(C), dist = d.length(); d.divideScalar(dist);
  const right = new V3().crossVectors(d, new V3(0, 1, 0)).normalize(), up = new V3().crossVectors(right, d);
  const v = P.sub(C), below = -Math.atan2(v.dot(up), v.dot(d));   // the water line's angle under the axis
  const fits = Math.atan(room*Math.tan(fov*Math.PI/360));          // ...and the most it may be
  if (below <= fits) return fov;
  const tilt = Math.min(TILT, below - fits);
  T.copy(C).addScaledVector(d, Math.cos(tilt)*dist).addScaledVector(up, -Math.sin(tilt)*dist);
  return Math.min(fov + 16, Math.max(fov, 2*Math.atan(Math.tan(below - tilt)/room)*180/Math.PI));
}
function camBase(view: number, Lv: number){
  const fx = xPath(0), portrait = camera.aspect < 0.9;
  if (view === 0){
    // from ahead of her starboard bow, looking back down the column; she sits in the lower left
    // the camera sits just above the torii tops, so the gates read as a corridor instead of looming over everything
    const Sl = S0 + Math.min(85, Math.max(30, 0.42*Lv)), side = portrait ? 0.4 : 1;
    return { T:new V3(worldX(Sl) + 3*side, 1.2, -Sl), C:new V3(fx + (12 + 0.02*Lv)*side, 10.5 + 0.012*Lv, (38 + 0.06*Lv)*(portrait ? 1.25 : 1)) };
  }
  if (view === 1){
    // three-quarter view from high on her starboard side: the whole feather and its torii spine
    const Sm = S0 + 0.45*Lv, T = new V3(worldX(Sm), 0, -Sm), D = 1.1*Lv + 40;
    return { T, C:T.clone().add(new V3(0.662*D, 0.581*D, 0.474*D)) };
  }
  const Se = S0 + Lv*1.1 + 12;
  return { T:new V3(fx, 1.5, 0), C:new V3(worldX(Se) + 0.06*Lv + 2, 3.0 + 0.03*Lv, -Se) };
}
// the ship the viewer picked (src/names.ts): the view turns on it from the same side, as near as its size (r) calls for
export const camFocus = { on:false, P:new V3(), r:1, el:0.44 };
// where the camera settles in the current view, lifted toward fireworks by lift (0 to 1), turned by sway (its slow drift)
function aim(fl: FleetLayout, lift: number, sway: number){
  const b = camBase(cam.view, fl.Lv);
  if (camFocus.on){
    // looking down on it at el or more, so the ships round it (or the gates over the rachis) do not stand in the way
    const d = b.C.clone().sub(b.T).normalize(), el = Math.max(Math.asin(d.y), camFocus.el), hz = Math.hypot(d.x, d.z);
    d.set(d.x/hz*Math.cos(el), Math.sin(el), d.z/hz*Math.cos(el));
    b.T.copy(camFocus.P); b.C.copy(b.T).addScaledVector(d, 9 + 5*camFocus.r);
  }
  const V = b.C.clone().sub(b.T), r0 = V.length(), r = r0*cam.zoom;
  const az = Math.atan2(V.x, V.z) + cam.userAz + sway;
  const el = Math.max(0.03, Math.min(1.45, Math.asin(Math.max(-1, Math.min(1, V.y/r0))) + cam.userEl));
  const C = new V3(b.T.x + r*Math.cos(el)*Math.sin(az), Math.max(1.2, b.T.y + r*Math.sin(el)), b.T.z + r*Math.cos(el)*Math.cos(az));
  // when fireworks go up, the camera tilts up and widens a little to take them in
  let fov = VIEWS[cam.view].fov + (camera.aspect < 0.9 ? 8 : 0) + lift*10;
  // 俯瞰 looks down from far off, so it tilts by its distance: the fleet moves into the lower half and dark sea takes the top
  const T = b.T.clone().setY(b.T.y + lift*(cam.view === 1 ? 0.2*r : FW_ALT(fl.Lv)*0.5));
  // only the view as composed: once the viewer drags or zooms, the camera is theirs
  if (cam.view === 0 && !cam.userAz && !cam.userEl && cam.zoom === 1 && !camFocus.on) fov = clearDock(C, T, fov);
  return { C, T, fov, r };
}
// Where a firework bursts and how tall it stands (world units), for the view the camera is lifting into. It stands in
// the sky between the readout (on a phone; the top edge otherwise) and the horizon, or over the top 55% of the view
// where the horizon is off it or low (俯瞰, with the fleet below): its top a twelfth of that band down, its height 0.8
// of the band, and at most half the screen's width, as a head is wider than tall. On a wide screen it stands right of
// centre, as the readout takes the top left. There are three such places [x, size] (src/fx.ts gives each head a free
// one): the second and third left and right of the first, smaller (on a phone much smaller), so three heads at once
// still read. Place 3 is a round shell anywhere in the band, at u across and v down (0 to 1), smaller still.
// Shells burst as far off as the view's target, and never lower than 0.6 of FW_ALT. Before 2026-10-23 they burst over
// the fleet's far half: out of sight in 远望, behind the readout on a phone, cut by the top edge in 俯瞰, which did not
// lift; the first heads stood over the fleet, whose lights washed out their faces.
const FW_PLACES = [[[0.58, 1], [0.36, 0.8], [0.8, 0.8]], [[0.5, 1], [0.25, 0.6], [0.75, 0.6]]];
export function fwSpot(fl: FleetLayout, place: number, u: number, v: number){
  const { C, T, fov } = aim(fl, 1, 0);
  const c = camera.clone(); c.fov = fov; c.position.copy(C); c.lookAt(T); c.updateProjectionMatrix(); c.updateMatrixWorld();
  const w = canvas.clientWidth, h = canvas.clientHeight, fwd = T.clone().sub(C), D = fwd.length(); fwd.divideScalar(D);
  const far = new V3(fwd.x, 0, fwd.z).normalize().multiplyScalar(5000).add(C).setY(0).project(c);
  const horizon = (1 - far.y)*h/2 - 8, bottom = Math.min(safeBottom, h);
  const band = horizon > safeTop + 0.35*(bottom - safeTop) && horizon < bottom ? horizon - safeTop : 0.55*(bottom - safeTop);
  const tall = Math.min(band*0.8, w*0.5), portrait = camera.aspect < 0.9;
  const [fx, size] = place < 3 ? FW_PLACES[portrait ? 1 : 0][place] : [portrait ? 0.15 + 0.7*u : 0.34 + 0.58*u, 0.55 + 0.3*v];
  const x = w*fx, y = safeTop + (place < 3 ? band/12 + tall/2 : band*(0.22 + 0.4*v));
  const ray = new V3(2*x/w - 1, 1 - 2*y/h, 0.5).unproject(c).sub(C).normalize();
  let t = D/ray.dot(fwd);
  const low = 0.6*FW_ALT(fl.Lv);
  if (C.y + ray.y*t < low && ray.y < 0) t = (C.y - low)/-ray.y;
  return { P: C.clone().addScaledVector(ray, t), H: size*tall*2*t*ray.dot(fwd)*Math.tan(fov*Math.PI/360)/fullH };
}
// a fixed camera for reviewing the ship models (fleetLineup in main.ts)
export const camPin = { on:false, C:new V3(), T:new V3(), fov:30 };
export function updateCamera(dt: number, fl: FleetLayout, snap: boolean){
  let { C, T, fov: wantFov, r } = aim(fl, fwLift, reduceMotion || cam.view === 1 ? 0 : Math.sin(clock*0.05)*0.04);
  if (camPin.on){ C = camPin.C; T = camPin.T; wantFov = camPin.fov; snap = true; }
  const k = snap ? 1 : Math.min(1, dt*1.4);
  camC.lerp(C, k); camT.lerp(T, k);
  camFov += (wantFov - camFov)*(snap ? 1 : Math.min(1, dt*2));
  camera.fov = camFov; camera.updateProjectionMatrix();
  camera.position.copy(camC); camera.lookAt(camT); camera.updateMatrixWorld();
  skyGroup.position.copy(camC);
  U.uPx.value = (fullH*PR)/(2*Math.tan(camFov*Math.PI/360));
  // each view has its own fixed cel key (as each cut of an anime gets its own light setting); it only eases over on a view change
  U.uKeyT.value.lerp(TOON_KEYS[cam.view], snap ? 1 : Math.min(1, dt*1.5)).normalize();
  U.uFogDensity.value = 1/(1.5*fl.Lv + 230 + (cam.view === 1 ? r*0.8 : 0));
  if (!camFocus.on) setVmax(8 + camC.distanceTo(camT)*0.12);   // a ship picked up close does not slow the fleet's traffic
}
