/**
 * The mosaic composite — the core of the effect.
 *
 * Every cell gets the same grayscale brick tile composited over its flat colour
 * with an *overlay* blend. Both halves of that were measured from
 * reference_images/new_yorker.png rather than guessed:
 *
 *   - Fitting blend modes across all 1200 reference cells gives RMS error
 *     (x255): overlay 0.3, soft-light 14.1, linear 14.5, screen 20.4,
 *     multiply 44.7. Overlay is not a close call — it is the only candidate
 *     that compresses the relief at both the dark and the bright end.
 *   - Inverting that blend recovers a tile whose flat plate area sits at
 *     exactly 0.500, overlay's neutral value, so the plate passes brick colour
 *     through untouched and only the stud and bevel shade it.
 *
 * Reconstructing the reference through this path lands at 0.27/255 mean abs
 * error, 0.50/255 max. tools/verify-lut.mjs asserts it on every run.
 *
 * The blend must happen on sRGB-encoded values — that is the space it was
 * fitted in. See core/renderer.js for why nothing in the pipeline converts.
 */
export const MOSAIC_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uCells;     // one texel per brick
  uniform sampler2D uStud;      // baked brick tile, grayscale
  uniform sampler2D uPalette;   // Nx1 LEGO colours
  uniform vec2 uGrid;
  uniform int uPaletteMode;     // 0 = sampled colour, 1 = nearest LEGO colour
  uniform int uPaletteCount;
  uniform float uDither;

  in vec2 vUv;
  out vec4 fragColor;

  // ---- overlay -------------------------------------------------------------

  // Per-channel overlay. step() rather than a branch: the channels genuinely
  // take different sides and this is the whole inner loop.
  vec3 overlay(vec3 b, vec3 s) {
    return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  }

  // ---- Oklab ---------------------------------------------------------------

  // Palette matching happens in Oklab, not RGB. Nearest-in-RGB picks colours
  // that are numerically close but perceptually wrong, and it shows worst on
  // skin tones, which sit in a part of the gamut where RGB distance badly
  // misrepresents how different two colours look.

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }

  vec3 linearToOklab(vec3 c) {
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;

    vec3 lms = pow(max(vec3(l, m, s), 0.0), vec3(1.0 / 3.0));

    return vec3(
      0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
      1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
      0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z
    );
  }

  vec3 toOklab(vec3 srgb) { return linearToOklab(srgbToLinear(srgb)); }

  // ---- dithering -----------------------------------------------------------

  // Bayer 4x4, returning 0..1. Without it, a slow gradient across a wall or a
  // cheek collapses into visible bands of one brick colour; the dither breaks
  // the boundary into a mix of the two neighbouring colours instead.
  float bayer4(vec2 cell) {
    vec2 p = mod(cell, 4.0);
    int i = int(p.y) * 4 + int(p.x);
    float m[16] = float[16](
       0.0,  8.0,  2.0, 10.0,
      12.0,  4.0, 14.0,  6.0,
       3.0, 11.0,  1.0,  9.0,
      15.0,  7.0, 13.0,  5.0
    );
    return m[i] / 16.0;
  }

  // ---- palette -------------------------------------------------------------

  vec3 quantizeToLego(vec3 c, vec2 cell) {
    // Dither before matching, so the offset changes which brick gets picked
    // rather than merely tinting a brick that was already chosen.
    c = clamp(c + (bayer4(cell) - 0.5) * uDither * 0.05, 0.0, 1.0);

    vec3 target = toOklab(c);

    vec3 best = c;
    float bestDist = 1e9;

    for (int i = 0; i < 256; i++) {
      if (i >= uPaletteCount) break;

      vec3 candidate = texelFetch(uPalette, ivec2(i, 0), 0).rgb;
      vec3 d = toOklab(candidate) - target;
      float dist = dot(d, d);

      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }

    return best;
  }

  // ---- main ----------------------------------------------------------------

  void main() {
    vec2 gridUv = vUv * uGrid;
    vec2 cell = floor(gridUv);
    vec2 cellUv = fract(gridUv);

    // vUv reaches exactly 1.0 on the last row/column, which floors to an
    // out-of-range cell and makes texelFetch undefined. Clamp rather than
    // wrap, so the edge bricks repeat instead of sampling the far side.
    ivec2 texel = ivec2(clamp(cell, vec2(0.0), uGrid - 1.0));

    vec3 brick = texelFetch(uCells, texel, 0).rgb;
    if (uPaletteMode == 1) brick = quantizeToLego(brick, cell);

    float tile = texture(uStud, cellUv).r;

    fragColor = vec4(overlay(brick, vec3(tile)), 1.0);
  }
`;
