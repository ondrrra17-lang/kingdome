import { NPC } from '../../config';
import { damp, dampAngle } from '../../core/math';
import type { NpcState } from '../../entities/Npc';
import type { CollisionWorld } from '../CollisionWorld';

export interface LocomotionWorld {
  collision: CollisionWorld;
  surfaceHeight(x: number, z: number): number;
}

const STOPPED_SPEED = 0.25;

/** Moves one villager for one fixed step: path following, avoidance, collision, turning. */
export function stepLocomotion(
  npc: NpcState, dt: number, npcs: readonly NpcState[],
  playerX: number, playerZ: number, world: LocomotionWorld,
): void {
  npc.prevX = npc.x;
  npc.prevY = npc.y;
  npc.prevZ = npc.z;
  npc.prevFacing = npc.facing;
  npc.prevStride = npc.stride;
  if (npc.indoors) return;

  const attentive = npc.attentionTimer > 0;
  let desiredX = 0;
  let desiredZ = 0;
  const following = !attentive && npc.state === 'walk' && npc.pathStatus === 'ready';
  if (following && npc.pathIndex < npc.pathLength) {
    const isLast = npc.pathIndex === npc.pathLength - 1;
    const dx = npc.pathX[npc.pathIndex] - npc.x;
    const dz = npc.pathZ[npc.pathIndex] - npc.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < (isLast ? NPC.arriveRadius : NPC.waypointRadius)) {
      npc.pathIndex++;
    } else {
      // Ease into the final stop instead of braking at the last moment.
      const speed = isLast && dist < 1 ? npc.walkSpeed * Math.max(dist, 0.45) : npc.walkSpeed;
      desiredX = (dx / dist) * speed;
      desiredZ = (dz / dist) * speed;
    }
  } else if (following) {
    // Out of waypoints. A long path may have been cut short, so check against the real goal.
    const gx = npc.goalX - npc.x;
    const gz = npc.goalZ - npc.z;
    if (gx * gx + gz * gz <= NPC.closeEnough * NPC.closeEnough) npc.arrived = true;
    else npc.pathStatus = 'pending';
  }

  // Gentle avoidance of the player and other villagers, with a sideways bias so head-on pairs pass.
  const moving = desiredX !== 0 || desiredZ !== 0;
  for (let i = 0; i < npcs.length; i++) {
    const other = npcs[i];
    if (other === npc || other.indoors || other.dormant) continue;
    const dx = npc.x - other.x;
    const dz = npc.z - other.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < NPC.separationRadius * NPC.separationRadius && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const weight = (1 - dist / NPC.separationRadius) * NPC.separationStrength;
      desiredX += (dx / dist) * weight;
      desiredZ += (dz / dist) * weight;
      if (moving) {
        desiredX += (-dz / dist) * weight * 0.6;
        desiredZ += (dx / dist) * weight * 0.6;
      }
    }
  }
  const pdx = npc.x - playerX;
  const pdz = npc.z - playerZ;
  const playerDistSq = pdx * pdx + pdz * pdz;
  if (playerDistSq < NPC.playerSpaceRadius * NPC.playerSpaceRadius && playerDistSq > 1e-6) {
    const dist = Math.sqrt(playerDistSq);
    const weight = (1 - dist / NPC.playerSpaceRadius) * NPC.separationStrength * 1.4;
    desiredX += (pdx / dist) * weight;
    desiredZ += (pdz / dist) * weight;
  }

  // Velocity ramps toward the target for smooth starts and stops.
  const dvx = desiredX - npc.vx;
  const dvz = desiredZ - npc.vz;
  const dv = Math.sqrt(dvx * dvx + dvz * dvz);
  const maxStep = NPC.acceleration * dt;
  if (dv <= maxStep) {
    npc.vx = desiredX;
    npc.vz = desiredZ;
  } else {
    npc.vx += (dvx / dv) * maxStep;
    npc.vz += (dvz / dv) * maxStep;
  }

  const startX = npc.x;
  const startZ = npc.z;
  npc.x += npc.vx * dt;
  npc.z += npc.vz * dt;
  world.collision.resolve(npc, NPC.radius);

  const moved = Math.hypot(npc.x - startX, npc.z - startZ);
  npc.speed = moved / dt;
  npc.stride += moved / NPC.strideLength;
  npc.y = damp(npc.y, world.surfaceHeight(npc.x, npc.z), NPC.heightHalfLife, dt);

  if (attentive) {
    npc.facing = dampAngle(npc.facing, Math.atan2(playerX - npc.x, playerZ - npc.z), NPC.turnHalfLife, dt);
  } else if (npc.speed > STOPPED_SPEED) {
    npc.facing = dampAngle(npc.facing, Math.atan2(npc.vx, npc.vz), NPC.turnHalfLife, dt);
  } else if (npc.hasFaceTarget && npc.state !== 'walk') {
    npc.facing = dampAngle(npc.facing, Math.atan2(npc.faceX - npc.x, npc.faceZ - npc.z), NPC.turnHalfLife, dt);
  }

  updateStuck(npc, dt, attentive);
}

/** Notices a villager that wants to walk but is not getting anywhere, and recovers. */
function updateStuck(npc: NpcState, dt: number, attentive: boolean): void {
  if (attentive || npc.state !== 'walk' || npc.pathStatus !== 'ready' || npc.speed > STOPPED_SPEED) {
    npc.stuckTimer = 0;
    return;
  }
  npc.stuckTimer += dt;
  if (npc.stuckTimer < NPC.stuckSeconds) return;
  npc.stuckTimer = 0;

  const gx = npc.goalX - npc.x;
  const gz = npc.goalZ - npc.z;
  if (gx * gx + gz * gz <= NPC.closeEnough * NPC.closeEnough) {
    // Someone is standing on the exact spot; this is near enough.
    npc.arrived = true;
    return;
  }
  npc.stuckCount++;
  npc.pathStatus = npc.stuckCount > NPC.maxStuckRepaths ? 'failed' : 'pending';
}
