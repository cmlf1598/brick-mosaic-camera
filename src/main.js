import * as THREE from "three";
import "./style.css";

import { config, KEYS } from "./config.js";
import { createRenderer, setOutputMode } from "./core/renderer.js";
import { createSource } from "./core/source.js";
import { createDownsamplePass } from "./passes/downsample.js";
import { createCellColorPass } from "./passes/cellcolor.js";
import { createMosaicPass } from "./mosaic/material.js";
import { createSlabView } from "./view3d/slab.js";

const canvas = document.getElementById("canvas");
const overlay = document.getElementById("overlay");
const controls = document.getElementById("controls");
const viewToggle = document.getElementById("view-toggle");
const cellSlider = document.querySelector("#cell-size input");
const cellOutput = document.querySelector("#cell-size output");

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
  const cellColor = createCellColorPass();

  // Built on first use: the 2D view never pays for the scene, environment map
  // or shadow map.
  let slab = null;
  function getSlab() {
    slab ??= createSlabView(renderer, cellColor.texture);
    return slab;
  }

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
  let cellSize = config.cellSize;
  // The square the 2D mosaic is drawn into, centred in the canvas (CSS px).
  const square = new THREE.Vector4();

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);

    // The grid is always N x N, fitted to the shorter side of the window; the
    // longer side is letterboxed. The source is cover-cropped to a square.
    const side = Math.min(w, h);
    square.set((w - side) / 2, (h - side) / 2, side, side);

    // Every 3D brick is real geometry, so the 3D grid is capped at a brick
    // budget by using larger bricks when the requested size would exceed it.
    cellSize = config.view === "3d"
      ? Math.max(config.cellSize, side / Math.sqrt(config.view3d.maxBricks))
      : config.cellSize;

    const n = Math.max(1, Math.round(side / cellSize));
    grid.set(n, n);
    downsample.setSize(grid.x, grid.y);
    syncCellSlider();

    if (config.view === "3d") {
      cellColor.setSize(grid.x, grid.y);
      const s = getSlab();
      s.setGrid(grid.x, grid.y);
      s.setSize(w, h);
    }
  }

  // ---- brick size slider ---------------------------------------------------

  cellSlider.min = config.minCellSize;
  cellSlider.max = config.maxCellSize;

  // Shows the requested size, plus the size actually in use when the 3D brick
  // budget has pushed it up, so the slider never seems to do nothing.
  function syncCellSlider() {
    cellSlider.value = config.cellSize;
    const used = Math.round(cellSize);
    cellOutput.textContent =
      used > config.cellSize ? `${config.cellSize}→${used}px` : `${config.cellSize}px`;
    cellOutput.title = used > config.cellSize ? "Raised to stay within the 3D brick budget" : "";
  }

  cellSlider.addEventListener("input", () => {
    config.cellSize = Number(cellSlider.value);
    resize();
    updateHud();
  });

  const hud = document.createElement("div");
  hud.id = "hud";
  hud.hidden = !config.debug;
  document.body.append(hud);

  function updateHud() {
    if (!config.debug) return;
    hud.textContent = [
      `source   ${source.kind} ${source.width}x${source.height}`,
      `view     ${config.view}`,
      `grid     ${grid.x} x ${grid.y}  (${Math.round(cellSize)}px bricks)`,
      `palette  ${config.paletteMode ? "LEGO (Oklab + dither)" : "sampled colour"}`,
      `mirror   ${config.mirror ? "on" : "off"}`,
      KEYS.trimEnd(),
    ].join("\n");
  }

  function setView(view) {
    config.view = view;
    setOutputMode(renderer, view);
    for (const button of viewToggle.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    }
    resize();
    updateHud();
  }

  viewToggle.addEventListener("click", (e) => {
    const view = e.target.closest("button")?.dataset.view;
    if (view && view !== config.view) setView(view);
  });

  // ---- pointer tilt --------------------------------------------------------

  function settle() {
    slab?.setPointer(0, 0);
  }

  window.addEventListener("pointermove", (e) => {
    if (config.view !== "3d") return;
    // Reaching for a control should not swing the slate into the corner.
    if (e.target.closest?.("#controls")) return settle();
    slab?.setPointer(
      (e.clientX / window.innerWidth) * 2 - 1,
      1 - (e.clientY / window.innerHeight) * 2,
    );
  });
  document.documentElement.addEventListener("pointerleave", settle);
  window.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") settle();
  });
  window.addEventListener("blur", settle);

  // ---- keys ----------------------------------------------------------------

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();

    // Shortcuts work everywhere; ?debug only adds the HUD that lists them.
    if (key === "v") {
      setView(config.view === "3d" ? "2d" : "3d");
      return;
    }

    if (key === "p") {
      config.paletteMode = config.paletteMode ? 0 : 1;
      mosaic.uniforms.uPaletteMode.value = config.paletteMode;
      cellColor.uniforms.uPaletteMode.value = config.paletteMode;
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

  controls.hidden = false;
  setView(config.view);

  let lastTime = performance.now();

  renderer.setAnimationLoop((time) => {
    // Clamped so a backgrounded tab does not come back with one huge step.
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    if (!source.width || !source.height) return;

    downsample.render(renderer, source, grid.x, grid.y, config.mirror);

    if (config.view === "3d") {
      renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
      cellColor.render(renderer, downsample.texture);
      slab.update(dt);
      slab.render(renderer);
    } else {
      // autoClear wipes the whole canvas to the background colour; the quad
      // then only covers the centred square.
      renderer.setViewport(square);
      mosaic.render(renderer, downsample.texture, grid.x, grid.y);
    }
  });
}

main().catch((err) => {
  console.error(err);
  showOverlay(`<h1>Something went wrong</h1><p>${err?.message ?? err}</p>`);
});
