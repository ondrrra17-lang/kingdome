import { PLAYER } from '../config';
import { damp, dampAngle } from '../core/math';
import type { PlayerState } from '../core/GameState';
import type { Input } from '../core/Input';
import type { WorldData } from '../world/WorldData';
import type { CollisionWorld } from './CollisionWorld';

/** Turns input into velocity, moves the player, resolves collision and follows the ground. */
export class PlayerMovementSystem {
  constructor(
    private readonly input: Input,
    private readonly collision: CollisionWorld,
    private readonly world: WorldData,
  ) {}

  update(player: PlayerState, dt: number): void {
    player.prevX = player.x;
    player.prevY = player.y;
    player.prevZ = player.z;
    player.prevFacing = player.facing;
    player.prevStride = player.stride;

    let inputX = this.input.moveX;
    let inputZ = this.input.moveZ;
    const inputLength = Math.hypot(inputX, inputZ);
    const hasInput = inputLength > 0;
    if (hasInput) {
      inputX /= inputLength;
      inputZ /= inputLength;
    }

    const topSpeed = this.input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const targetVx = inputX * topSpeed;
    const targetVz = inputZ * topSpeed;

    // Choose the ramp rate from what the player is asking for, then step velocity toward the target.
    const opposing = player.vx * targetVx + player.vz * targetVz < 0;
    const rate = !hasInput ? PLAYER.deceleration : opposing ? PLAYER.reverseAcceleration : PLAYER.acceleration;
    const dvx = targetVx - player.vx;
    const dvz = targetVz - player.vz;
    const dvLength = Math.hypot(dvx, dvz);
    const maxStep = rate * dt;
    if (dvLength <= maxStep) {
      player.vx = targetVx;
      player.vz = targetVz;
    } else {
      player.vx += (dvx / dvLength) * maxStep;
      player.vz += (dvz / dvLength) * maxStep;
    }

    const startX = player.x;
    const startZ = player.z;
    player.x += player.vx * dt;
    player.z += player.vz * dt;
    this.collision.resolve(player, PLAYER.radius);

    // Distance actually covered after collision, so the legs stop when pinned against a wall.
    const moved = Math.hypot(player.x - startX, player.z - startZ);
    player.speed = moved / dt;
    player.stride += moved / PLAYER.strideLength;
    player.distanceTravelled += moved;

    if (hasInput) {
      player.facing = dampAngle(player.facing, Math.atan2(inputX, inputZ), PLAYER.turnHalfLife, dt);
    }
    player.y = damp(player.y, this.world.surfaceHeight(player.x, player.z), PLAYER.heightHalfLife, dt);
  }
}
