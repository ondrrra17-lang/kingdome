import { MathUtils, OrthographicCamera, Vector3 } from 'three';
import { CAMERA, PLAYER, WORLD } from '../config';
import { clamp, damp } from '../core/math';

/**
 * Where the camera's depth should be for a player at this Z. Inside the valley it
 * under-follows as it always has. Beyond it, it catches up and then tracks the
 * player, so the forest scrolls instead of the player leaving the screen.
 */
export function cameraDepthTarget(z: number): number {
  const { minZ, maxZ } = WORLD.strip;
  const follow = CAMERA.depthFollow;
  if (z > maxZ) return Math.min(maxZ * follow + (z - maxZ) * CAMERA.southCatchUp, z + CAMERA.southLead);
  if (z < minZ) return Math.max(minZ * follow + (z - minZ) * CAMERA.northCatchUp, z);
  return z * follow;
}

/** The north limit of what is drawn, for a camera at this depth. See CAMERA.horizon. */
export function horizonForFocus(focusZ: number): number {
  const { valleyZ, catchUp, northReach } = CAMERA.horizon;
  const stillUntil = WORLD.strip.minZ * CAMERA.depthFollow;
  if (focusZ >= stillUntil) return valleyZ;
  return Math.max(valleyZ + (focusZ - stillUntil) * catchUp, focusZ - northReach);
}

/**
 * Orthographic camera at a fixed angle that tracks a point with damping.
 *
 * Depth is intentionally under-followed: only `depthFollow` of the player's Z
 * reaches the camera, so walking in depth moves the character on screen while
 * the composition stays nearly still.
 */
export class CameraRig {
  readonly camera: OrthographicCamera;
  /** Smoothed world point the camera is centred on (before the screen-anchor offset). */
  readonly focus = new Vector3();

  private readonly backward = new Vector3();
  private readonly up = new Vector3();
  private readonly right = new Vector3();
  private lookAhead = 0;
  private viewHeight: number = CAMERA.viewHeight;
  private viewWidth: number = CAMERA.viewHeight;
  private readonly sinElevation = Math.sin(MathUtils.degToRad(CAMERA.elevationDeg));

  constructor() {
    this.camera = new OrthographicCamera(-1, 1, 1, -1, CAMERA.near, CAMERA.far);
    const elevation = MathUtils.degToRad(CAMERA.elevationDeg);
    const yaw = MathUtils.degToRad(CAMERA.yawDeg);
    this.backward.set(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation));
    // The camera's orientation never changes, so it is set once rather than via per-frame lookAt.
    this.camera.position.copy(this.backward);
    this.camera.lookAt(0, 0, 0);
    this.camera.position.set(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(this.camera.matrixWorld, 1);
  }

  get horizonZ(): number {
    return horizonForFocus(this.focus.z);
  }

  /** North end of the ground the camera can see, whichever comes first: horizon or top of screen. */
  get visibleNorthZ(): number {
    const groundToTop = ((1 - CAMERA.anchorScreenY) * this.viewHeight) / this.sinElevation;
    return Math.max(this.horizonZ - CAMERA.horizon.band, this.focus.z - groundToTop - this.groundMargin);
  }

  /** South end of the ground the camera can see, at the bottom of the screen. */
  get visibleSouthZ(): number {
    return this.focus.z + (CAMERA.anchorScreenY * this.viewHeight) / this.sinElevation + this.groundMargin;
  }

  /** Whether a point is close enough to the view to be worth animating. */
  isNearView(x: number, z: number, margin: number): boolean {
    return Math.abs(x - this.focus.x) < this.viewWidth / 2 + margin
      && z > this.horizonZ && z < this.visibleSouthZ + margin;
  }

  /** Covers uneven ground, and the view's slight turn at the screen's edges. */
  private get groundMargin(): number {
    return CAMERA.groundMargin + (this.viewWidth / 2) * Math.tan(MathUtils.degToRad(CAMERA.yawDeg));
  }

  /** Half of the current view width in world units; scenery and shadows size themselves from it. */
  get halfViewWidth(): number {
    return this.viewWidth / 2;
  }

  setViewport(width: number, height: number): void {
    const aspect = width / height;
    // Keep the framing height unless the window is so narrow that it would lose too much width.
    this.viewHeight = Math.max(CAMERA.viewHeight, CAMERA.minViewWidth / aspect);
    this.viewWidth = this.viewHeight * aspect;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.left = -this.viewWidth / 2;
    this.camera.right = this.viewWidth / 2;
    this.camera.updateProjectionMatrix();
    this.applyTransform();
  }

  /** Jumps to the target without smoothing, for the first frame. */
  snapTo(x: number, y: number, z: number): void {
    this.focus.set(
      clamp(x, -CAMERA.xClamp, CAMERA.xClamp),
      y * CAMERA.heightFollow,
      cameraDepthTarget(z),
    );
    this.lookAhead = 0;
    this.applyTransform();
  }

  update(targetX: number, targetY: number, targetZ: number, velocityX: number, dt: number): void {
    this.lookAhead = damp(this.lookAhead, (velocityX / PLAYER.sprintSpeed) * CAMERA.lookAhead, CAMERA.lookAheadHalfLife, dt);
    const desiredX = clamp(targetX + this.lookAhead, -CAMERA.xClamp, CAMERA.xClamp);
    this.focus.x = damp(this.focus.x, desiredX, CAMERA.xHalfLife, dt);
    this.focus.y = damp(this.focus.y, targetY * CAMERA.heightFollow, CAMERA.heightHalfLife, dt);
    this.focus.z = damp(this.focus.z, cameraDepthTarget(targetZ), CAMERA.depthHalfLife, dt);
    this.applyTransform();
  }

  private applyTransform(): void {
    // Shift the view so the focus sits at anchorScreenY rather than at screen centre.
    const anchorOffset = (0.5 - CAMERA.anchorScreenY) * this.viewHeight;
    this.camera.position
      .copy(this.focus)
      .addScaledVector(this.up, anchorOffset)
      .addScaledVector(this.backward, CAMERA.distance);
  }
}
