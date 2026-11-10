import * as THREE from "three";
import { createFullscreenPass, FULLSCREEN_VERT } from "../core/fullscreen.js";
import { createPaletteTexture } from "../palette/lego.js";
import { PALETTE_GLSL } from "../mosaic/shader.js";
import { config } from "../config.js";

/**
 * Resolves each cell to the colour of the brick that will actually be placed
 * there — the sampled colour, or its nearest LEGO colour — one texel per brick.
 *
 * The 2D mosaic does this inline per pixel, which is fine for a flat quad. The
 * 3D view would have to do it per *vertex* of every brick, running the palette
 * search ~100x per brick, so it is resolved once here instead.
 */

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uCells;
  uniform int uPaletteMode;

  in vec2 vUv;
  out vec4 fragColor;

  ${PALETTE_GLSL}

  void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    vec3 brick = texelFetch(uCells, texel, 0).rgb;
    if (uPaletteMode == 1) brick = quantizeToLego(brick, vec2(texel));
    fragColor = vec4(brick, 1.0);
  }
`;

export function createCellColorPass() {
  const palette = createPaletteTexture();

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uCells: { value: null },
      uPalette: { value: palette.texture },
      uPaletteMode: { value: config.paletteMode },
      uPaletteCount: { value: palette.count },
      uDither: { value: config.ditherAmount },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const { scene, camera } = createFullscreenPass(material);

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
    uniforms: material.uniforms,

    setSize(gridW, gridH) {
      target.setSize(gridW, gridH);
    },

    render(renderer, cellTexture) {
      material.uniforms.uCells.value = cellTexture;

      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prev);
    },

    dispose() {
      target.dispose();
      palette.texture.dispose();
      material.dispose();
    },
  };
}
