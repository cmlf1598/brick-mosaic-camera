import * as THREE from "three";
import { config } from "../config.js";

/**
 * The thing being mosaicked: either the webcam or, with ?src=..., a still
 * image. Both resolve to { texture, width, height } so the rest of the
 * pipeline does not care which it got.
 *
 * Textures are tagged NoColorSpace so their values reach the shader exactly as
 * stored — see the note in core/renderer.js.
 */

/**
 * Mipmaps are required, not cosmetic: the downsample pass averages each brick's
 * source footprint with an explicit-LOD fetch, and without a mip chain that
 * fetch degenerates to a point sample and the mosaic crawls. three.js rebuilds
 * the chain on every video upload, so this also covers the live feed.
 */
function applyFilterSettings(texture) {
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
}

async function createWebcamSource() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: config.camera.width },
      height: { ideal: config.camera.height },
      facingMode: "user",
    },
    audio: false,
  });

  const video = document.createElement("video");
  video.srcObject = stream;
  video.playsInline = true; // iOS refuses inline playback without this
  video.muted = true;
  video.autoplay = true;

  await video.play();

  // The first frame can arrive after play() resolves; wait for real dimensions
  // or the downsample target gets sized 0x0.
  if (!video.videoWidth) {
    await new Promise((resolve) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
    });
  }

  const texture = new THREE.VideoTexture(video);
  applyFilterSettings(texture);

  return {
    kind: "camera",
    texture,
    get width() { return video.videoWidth; },
    get height() { return video.videoHeight; },
    dispose() {
      stream.getTracks().forEach((t) => t.stop());
      texture.dispose();
    },
  };
}

async function createImageSource(url) {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  applyFilterSettings(texture);

  return {
    kind: "image",
    texture,
    width: texture.image.width,
    height: texture.image.height,
    dispose() { texture.dispose(); },
  };
}

export function createSource() {
  return config.src ? createImageSource(config.src) : createWebcamSource();
}
