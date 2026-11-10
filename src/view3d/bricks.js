import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * The whole brick wall as a single instanced draw.
 *
 * Units are bricks: one cell is 1x1, and the field is centred on the origin
 * with studs pointing down +Z. Proportions follow a real 1x1 plate (8mm pitch,
 * 3.2mm tall, 4.8mm x 1.7mm stud).
 *
 * There are no per-instance matrices or colour attributes. The vertex shader
 * derives each brick's cell from gl_InstanceID and reads its colour straight
 * from the cell-colour texture, so a new grid size is just a uniform and an
 * instanceCount change — nothing is reallocated when the window resizes.
 */

const PITCH = 1;
const GAP = 0.04;
const BODY_HEIGHT = 0.4;
const STUD_RADIUS = 0.3;
const STUD_HEIGHT = 0.21;
const STUD_SEGMENTS = 16;

export const BRICK_HEIGHT = BODY_HEIGHT + STUD_HEIGHT;

/** Any UV inside the label texture's empty margin: flat, so no bump. */
const BLANK_UV = 0.02;

/**
 * Height map for the raised lettering on top of each stud: white text on
 * black, drawn to span about the same share of the stud as in the 2D tile.
 * Blurred on purpose, because the bump map shades the *slope* of the height:
 * a hard edge gives a one-texel outline, a soft one reads as a bevelled letter.
 */
function createStudLabelTexture(text, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);

  const font = (px) => `900 ${px}px "Arial Black", "Segoe UI Black", system-ui, sans-serif`;
  ctx.font = font(100);
  const fontPx = Math.min(100 * ((size * 0.64) / ctx.measureText(text).width), size * 0.3);

  ctx.font = font(fontPx);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.filter = `blur(${size / 128}px)`;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Point every vertex at the label's blank margin except the stud's top cap,
 * which gets a planar projection so the label reads upright from the front.
 */
function mapLabelUvs(geometry, isCap) {
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    if (isCap && normal.getZ(i) > 0.99) {
      uv.setXY(i, 0.5 + pos.getX(i) / (2 * STUD_RADIUS), 0.5 + pos.getY(i) / (2 * STUD_RADIUS));
    } else {
      uv.setXY(i, BLANK_UV, BLANK_UV);
    }
  }
}

function createBrickGeometry() {
  const body = new THREE.BoxGeometry(PITCH - GAP, PITCH - GAP, BODY_HEIGHT);
  body.translate(0, 0, BODY_HEIGHT / 2);
  mapLabelUvs(body, false);

  // Its bottom cap is buried in the body, but mergeGeometries needs matching
  // index layouts, and 16 hidden triangles are not worth an open-ended special case.
  const stud = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, STUD_SEGMENTS);
  stud.rotateX(Math.PI / 2);
  stud.translate(0, 0, BODY_HEIGHT + STUD_HEIGHT / 2);
  mapLabelUvs(stud, true);

  const merged = mergeGeometries([body, stud]);
  body.dispose();
  stud.dispose();

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = merged.index;
  for (const [name, attr] of Object.entries(merged.attributes)) {
    geometry.setAttribute(name, attr);
  }
  return geometry;
}

const VERT_PARS = /* glsl */ `
  uniform sampler2D uCellColors;
  uniform vec2 uGrid;
  flat varying vec3 vBrickColor;
`;

const VERT_OFFSET = /* glsl */ `
  int gridW = int(uGrid.x);
  ivec2 cell = ivec2(gl_InstanceID % gridW, gl_InstanceID / gridW);
  transformed.xy += vec2(cell) + 0.5 - uGrid * 0.5;
  vBrickColor = texelFetch(uCellColors, cell, 0).rgb;
`;

function patchVertex(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_OFFSET}`);
}

export function createBrickField(cellColorTexture, { studText, studTextDepth }) {
  const uniforms = {
    uCellColors: { value: cellColorTexture },
    uGrid: { value: new THREE.Vector2(1, 1) },
  };

  const geometry = createBrickGeometry();
  const label = studText ? createStudLabelTexture(studText) : null;

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0,
    bumpMap: label,
    bumpScale: studTextDepth,
  });

  material.onBeforeCompile = (shader) => {
    patchVertex(shader, uniforms);
    // Cell colours are sRGB-encoded (nothing upstream converts — see
    // core/renderer.js), but lighting has to happen on linear values.
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nflat varying vec3 vBrickColor;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb *= sRGBTransferEOTF(vec4(vBrickColor, 1.0)).rgb;",
      );
  };

  // The shadow pass draws with its own material, which must move the
  // vertices the same way or every brick casts its shadow from the origin.
  const depthMaterial = new THREE.MeshDepthMaterial();
  depthMaterial.onBeforeCompile = (shader) => patchVertex(shader, uniforms);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.customDepthMaterial = depthMaterial;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // The bounding sphere is that of one brick at the origin, not of the field.
  mesh.frustumCulled = false;

  return {
    mesh,

    setGrid(gridW, gridH) {
      uniforms.uGrid.value.set(gridW, gridH);
      geometry.instanceCount = gridW * gridH;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      label?.dispose();
      depthMaterial.dispose();
    },
  };
}
