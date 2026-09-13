import * as THREE from "three";
import { createFullscreenPass, FULLSCREEN_VERT } from "../core/fullscreen.js";
import { createPaletteTexture } from "../palette/lego.js";
import { MOSAIC_FRAG } from "./shader.js";
import { config } from "../config.js";

import studLutUrl from "../assets/stud-lut.png?url";

/**
 * Builds the mosaic pass: the baked brick tile, the palette, and the fullscreen
 * quad that composites them over the downsampled cell colours.
 */
export async function createMosaicPass() {
  const tile = await new THREE.TextureLoader().loadAsync(studLutUrl);
  tile.colorSpace = THREE.NoColorSpace;
  // The tile is 30x30 — its native resolution in the reference. Linear keeps it
  // smooth when a brick is drawn larger than that; it starts reading soft past
  // roughly 60px per brick.
  tile.minFilter = THREE.LinearFilter;
  tile.magFilter = THREE.LinearFilter;
  tile.wrapS = THREE.ClampToEdgeWrapping;
  tile.wrapT = THREE.ClampToEdgeWrapping;
  tile.generateMipmaps = false;

  const palette = createPaletteTexture();

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uCells: { value: null },
      uStud: { value: tile },
      uPalette: { value: palette.texture },
      uGrid: { value: new THREE.Vector2(1, 1) },
      uPaletteMode: { value: config.paletteMode },
      uPaletteCount: { value: palette.count },
      uDither: { value: config.ditherAmount },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: MOSAIC_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const { scene, camera } = createFullscreenPass(material);

  return {
    uniforms: material.uniforms,

    render(renderer, cellTexture, gridW, gridH) {
      material.uniforms.uCells.value = cellTexture;
      material.uniforms.uGrid.value.set(gridW, gridH);
      renderer.render(scene, camera);
    },

    dispose() {
      tile.dispose();
      palette.texture.dispose();
      material.dispose();
    },
  };
}
