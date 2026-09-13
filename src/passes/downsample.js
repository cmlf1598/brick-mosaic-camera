import * as THREE from "three";
import { createFullscreenPass, FULLSCREEN_VERT, UV_UTILS } from "../core/fullscreen.js";

/**
 * Reduces the source to exactly one texel per brick.
 *
 * The averaging matters more than it looks. Point-sampling one pixel per cell
 * makes a live feed crawl badly — every brick flickers as the sample point
 * drifts across high-frequency detail. So each output texel must be the mean
 * over its whole source footprint.
 *
 * That is done with mipmaps plus an explicit LOD rather than a hand-rolled box
 * filter: three.js rebuilds the mip chain on every video upload (see
 * textureNeedsGenerateMipmaps in the r185 build), so a single textureLod fetch
 * is already a correctly filtered box average and costs one tap.
 *
 * If a per-frame mip rebuild ever shows up in a profile, the fallback is a
 * progressive halving chain: each step is one bilinear tap sampling the corner
 * of a 2x2 texel block, which averages 4 texels exactly, repeated log2(scale)
 * times.
 */

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uSource;
  uniform float uTargetAspect;
  uniform float uSourceAspect;
  uniform float uLod;
  uniform float uMirror;   // 1.0 mirrors horizontally

  in vec2 vUv;
  out vec4 fragColor;

  ${UV_UTILS}

  void main() {
    vec2 uv = vUv;
    uv.x = mix(uv.x, 1.0 - uv.x, uMirror);
    uv = coverUv(uv, uTargetAspect, uSourceAspect);

    fragColor = vec4(textureLod(uSource, uv, uLod).rgb, 1.0);
  }
`;

export function createDownsamplePass() {
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uSource: { value: null },
      uTargetAspect: { value: 1 },
      uSourceAspect: { value: 1 },
      uLod: { value: 0 },
      uMirror: { value: 0 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const { scene, camera } = createFullscreenPass(material);

  // NearestFilter on both: the mosaic pass wants exactly one texel per brick,
  // with no interpolation bleeding colour across brick boundaries.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;

  return {
    texture: target.texture,

    setSize(gridW, gridH) {
      target.setSize(gridW, gridH);
    },

    render(renderer, source, gridW, gridH, mirror) {
      const u = material.uniforms;
      const srcW = source.width || 1;
      const srcH = source.height || 1;

      u.uSource.value = source.texture;
      u.uTargetAspect.value = gridW / gridH;
      u.uSourceAspect.value = srcW / srcH;
      u.uMirror.value = mirror ? 1 : 0;

      // How many source pixels one output texel covers, after cover-fit crop.
      const srcAspect = srcW / srcH;
      const targetAspect = gridW / gridH;
      const usedW = srcAspect > targetAspect ? srcW * (targetAspect / srcAspect) : srcW;
      u.uLod.value = Math.max(0, Math.log2(usedW / gridW));

      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prev);
    },

    dispose() {
      target.dispose();
      material.dispose();
    },
  };
}
