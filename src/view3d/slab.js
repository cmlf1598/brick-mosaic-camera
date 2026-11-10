import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createBrickField, BRICK_HEIGHT } from "./bricks.js";
import { config } from "../config.js";

/**
 * The 3D view: the brick wall as a physical slate hanging in front of the
 * camera, easing toward the pointer.
 *
 * Everything is in brick units (see bricks.js), so the camera is what moves to
 * frame the slate when the grid or window changes — the bricks never scale.
 *
 * Lights are fixed in world space while the slate tilts under them, which is
 * what sells the depth: highlights slide across the studs and their shadows
 * swing as it turns.
 */

const FOV = 35;
const FILL = 0.8; // fraction of the limiting viewport dimension the slate spans
const PLATE_MARGIN = 0.25;
const PLATE_DEPTH = 0.5;

function radialTexture(stops, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSlabView(renderer, cellColorTexture) {
  const { maxTilt, tiltEase, bobAmplitude, bobSpeed, shadows } = config.view3d;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = radialTexture([
    [0, "#1c2030"],
    [1, "#0b0c11"],
  ]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  // Kept low: its specular reflection lands on every brick as a uniform
  // whitish veil, which lifts the dark bricks to pastel far more than it
  // brightens the light ones.
  scene.environmentIntensity = 0.12;
  room.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);

  // ---- slate ---------------------------------------------------------------

  const slate = new THREE.Group();
  scene.add(slate);

  const bricks = createBrickField(cellColorTexture, config.view3d);
  slate.add(bricks.mesh);

  const plateGeometry = new THREE.BoxGeometry(1, 1, PLATE_DEPTH);
  plateGeometry.translate(0, 0, -PLATE_DEPTH / 2);
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.55 });
  const plate = new THREE.Mesh(plateGeometry, plateMaterial);
  plate.receiveShadow = true;
  slate.add(plate);

  // A soft dark pool behind the slate. It stays put in world space, so it
  // shifts against the slate as it bobs and tilts — that parallax is what
  // makes the slate read as hovering rather than painted on the backdrop.
  const shadowTexture = radialTexture([
    [0, "rgba(0,0,0,0.75)"],
    [0.55, "rgba(0,0,0,0.35)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
  });
  const dropShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
  scene.add(dropShadow);

  // ---- lights --------------------------------------------------------------

  // Balanced so a brick facing the camera lands close to its own colour
  // (key 3.4 * cos 57deg / pi + fill ~ 1.0); much brighter and the dark
  // bricks wash out against the 2D view.
  const hemi = new THREE.HemisphereLight(0xe8eeff, 0x1a1c24, 1.4);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff6ea, 3.4);
  key.castShadow = shadows;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  // ---- layout --------------------------------------------------------------

  const grid = new THREE.Vector2(1, 1);
  let aspect = 1;

  function layout() {
    const span = Math.max(grid.x, grid.y);

    plate.scale.set(grid.x + PLATE_MARGIN * 2, grid.y + PLATE_MARGIN * 2, 1);

    dropShadow.scale.set(grid.x * 1.35, grid.y * 1.45, 1);
    dropShadow.position.set(span * 0.03, -span * 0.05, -span * 0.18);

    // Upper left, ~57 degrees off the slate normal: low enough that every
    // stud throws a visible shadow onto its own brick even with the slate flat.
    key.position.set(-0.6 * span, 0.7 * span, 0.6 * span);
    const cam = key.shadow.camera;
    cam.left = cam.bottom = -0.75 * span;
    cam.right = cam.top = 0.75 * span;
    cam.near = 0.1;
    cam.far = 3 * span;
    cam.updateProjectionMatrix();

    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const fitH = grid.y / 2 / tanHalf;
    const fitW = grid.x / 2 / (tanHalf * aspect);
    const distance = Math.max(fitH, fitW) / FILL + BRICK_HEIGHT;

    camera.aspect = aspect;
    camera.position.set(0, 0, distance);
    camera.near = distance * 0.05;
    camera.far = distance + span;
    camera.updateProjectionMatrix();
  }

  // ---- motion --------------------------------------------------------------

  const target = new THREE.Vector2();
  const tilt = new THREE.Vector2();
  let time = 0;

  return {
    setGrid(gridW, gridH) {
      grid.set(gridW, gridH);
      bricks.setGrid(gridW, gridH);
      layout();
    },

    setSize(width, height) {
      aspect = width / height;
      layout();
    },

    /** nx, ny in -1..1 with +y up; (0, 0) settles the slate flat. */
    setPointer(nx, ny) {
      target.set(nx, ny);
    },

    update(dt) {
      time += dt;
      tilt.lerp(target, 1 - Math.exp(-tiltEase * dt));

      // The slate turns to face the pointer: right of centre swings its face
      // right, above centre tips it up.
      slate.rotation.y = tilt.x * maxTilt;
      slate.rotation.x = -tilt.y * maxTilt;

      if (!reduceMotion.matches) {
        const drift = maxTilt * 0.08;
        slate.position.y = Math.sin(time * bobSpeed) * bobAmplitude * grid.y;
        slate.rotation.x += Math.sin(time * bobSpeed * 0.7) * drift;
        slate.rotation.y += Math.cos(time * bobSpeed * 0.55) * drift;
        slate.rotation.z = Math.sin(time * bobSpeed * 0.45) * drift * 0.5;
      }
    },

    render(renderer) {
      renderer.render(scene, camera);
    },

    dispose() {
      bricks.dispose();
      plateGeometry.dispose();
      plateMaterial.dispose();
      dropShadow.geometry.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
      scene.background.dispose();
      scene.environment.dispose();
      key.shadow.map?.dispose();
    },
  };
}
