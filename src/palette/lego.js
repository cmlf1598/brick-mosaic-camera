import * as THREE from "three";

/**
 * Common LEGO solid colours, as hex approximations of the real brick colours
 * (LDraw / BrickLink values). Translucent, metallic and glitter colours are
 * deliberately excluded — they do not read as flat fill in a mosaic.
 *
 * Names are kept for the HUD; only the hex values reach the shader.
 */
export const LEGO_COLORS = [
  ["White", 0xf2f3f2],
  ["Very Light Bluish Gray", 0xe6e3da],
  ["Light Bluish Gray", 0xa0a5a9],
  ["Dark Bluish Gray", 0x6c6e68],
  ["Black", 0x05131d],

  ["Red", 0xc91a09],
  ["Dark Red", 0x720e0f],
  ["Coral", 0xff698f],
  ["Orange", 0xfe8a18],
  ["Medium Orange", 0xffa70b],
  ["Dark Orange", 0xa95500],

  ["Yellow", 0xf2cd37],
  ["Bright Light Yellow", 0xfff03a],
  ["Lime", 0xbbe90b],
  ["Yellowish Green", 0xdfeea5],
  ["Olive Green", 0x9b9a5a],

  ["Bright Green", 0x4b9f4a],
  ["Green", 0x237841],
  ["Dark Green", 0x184632],
  ["Sand Green", 0xa0bcac],
  ["Aqua", 0xb3d7d1],

  ["Medium Azure", 0x36aebf],
  ["Dark Azure", 0x078bc9],
  ["Bright Light Blue", 0x9fc3e9],
  ["Medium Blue", 0x5a93db],
  ["Blue", 0x0055bf],
  ["Dark Blue", 0x0a3463],
  ["Sand Blue", 0x6074a1],

  ["Dark Purple", 0x3f3691],
  ["Purple", 0x81007b],
  ["Magenta", 0x923978],
  ["Bright Pink", 0xe4adc8],
  ["Pink", 0xfc97ac],

  ["Nougat", 0xd09168],
  ["Medium Nougat", 0xaa7d55],
  ["Tan", 0xe4cd9e],
  ["Dark Tan", 0x958a73],
  ["Brown", 0x583927],
  ["Reddish Brown", 0x582a12],
  ["Dark Brown", 0x352100],
];

/**
 * Pack the palette into an Nx1 RGB texture the shader can loop over.
 * Values stay sRGB-encoded and untagged — the shader converts to linear itself
 * on the way into Oklab, and the rest of the pipeline is colour-managed by hand
 * (see core/renderer.js).
 */
export function createPaletteTexture(colors = LEGO_COLORS) {
  const data = new Uint8Array(colors.length * 4);
  colors.forEach(([, hex], i) => {
    data[i * 4] = (hex >> 16) & 0xff;
    data[i * 4 + 1] = (hex >> 8) & 0xff;
    data[i * 4 + 2] = hex & 0xff;
    data[i * 4 + 3] = 255;
  });

  const texture = new THREE.DataTexture(data, colors.length, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return { texture, count: colors.length };
}
