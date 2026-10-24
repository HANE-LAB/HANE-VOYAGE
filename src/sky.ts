import * as THREE from 'three';
import { mulberry32, NSTAR } from './data';
import { renderer, scene } from './renderer';
import { BAND_N, E1, E2, U, V3, pick } from './uniforms';
import { milkywayVert, milkywayFrag, skyVert, skyFrag, starsVert, starsFrag } from './shaders';

/* ---------- Milky Way, rendered once into an equirectangular texture ---------- */
// Drawn again when the browser gives back a lost WebGL context: three.js restores its own state, not what was drawn
// into a target, and the band was gone from the sky and the sea (until 2026-10-24).
{
  const mwRT = new THREE.WebGLRenderTarget(2048, 1024, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, wrapS:THREE.RepeatWrapping, wrapT:THREE.ClampToEdgeWrapping, depthBuffer:false });
  const bake = () => {
    const s = new THREE.Scene(), c = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.ShaderMaterial({
      uniforms:{ uN:{value:BAND_N}, uE1:{value:E1}, uE2:{value:E2} }, depthTest:false, depthWrite:false,
      vertexShader: milkywayVert,
      fragmentShader: milkywayFrag
    }));
    const prev = renderer.getRenderTarget();
    s.add(m); renderer.setRenderTarget(mwRT); renderer.render(s, c); renderer.setRenderTarget(prev);
    m.geometry.dispose(); m.material.dispose();
  };
  bake();
  U.tMW.value = mwRT.texture;
  // three.js listens first (it was made first), so its state is back when this runs
  renderer.domElement.addEventListener('webglcontextrestored', bake);
}

/* ---------- sky ---------- */
export const skyGroup = new THREE.Group(); scene.add(skyGroup);
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({
  uniforms: pick('uZenith','uHorizon','uBand','tMW','uFleetGlow','uFleetDir','uFogColor','uEnv','uToon'), side:THREE.BackSide, depthWrite:false,
  vertexShader: skyVert,
  fragmentShader: skyFrag
}));
sky.renderOrder = -2; skyGroup.add(sky);

/* ---------- stars = followers, most of them along the Milky Way ---------- */
{
  const rs = mulberry32(77);
  const pos = new Float32Array(NSTAR*3), idx = new Float32Array(NSTAR), mag = new Float32Array(NSTAR);
  const d = new V3();
  for(let i=0;i<NSTAR;i++){
    for(;;){
      if (rs() < 0.62){
        const lon = rs()*Math.PI*2;
        const g = Math.sqrt(-2*Math.log(Math.max(1e-6, rs())))*Math.cos(2*Math.PI*rs());
        const b = g*0.11;
        d.copy(E1).multiplyScalar(Math.cos(lon)).addScaledVector(E2, Math.sin(lon)).multiplyScalar(Math.cos(b)).addScaledVector(BAND_N, Math.sin(b));
      } else {
        const u = rs()*2 - 1, a = rs()*Math.PI*2, r = Math.sqrt(1 - u*u); d.set(r*Math.cos(a), u, r*Math.sin(a));
      }
      if (d.y > 0.02) break;
    }
    pos[i*3] = d.x*900; pos[i*3+1] = d.y*900; pos[i*3+2] = d.z*900;
    idx[i] = i; mag[i] = Math.pow(rs(), 3.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('aIdx', new THREE.BufferAttribute(idx,1));
  g.setAttribute('aMag', new THREE.BufferAttribute(mag,1));
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: pick('uStarCount','uTime','uPR','uToon'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader: starsVert,
    fragmentShader: starsFrag
  }));
  stars.frustumCulled = false; stars.renderOrder = -1; skyGroup.add(stars);
}
