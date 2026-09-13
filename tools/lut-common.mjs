/**
 * Shared constants and math for the stud-LUT bake and its golden test.
 *
 * The reference mosaic was produced by compositing a single grayscale brick
 * tile over a flat per-cell colour with an *overlay* blend. That was measured,
 * not assumed: fitting candidate blend modes across all 1200 cells of
 * new_yorker.png gives RMS error (x255) of overlay 0.3, soft-light 14.1,
 * linear 14.5, screen 20.4, multiply 44.7. Overlay wins by ~50x because it is
 * the only candidate that compresses the relief at *both* the dark and bright
 * ends, which is what the reference actually does.
 */

/** Reference mosaic geometry, measured from gradient-energy peaks. */
export const REF = {
  file: "reference_images/new_yorker.png",
  pitch: 30, // px per cell, exact in both axes
  cols: 40,
  rows: 30,
};

/** Per-channel overlay blend. `b` = base colour, `s` = tile value. */
export const overlay = (b, s) =>
  b < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);

/**
 * Solve overlay for the tile value `s` given base `b` and output `o`.
 * Degenerate as b approaches 0 or 1 (the blend collapses and carries no
 * information about s), so callers must gate on `usableBase`.
 */
export const overlayInverse = (b, o) =>
  b < 0.5 ? o / (2 * b) : 1 - (1 - o) / (2 * (1 - b));

/** Bases outside this band are too close to the clamp to invert reliably. */
export const usableBase = (b) => b > 0.06 && b < 0.94;

export function median(values) {
  if (values.length === 0) return NaN;
  const a = Float64Array.from(values).sort();
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * Split a decoded reference mosaic into cells and return, for each cell, the
 * median colour (the flat brick colour before the tile was composited over it).
 */
export function cellBaseColours({ width, data }, { pitch, cols, rows }) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = [[], [], []];
      for (let y = 0; y < pitch; y++) {
        for (let x = 0; x < pitch; x++) {
          const i = ((r * pitch + y) * width + (c * pitch + x)) * 3;
          ch[0].push(data[i] / 255);
          ch[1].push(data[i + 1] / 255);
          ch[2].push(data[i + 2] / 255);
        }
      }
      out.push([median(ch[0]), median(ch[1]), median(ch[2])]);
    }
  }
  return out;
}
