import * as THREE from 'three';

type Vec = number[];
export type GroupKey = 'flag' | 'sou' | 'tei' | 'kan' | 'anon';

// smooth normals for ink outlines and cel shading (faces that share a corner push out together)
export function addOutlineNormals(g: THREE.BufferGeometry){
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), n = pos.count;
  const map = new Map<string, number>(), acc: number[] = [], idx = new Int32Array(n);
  for (let i = 0; i < n; i++){
    const k = Math.round(pos.getX(i)*1e4) + ',' + Math.round(pos.getY(i)*1e4) + ',' + Math.round(pos.getZ(i)*1e4);
    let j = map.get(k); if (j === undefined){ j = acc.length/3; map.set(k, j); acc.push(0, 0, 0); }
    idx[i] = j; acc[j*3] += nor.getX(i); acc[j*3+1] += nor.getY(i); acc[j*3+2] += nor.getZ(i);
  }
  const out = new Float32Array(n*3);
  for (let i = 0; i < n; i++){ const j = idx[i], x = acc[j*3], y = acc[j*3+1], z = acc[j*3+2], l = Math.hypot(x, y, z) || 1; out[i*3] = x/l; out[i*3+1] = y/l; out[i*3+2] = z/l; }
  g.setAttribute('aOutN', new THREE.BufferAttribute(out, 3));
}
// only closed parts get an inverted-hull outline; sails are open sheets and get their lines drawn in the shader
export function outlineGeometry(base: THREE.BufferGeometry){
  const pos = base.getAttribute('position'), on = base.getAttribute('aOutN'), sl = base.getAttribute('aSail'), pt = base.getAttribute('aPart'), fr = base.getAttribute('aFar');
  const P: number[] = [], N: number[] = [], A: number[] = [], F: number[] = [];
  for (let t = 0; t < pos.count; t += 3){
    if (sl && sl.getX(t) >= 0) continue;
    for (let k = 0; k < 3; k++){ const i = t + k; P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); N.push(on.getX(i), on.getY(i), on.getZ(i)); if (pt) A.push(pt.getX(i)); if (fr) F.push(fr.getX(i), fr.getY(i), fr.getZ(i)); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aOutN', new THREE.Float32BufferAttribute(N, 3));
  if (pt) g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  if (fr) g.setAttribute('aFar', new THREE.Float32BufferAttribute(F, 3));
  return g;
}
/* =====================================================================
   BUILDER: low-poly parts as flat-shaded triangles with a colour, a glow (0 solid, 0.35 a deck house's paper wall,
   0.5 a paper sail, 1 a light) and, for paper, its own uv. A ship's detailed model (src/ships.ts) also gives every
   vertex the place it shrinks to (aFar) when the ship is too small on screen for the detail: set `far` to map positions
   while emitting a part, or pass the far corners to triF. Models that never shrink carry no aFar.
   ===================================================================== */
export class Builder {
  P: number[] = []; C: number[] = []; G: number[] = []; S: number[] = []; F: number[] = [];
  far: ((p: Vec) => Vec) | null = null; morph = false;
  tri(a: Vec, b: Vec, c: Vec, col: Vec, glow?: number, ua?: Vec, ub?: Vec, uc?: Vec){
    const f = this.far;
    this.triF(a, b, c, f ? f(a) : a, f ? f(b) : b, f ? f(c) : c, col, glow, ua, ub, uc);
  }
  triF(a: Vec, b: Vec, c: Vec, fa: Vec, fb: Vec, fc: Vec, col: Vec, glow?: number, ua?: Vec, ub?: Vec, uc?: Vec){
    this.P.push(...a,...b,...c); this.F.push(...fa,...fb,...fc);
    if (fa !== a || fb !== b || fc !== c) this.morph = true;
    for(let i=0;i<3;i++){ this.C.push(col[0],col[1],col[2]); this.G.push(glow||0); }
    if (ua) this.S.push(ua[0],ua[1],ub![0],ub![1],uc![0],uc![1]); else this.S.push(-1,-1,-1,-1,-1,-1);
  }
  quad(a: Vec, b: Vec, c: Vec, d: Vec, col: Vec, glow?: number){ this.tri(a,b,c,col,glow); this.tri(a,c,d,col,glow); }
  // a triangle wound so its normal points away from `center`; closed parts need this for clean ink outlines
  triOut(a: Vec, b: Vec, c: Vec, col: Vec, glow: number | undefined, center: Vec){
    const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const mx=(a[0]+b[0]+c[0])/3-center[0], my=(a[1]+b[1]+c[1])/3-center[1], mz=(a[2]+b[2]+c[2])/3-center[2];
    if (nx*mx + ny*my + nz*mz < 0) this.tri(a,c,b,col,glow); else this.tri(a,b,c,col,glow);
  }
  quadOut(a: Vec, b: Vec, c: Vec, d: Vec, col: Vec, glow: number | undefined, center: Vec){ this.triOut(a,b,c,col,glow,center); this.triOut(a,c,d,col,glow,center); }
  hexa(p: Vec[], col: Vec, glow?: number){
    const c = [0,0,0]; p.forEach(q => { c[0] += q[0]/8; c[1] += q[1]/8; c[2] += q[2]/8; });
    [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]].forEach(f => this.quadOut(p[f[0]],p[f[1]],p[f[2]],p[f[3]],col,glow,c));
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: Vec, glow?: number){
    const x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2;
    this.hexa([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], col, glow);
  }
  geo(){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P,3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C,3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.G,1));
    g.setAttribute('aSail', new THREE.Float32BufferAttribute(this.S,2));
    if (this.morph) g.setAttribute('aFar', new THREE.Float32BufferAttribute(this.F,3));
    g.computeVertexNormals();
    addOutlineNormals(g);
    return g;
  }
}
