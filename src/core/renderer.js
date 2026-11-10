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
 *
 * The 3D view is the one exception, and it is exactly that lit scene. It is
 * safe to switch encoding for it because there every image-filter pass renders
 * into a render target, which ignores outputColorSpace; only the lit slate
 * reaches the canvas. setOutputMode() is the only place that switches it.
 */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // The 2D fullscreen quad has nothing to antialias, but the tilted slate
    // and its stud silhouettes in 3D shimmer badly without MSAA.
    antialias: true,
    alpha: false,
  });

  // Fills the letterbox around the square 2D grid. Given as raw values in the
  // "linear" space because the 2D path writes them out unconverted, so they
  // land on screen as exactly the page background, #11131a.
  renderer.setClearColor(
    new THREE.Color().setRGB(0x11 / 255, 0x13 / 255, 0x1a / 255, THREE.LinearSRGBColorSpace),
  );
  setOutputMode(renderer, "2d");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  return renderer;
}

export function setOutputMode(renderer, view) {
  renderer.outputColorSpace =
    view === "3d" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace; // linear = no conversion
  renderer.toneMapping = THREE.NoToneMapping;
}
