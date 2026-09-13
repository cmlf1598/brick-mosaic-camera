/**
 * Single source of truth for every tunable number, plus the URL flags that
 * override them. Read once at startup: `?cell=32&palette=1&src=...`
 */
const params = new URLSearchParams(location.search);

const num = (key, fallback) => {
  const v = Number(params.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const config = {
  /**
   * Edge length of one brick in CSS pixels. The grid is derived from this so
   * cells stay square at any canvas aspect. The reference mosaic used 30.
   */
  cellSize: num("cell", 26),
  minCellSize: 8,
  maxCellSize: 96,

  /** 0 = sampled colour (matches the reference), 1 = nearest real LEGO colour. */
  paletteMode: params.get("palette") === "1" ? 1 : 0,

  /**
   * Ordered-dither strength applied before palette quantisation, 0..1.
   * Kept low on purpose: the dither offsets a colour before the nearest-brick
   * search, so too much of it pushes colours clean out of their hue family and
   * a flat blue wall picks up stray tan and purple bricks.
   */
  ditherAmount: (() => {
    const v = Number(params.get("dither"));
    return Number.isFinite(v) && params.has("dither") ? Math.max(0, Math.min(1, v)) : 0.35;
  })(),

  /**
   * Still-image source instead of the webcam, e.g. ?src=/reference_images/lady.png
   * Lets the shader be developed and diffed without a camera in the loop.
   */
  src: params.get("src"),

  /**
   * Mirror horizontally, so the camera reads as a mirror rather than a window.
   * Defaults on for the camera and off for a still image, where flipping the
   * picture is just wrong. `?mirror=0` / `?mirror=1` overrides either way.
   */
  mirror: params.has("mirror") ? params.get("mirror") === "1" : !params.get("src"),

  /** Shows the HUD and enables the keyboard controls. */
  debug: params.has("debug"),

  camera: { width: 1280, height: 720 },
};

export const KEYS = `
  P       toggle palette quantisation
  [ / ]   brick size
  M       mirror
`;
