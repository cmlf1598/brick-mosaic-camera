# Brick Mosaic Camera

A live webcam feed rendered as a LEGO brick mosaic, as a fullscreen WebGL shader.

![screenshot](docs/screenshot.png)

<sub>`lenna.png` at `?cell=13` — 73×73 bricks, sampled colour.</sub>

```bash
npm install
npm run dev
```

Then allow camera access. No camera handy? Point it at any image instead:
`?src=/some-image.png`

> `reference_images/` is not committed, so the `?src=` examples below assume you
> have dropped your own images there. The baked brick tile
> (`src/assets/stud-lut.png`) **is** committed, so nothing at runtime depends on
> them — only `npm run bake` does.

## URL flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `?cell=26` | `26` | Brick size in CSS pixels. The grid derives from this, so bricks stay square at any window aspect. |
| `?palette=1` | `0` | Snap each brick to the nearest real LEGO colour. |
| `?dither=0.35` | `0.35` | Ordered-dither strength applied before palette matching. |
| `?src=<url>` | — | Use a still image instead of the camera. |
| `?mirror=0` | on for camera, off for images | Horizontal flip. |
| `?debug` | off | HUD plus keyboard controls: `P` palette, `[` / `]` brick size, `M` mirror. |

## How it works

Two passes. The first reduces the source to exactly one texel per brick; the
second draws fullscreen, reading one texel per cell and compositing a brick tile
over it.

The interesting part is that the look was **measured** off
`reference_images/new_yorker.png` rather than approximated:

- The grid is exactly 30px, and the shading tile is **identical in every cell** —
  fixed light direction, no perspective, no per-brick variation. There is no 3D
  in the effect at all.
- The compositing operator is **overlay**, not multiply. Fitting candidates
  across all 1200 reference cells gives RMS error (×255): overlay 0.3,
  soft-light 14.1, linear 14.5, screen 20.4, multiply 44.7. Overlay is the only
  one that compresses the relief at *both* the dark and bright ends, which is
  what the reference does.
- Inverting that blend recovers a single grayscale tile whose flat plate area
  sits at exactly **0.500** — overlay's neutral value — so the plate passes
  brick colour through untouched and only the stud and bevel shade it.

So the whole effect is `overlay(cellColour, tile(cellUV))`, which reconstructs
the reference at **0.27/255 mean** absolute error.

### Two things that are easy to get wrong

**Colour space.** The overlay was fitted on raw sRGB-encoded values, so nothing
in the pipeline may convert to linear — no tone mapping, no output colour-space
conversion, every texture tagged `NoColorSpace`. Deliberately *unlike* the
sibling `night-city-digital-clock` project, whose ACES + sRGB renderer setup is
right for a lit 3D scene and wrong for a 2D image filter. See
[src/core/renderer.js](src/core/renderer.js).

**Averaging.** Each output texel must be the mean over its whole source
footprint. Point-sampling one pixel per cell makes a live feed crawl badly.
See [src/passes/downsample.js](src/passes/downsample.js).

## Tools

```bash
npm run bake     # regenerate src/assets/stud-lut.png from the reference
npm run verify   # golden test: rebuild the reference, assert < 1/255
```

`npm run verify` runs the exact math the fragment shader runs, so it is the
regression guard for the composite — it fails loudly if the blend is changed or
the tile is re-baked wrongly.
