import * as THREE from "three";
import "./style.css";

import { config, KEYS } from "./config.js";
import { createRenderer } from "./core/renderer.js";
import { createSource } from "./core/source.js";
import { createDownsamplePass } from "./passes/downsample.js";
import { createMosaicPass } from "./mosaic/material.js";

const canvas = document.getElementById("canvas");
const overlay = document.getElementById("overlay");

function showOverlay(html) {
  overlay.innerHTML = html;
  overlay.hidden = false;
}

function hideOverlay() {
  overlay.hidden = true;
}

const CAMERA_HINT = `<p>Or run it against a still image instead:<br>
  <code>?src=/reference_images/lady.png</code></p>`;

async function main() {
  const renderer = createRenderer(canvas);
  const downsample = createDownsamplePass();
  const mosaic = await createMosaicPass();

  let source;
  try {
    // Shown *before* awaiting, because getUserMedia does not settle while the
    // permission prompt is open — and never settles at all if the user simply
    // ignores it. Without this the app sits on a black screen with nothing to
    // explain why.
    if (!config.src) {
      showOverlay(`<h1>Waiting for camera access</h1>
        <p>Allow camera access to start the mosaic.</p>${CAMERA_HINT}`);
    }

    source = await createSource();
    hideOverlay();
  } catch (err) {
    const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
    const missing = err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError";

    showOverlay(
      denied
        ? `<h1>Camera access blocked</h1>
           <p>Allow camera access for this page and reload.</p>${CAMERA_HINT}`
        : missing
          ? `<h1>No camera found</h1>
             <p>Nothing is reporting itself as a video input device.</p>${CAMERA_HINT}`
          : `<h1>No video source</h1><p>${err?.message ?? err}</p>`,
    );
    console.error(err);
    return;
  }

  let grid = new THREE.Vector2(1, 1);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);

    // Grid derives from brick size, so bricks stay square at any aspect.
    grid.set(
      Math.max(1, Math.round(w / config.cellSize)),
      Math.max(1, Math.round(h / config.cellSize)),
    );
    downsample.setSize(grid.x, grid.y);
  }

  const hud = document.createElement("div");
  hud.id = "hud";
  hud.hidden = !config.debug;
  document.body.append(hud);

  function updateHud() {
    if (!config.debug) return;
    hud.textContent = [
      `source   ${source.kind} ${source.width}x${source.height}`,
      `grid     ${grid.x} x ${grid.y}  (${config.cellSize}px bricks)`,
      `palette  ${config.paletteMode ? "LEGO (Oklab + dither)" : "sampled colour"}`,
      `mirror   ${config.mirror ? "on" : "off"}`,
      KEYS.trimEnd(),
    ].join("\n");
  }

  window.addEventListener("keydown", (e) => {
    if (!config.debug) return;
    const key = e.key.toLowerCase();

    if (key === "p") {
      config.paletteMode = config.paletteMode ? 0 : 1;
      mosaic.uniforms.uPaletteMode.value = config.paletteMode;
    } else if (key === "m") {
      config.mirror = !config.mirror;
    } else if (key === "[" || key === "]") {
      const step = key === "]" ? 2 : -2;
      config.cellSize = Math.min(
        config.maxCellSize,
        Math.max(config.minCellSize, config.cellSize + step),
      );
      resize();
    } else {
      return;
    }

    updateHud();
  });

  window.addEventListener("resize", () => {
    resize();
    updateHud();
  });

  resize();
  updateHud();

  renderer.setAnimationLoop(() => {
    if (!source.width || !source.height) return;

    downsample.render(renderer, source, grid.x, grid.y, config.mirror);
    mosaic.render(renderer, downsample.texture, grid.x, grid.y);
  });
}

main().catch((err) => {
  console.error(err);
  showOverlay(`<h1>Something went wrong</h1><p>${err?.message ?? err}</p>`);
});
