import { CircleGeometry, Group, Mesh, MeshBasicMaterial, type Texture, Vector3 } from 'three';
import { lerp, lerpAngle, wrapAngle } from '../core/math';
import type { CharacterMotion, CharacterPose, CharacterTool, CharacterVisual } from './CharacterVisual';

/** The part of a simulated body that drawing needs. PlayerState and NpcState both satisfy it. */
export interface ActorState {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  facing: number;
  prevFacing: number;
  stride: number;
  prevStride: number;
  speed: number;
}

/**
 * Presents a simulated body on screen. It only reads state, interpolating between
 * the last two simulation steps so motion is smooth at any refresh rate.
 */
export class ActorView {
  readonly group = new Group();
  /** Interpolated world position for this frame. */
  readonly position = new Vector3();

  private readonly motion: CharacterMotion = {
    stride: 0, speedRatio: 0, acceleration: 0, turnRate: 0, frameDt: 0, time: 0,
    pose: 'none', carrying: false, tool: 'none',
  };
  private lastSpeed = 0;
  private lastFacing = 0;

  constructor(
    private readonly character: CharacterVisual,
    blobTexture: Texture,
    private readonly fullGaitSpeed: number,
  ) {
    this.group.add(character.object);

    // Soft contact shadow that keeps the character grounded when real shadows fade at night.
    const geometry = new CircleGeometry(0.72, 16);
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshBasicMaterial({
      map: blobTexture,
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const blob = new Mesh(geometry, material);
    blob.position.y = 0.04;
    this.group.add(blob);
  }

  dispose(): void {
    this.character.dispose?.();
  }

  setAction(pose: CharacterPose, carrying: boolean, tool: CharacterTool): void {
    this.motion.pose = pose;
    this.motion.carrying = carrying;
    this.motion.tool = tool;
  }

  sync(actor: ActorState, alpha: number, frameDt: number, time: number): void {
    this.position.set(
      lerp(actor.prevX, actor.x, alpha),
      lerp(actor.prevY, actor.y, alpha),
      lerp(actor.prevZ, actor.z, alpha),
    );
    this.group.position.copy(this.position);

    const facing = lerpAngle(actor.prevFacing, actor.facing, alpha);
    this.character.object.rotation.y = facing;

    const safeDt = Math.max(frameDt, 1e-4);
    const m = this.motion;
    m.stride = lerp(actor.prevStride, actor.stride, alpha);
    m.speedRatio = actor.speed / this.fullGaitSpeed;
    m.acceleration = (actor.speed - this.lastSpeed) / safeDt;
    m.turnRate = wrapAngle(facing - this.lastFacing) / safeDt;
    m.frameDt = frameDt;
    m.time = time;
    this.lastSpeed = actor.speed;
    this.lastFacing = facing;
    this.character.update(m);
  }
}
