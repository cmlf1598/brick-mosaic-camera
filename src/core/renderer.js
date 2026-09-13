import * as THREE from "three";

/**
 * The renderer is configured as a *pass-through* pipe, and that is the single
 * most important decision in this project.
 *
 * The overlay blend that produces the brick relief was fitted against the
 * reference on raw sRGB-encoded values (mean abs error 0.27/255). If three.js
 * decodes the video to linear on sample and re-encodes on output, the blend
 * happens in the wrong space: the relief goes muddy in the midtones and the
 * highlights bloom, with nothing in the code obviously wrong to point at.
 *
 * So: no tone mapping, no output colour-space conversion, and every texture is
 * tagged NoColorSpace. Do NOT port the ACESFilmicToneMapping + SRGBColorSpace
 * setup from the sibling night-city-digital-clock project — it is right for a
 * lit 3D scene and wrong for a 2D image filter.
 */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // nothing to antialias: the output is a fullscreen quad
    alpha: false,
  });

  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // i.e. no conversion
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  return renderer;
}
