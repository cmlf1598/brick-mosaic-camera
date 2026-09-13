import * as THREE from "three";

/**
 * Both passes are fullscreen image filters, so there is no 3D scene to speak
 * of: a 2x2 plane whose clip-space position is passed straight through, and a
 * camera that exists only because render() demands one.
 */

/** Shared vertex shader. PlaneGeometry(2,2) already spans clip space. */
export const FULLSCREEN_VERT = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Cover-fit + optional mirror, shared by the passes that sample the source. */
export const UV_UTILS = /* glsl */ `
  // Scale uv about its centre so a srcAspect image covers a targetAspect frame.
  vec2 coverUv(vec2 uv, float targetAspect, float srcAspect) {
    vec2 s = srcAspect > targetAspect
      ? vec2(targetAspect / srcAspect, 1.0)   // source too wide: crop sides
      : vec2(1.0, srcAspect / targetAspect);  // source too tall: crop top/bottom
    return (uv - 0.5) * s + 0.5;
  }
`;

export function createFullscreenPass(material) {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { scene, camera, mesh };
}
