/**
 * Golden test: rebuild reference_images/new_yorker.png from nothing but the
 * baked tile plus one flat colour per cell, and assert it lands within 1/255.
 *
 * This is the regression guard for the whole effect. If someone changes the
 * blend function in the shader, re-bakes the tile from a different reference,
 * or "simplifies" overlay into a multiply, this fails loudly. It exercises the
 * exact same math the fragment shader runs, so a pass here means the shader's
 * composite is correct by construction — only the sampling and colour-space
 * plumbing around it can still be wrong.
 *
 * Run: npm run verify
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePNG } from "./png.mjs";
import { REF, overlay, cellBaseColours } from "./lut-common.mjs";

const TOLERANCE = 1.0; // mean abs error, in 0..255 units

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const img = decodePNG(fs.readFileSync(path.join(root, REF.file)));
const tile = decodePNG(fs.readFileSync(path.join(root, "src/assets/stud-lut.png")));

const { pitch, cols, rows } = REF;
if (tile.width !== pitch || tile.height !== pitch) {
  throw new Error(`tile is ${tile.width}x${tile.height}, expected ${pitch}x${pitch}`);
}

const bases = cellBaseColours(img, REF);

let sum = 0, max = 0, n = 0;
const hist = new Array(5).fill(0); // error buckets: <0.25, <0.5, <1, <2, >=2

for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const base = bases[r * cols + c];
    for (let y = 0; y < pitch; y++) {
      for (let x = 0; x < pitch; x++) {
        const s = tile.data[(y * pitch + x) * 3] / 255;
        const i = ((r * pitch + y) * img.width + (c * pitch + x)) * 3;
        for (let k = 0; k < 3; k++) {
          const e = Math.abs(overlay(base[k], s) * 255 - img.data[i + k]);
          sum += e; max = Math.max(max, e); n++;
          hist[e < 0.25 ? 0 : e < 0.5 ? 1 : e < 1 ? 2 : e < 2 ? 3 : 4]++;
        }
      }
    }
  }
}

const mean = sum / n;
const pct = (i) => ((hist[i] / n) * 100).toFixed(2).padStart(6);

console.log(`reconstructed ${cols}x${rows} cells (${n.toLocaleString()} channel samples)`);
console.log(`  mean abs error  ${mean.toFixed(4)}/255`);
console.log(`  max abs error   ${max.toFixed(4)}/255`);
console.log(`  distribution    <0.25: ${pct(0)}%  <0.5: ${pct(1)}%  <1: ${pct(2)}%  <2: ${pct(3)}%  >=2: ${pct(4)}%`);

if (!(mean < TOLERANCE)) {
  console.error(`\nFAIL: mean abs error ${mean.toFixed(4)} exceeds tolerance ${TOLERANCE}`);
  process.exit(1);
}
console.log(`\nPASS (tolerance ${TOLERANCE}/255)`);
