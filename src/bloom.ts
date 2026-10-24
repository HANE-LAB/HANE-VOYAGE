import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { bloomBlurFrag, bloomCompositeFrag, bloomHighFrag, fullscreenVert } from './shaders';

// three.js r128's UnrealBloomPass (MIT licence, the three.js authors), trimmed to what this page uses: no mask,
// never the last pass, and its last step (adding the glow back over the scene) moved into the grade pass, which reads
// renderTargetsHorizontal[0]. The glow was tuned with it, and three.js's own pass has since changed in ways that show:
// half-float mips instead of 8-bit, Rec.709 instead of Rec.601 luma, new blur kernels and a blend that no longer
// multiplies by alpha. Its shaders are in src/shaders/bloom_*.glsl.
export class UnrealBloomPass extends Pass {
  static BlurDirectionX = new THREE.Vector2(1.0, 0.0);
  static BlurDirectionY = new THREE.Vector2(0.0, 1.0);
  strength: number; radius: number; threshold: number; resolution: THREE.Vector2;
  nMips = 5;
  clearColor = new THREE.Color(0, 0, 0);
  renderTargetBright: THREE.WebGLRenderTarget;
  renderTargetsHorizontal: THREE.WebGLRenderTarget[] = [];
  renderTargetsVertical: THREE.WebGLRenderTarget[] = [];
  highPassUniforms; materialHighPassFilter: THREE.ShaderMaterial;
  separableBlurMaterials: THREE.ShaderMaterial[] = [];
  compositeMaterial: THREE.ShaderMaterial; bloomTintColors: THREE.Vector3[];
  private oldClearColor = new THREE.Color(); private oldClearAlpha = 1;
  private fsQuad = new FullScreenQuad();

  constructor(resolution: THREE.Vector2, strength: number, radius: number, threshold: number){
    super();
    this.strength = strength; this.radius = radius; this.threshold = threshold;
    this.resolution = new THREE.Vector2(resolution.x, resolution.y);

    // 8-bit render targets, as in r128
    let resx = Math.round(this.resolution.x/2), resy = Math.round(this.resolution.y/2);
    this.renderTargetBright = new THREE.WebGLRenderTarget(resx, resy);
    this.renderTargetBright.texture.name = 'UnrealBloomPass.bright';
    for (let i = 0; i < this.nMips; i++){
      const h = new THREE.WebGLRenderTarget(resx, resy), v = new THREE.WebGLRenderTarget(resx, resy);
      h.texture.name = 'UnrealBloomPass.h' + i; v.texture.name = 'UnrealBloomPass.v' + i;
      this.renderTargetsHorizontal.push(h); this.renderTargetsVertical.push(v);
      resx = Math.round(resx/2); resy = Math.round(resy/2);
    }

    // luminosity high pass
    this.highPassUniforms = {
      tDiffuse: { value: null as THREE.Texture | null }, luminosityThreshold: { value: threshold }, smoothWidth: { value: 0.01 },
      defaultColor: { value: new THREE.Color(0x000000) }, defaultOpacity: { value: 0.0 },
    };
    this.materialHighPassFilter = new THREE.ShaderMaterial({ uniforms: this.highPassUniforms, vertexShader: fullscreenVert, fragmentShader: bloomHighFrag });

    // gaussian blur, one kernel per mip
    const kernelSizeArray = [3, 5, 7, 9, 11];
    resx = Math.round(this.resolution.x/2); resy = Math.round(this.resolution.y/2);
    for (let i = 0; i < this.nMips; i++){
      this.separableBlurMaterials.push(new THREE.ShaderMaterial({
        defines: { KERNEL_RADIUS: kernelSizeArray[i], SIGMA: kernelSizeArray[i] },
        uniforms: { colorTexture: { value: null }, texSize: { value: new THREE.Vector2(resx, resy) }, direction: { value: new THREE.Vector2(0.5, 0.5) } },
        vertexShader: fullscreenVert, fragmentShader: bloomBlurFrag,
      }));
      resx = Math.round(resx/2); resy = Math.round(resy/2);
    }

    // composite
    this.bloomTintColors = [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)];
    this.compositeMaterial = new THREE.ShaderMaterial({
      defines: { NUM_MIPS: this.nMips },
      uniforms: {
        blurTexture1: { value: this.renderTargetsVertical[0].texture }, blurTexture2: { value: this.renderTargetsVertical[1].texture },
        blurTexture3: { value: this.renderTargetsVertical[2].texture }, blurTexture4: { value: this.renderTargetsVertical[3].texture },
        blurTexture5: { value: this.renderTargetsVertical[4].texture },
        bloomStrength: { value: strength }, bloomRadius: { value: 0.1 },
        bloomFactors: { value: [1.0, 0.8, 0.6, 0.4, 0.2] }, bloomTintColors: { value: this.bloomTintColors },
      },
      vertexShader: fullscreenVert, fragmentShader: bloomCompositeFrag,
    });
    this.needsSwap = false;
  }

  setSize(width: number, height: number){
    let resx = Math.round(width/2), resy = Math.round(height/2);
    this.renderTargetBright.setSize(resx, resy);
    for (let i = 0; i < this.nMips; i++){
      this.renderTargetsHorizontal[i].setSize(resx, resy);
      this.renderTargetsVertical[i].setSize(resx, resy);
      this.separableBlurMaterials[i].uniforms.texSize.value = new THREE.Vector2(resx, resy);
      resx = Math.round(resx/2); resy = Math.round(resy/2);
    }
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget){
    renderer.getClearColor(this.oldClearColor);
    this.oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);

    // 1. extract the bright areas
    this.highPassUniforms.tDiffuse.value = readBuffer.texture;
    this.highPassUniforms.luminosityThreshold.value = this.threshold;
    this.fsQuad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    renderer.clear();
    this.fsQuad.render(renderer);

    // 2. blur all the mips progressively
    let inputRenderTarget = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++){
      const blur = this.separableBlurMaterials[i];
      this.fsQuad.material = blur;
      blur.uniforms.colorTexture.value = inputRenderTarget.texture;
      blur.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
      renderer.clear();
      this.fsQuad.render(renderer);
      blur.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      blur.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(this.renderTargetsVertical[i]);
      renderer.clear();
      this.fsQuad.render(renderer);
      inputRenderTarget = this.renderTargetsVertical[i];
    }

    // 3. composite all the mips
    this.fsQuad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
    renderer.clear();
    this.fsQuad.render(renderer);

    // 4. r128 blends this additively over the input (scene + rgb x alpha); here the grade pass adds it instead (tBloom),
    // which saves loading, storing and resolving the multisampled scene a second time each frame

    renderer.setClearColor(this.oldClearColor, this.oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }
}
