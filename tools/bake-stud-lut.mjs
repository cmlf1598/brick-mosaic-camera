/**
 * Bakes src/assets/stud-lut.png — the single grayscale brick tile that the
 * mosaic shader composites over each cell.
 *
 * Method: for every pixel position within a cell, invert the overlay blend
 * against that cell's flat base colour to recover the tile value, then take the
 * median across all 1200 cells and all 3 channels. Median rather than mean
 * because cells near the clamp contribute outliers even inside the usable band.
 *
 * Run: npm run bake   (only needed if the reference or the method changes;
 *                      the output PNG is committed)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePNG, encodeGrayPNG } from "./png.mjs";
import {
  REF, overlay, overlayInverse, usableBase, median, cellBaseColours,
} from "./lut-common.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = path.join(root, "src/assets/stud-lut.png");

const img = decodePNG(fs.readFileSync(path.join(root, REF.file)));
const { pitch, cols, rows } = REF;
if (img.width !== cols * pitch || img.height !== rows * pitch) {
  throw new Error(`reference is ${img.width}x${img.height}, expected ${cols * pitch}x${rows * pitch}`);
}

const bases = cellBaseColours(img, REF);

// samples[y][x] collects every usable (cell, channel) estimate of the tile value.
const samples = Array.from({ length: pitch }, () =>
  Array.from({ length: pitch }, () => []),
);

for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const base = bases[r * cols + c];
    for (let y = 0; y < pitch; y++) {
      for (let x = 0; x < pitch; x++) {
        const i = ((r * pitch + y) * img.width + (c * pitch + x)) * 3;
        for (let k = 0; k < 3; k++) {
          if (!usableBase(base[k])) continue;
          samples[y][x].push(overlayInverse(base[k], img.data[i + k] / 255));
        }
      }
    }
  }
}

const lut = new Float64Array(pitch * pitch);
for (let y = 0; y < pitch; y++) {
  for (let x = 0; x < pitch; x++) lut[y * pitch + x] = median(samples[y][x]);
}

// Sanity: the flat plate area must land on overlay's neutral value, otherwise
// the tile would tint every brick instead of only shading its relief.
const plate = lut[3 * pitch + 3];
if (Math.abs(plate - 0.5) > 0.01) {
  throw new Error(`plate value ${plate.toFixed(4)} is not overlay-neutral (0.5); the fit is wrong`);
}

const gray = new Uint8Array(pitch * pitch);
for (let i = 0; i < lut.length; i++) {
  gray[i] = Math.max(0, Math.min(255, Math.round(lut[i] * 255)));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encodeGrayPNG(gray, pitch, pitch));

// Report the reconstruction error the quantised tile actually achieves.
let sum = 0, max = 0, n = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const base = bases[r * cols + c];
    for (let y = 0; y < pitch; y++) {
      for (let x = 0; x < pitch; x++) {
        const i = ((r * pitch + y) * img.width + (c * pitch + x)) * 3;
        const s = gray[y * pitch + x] / 255;
        for (let k = 0; k < 3; k++) {
          const e = Math.abs(overlay(base[k], s) * 255 - img.data[i + k]);
          sum += e; max = Math.max(max, e); n++;
        }
      }
    }
  }
}

const range = [Math.min(...lut), Math.max(...lut)];
console.log(`baked ${pitch}x${pitch} tile -> ${path.relative(root, OUT)}`);
console.log(`  range      ${range[0].toFixed(3)} .. ${range[1].toFixed(3)}`);
console.log(`  plate      ${plate.toFixed(4)}  (0.5 = overlay-neutral)`);
console.log(`  recon err  mean ${(sum / n).toFixed(3)}/255, max ${max.toFixed(2)}/255`);
