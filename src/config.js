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
   * Edge length of one brick in CSS pixels. The grid is always N x N bricks,
   * N derived from this and the shorter window side; the longer side is
   * letterboxed. The reference mosaic used 30.
   */
  cellSize: num("cell", 18),
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

  /** Shows the HUD: source, grid, palette and the keyboard shortcuts. */
  debug: params.has("debug"),

  camera: { width: 1280, height: 720 },

  /** "2d" = flat mosaic, "3d" = floating slate of real bricks. `?view=3d` */
  view: params.get("view") === "3d" ? "3d" : "2d",

  view3d: {
    /** Tilt toward the pointer at the edge of the window, in radians. */
    maxTilt: (8 * Math.PI) / 180,
    /** Exponential ease rate toward the pointer tilt, per second. */
    tiltEase: 4,
    /** Idle bob, as a fraction of the slate height, and its speed in rad/s. */
    bobAmplitude: 0.012,
    bobSpeed: 0.9,
    /**
     * Brick budget for the 3D view. Every brick is real geometry, so tiny
     * bricks on a big window would mean tens of thousands of them; past this
     * the 3D grid uses larger bricks than the 2D one. The 2D view is unaffected.
     */
    maxBricks: 15000,
    /** Studs shadowing their neighbours. The single most expensive 3D option. */
    shadows: true,
    /** Raised lettering on each stud top, as in the 2D tile. "" turns it off. */
    studText: "LEGO",
    /** Bump strength of that lettering. */
    studTextDepth: 0.7,
  },
};

export const KEYS = `
  V       toggle 2D / 3D
  P       toggle palette quantisation
  [ / ]   brick size
  M       mirror
`;
