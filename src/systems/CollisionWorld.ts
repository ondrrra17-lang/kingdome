import { WORLD } from '../config';
import type { Collider } from '../world/WorldData';

export interface CollisionBody {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

const MAX_ITERATIONS = 3;
const KEY_OFFSET = 4096;

function cellKey(ix: number, iz: number): number {
  return (ix + KEY_OFFSET) * 8192 + (iz + KEY_OFFSET);
}

/**
 * Static colliders in a uniform grid. Resolves a moving circle by pushing it out
 * of whatever it overlaps and cancelling only the velocity going into the
 * surface, which gives wall sliding for free. Queries do not allocate.
 */
export class CollisionWorld {
  private readonly cells = new Map<number, Collider[]>();
  private readonly cellSize: number = WORLD.collisionCellSize;

  constructor(readonly colliders: Collider[]) {
    for (const collider of colliders) this.insert(collider);
  }

  /** Moves `body` out of any overlap and inside the world bounds. Returns true if anything was hit. */
  resolve(body: CollisionBody, radius: number): boolean {
    let hitAny = false;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let hit = false;
      const minX = Math.floor((body.x - radius) / this.cellSize);
      const maxX = Math.floor((body.x + radius) / this.cellSize);
      const minZ = Math.floor((body.z - radius) / this.cellSize);
      const maxZ = Math.floor((body.z + radius) / this.cellSize);
      for (let ix = minX; ix <= maxX; ix++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const list = this.cells.get(cellKey(ix, iz));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const collider = list[i];
            const pushed = collider.kind === 'circle' ? pushOutOfCircle(body, radius, collider.x, collider.z, collider.radius) : pushOutOfBox(body, radius, collider.x, collider.z, collider.halfX, collider.halfZ, collider.rotY);
            hit = pushed || hit;
          }
        }
      }
      hitAny = hit || hitAny;
      if (!hit) break;
    }
    return clampToBounds(body, radius) || hitAny;
  }

  /** Adds a collider during play, such as a finished building. */
  add(collider: Collider): void {
    this.colliders.push(collider);
    this.insert(collider);
  }

  /** Removes a temporary obstacle, such as a closed crossing. */
  remove(collider: Collider): void {
    const index = this.colliders.indexOf(collider);
    if (index < 0) return;
    this.colliders.splice(index, 1);
    this.cells.clear();
    for (const remaining of this.colliders) this.insert(remaining);
  }

  /** Whether a circle at this spot would overlap any collider. Nothing is moved. */
  isBlocked(x: number, z: number, radius: number): boolean {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const list = this.cells.get(cellKey(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (circleOverlapsCollider(c, x, z, radius)) return true;
        }
      }
    }
    return false;
  }

  private insert(collider: Collider): void {
    let extentX: number;
    let extentZ: number;
    if (collider.kind === 'circle') {
      extentX = extentZ = collider.radius;
    } else {
      const cos = Math.abs(Math.cos(collider.rotY));
      const sin = Math.abs(Math.sin(collider.rotY));
      extentX = collider.halfX * cos + collider.halfZ * sin;
      extentZ = collider.halfX * sin + collider.halfZ * cos;
    }
    const minX = Math.floor((collider.x - extentX) / this.cellSize);
    const maxX = Math.floor((collider.x + extentX) / this.cellSize);
    const minZ = Math.floor((collider.z - extentZ) / this.cellSize);
    const maxZ = Math.floor((collider.z + extentZ) / this.cellSize);
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const key = cellKey(ix, iz);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(collider);
      }
    }
  }
}

const probe: CollisionBody = { x: 0, z: 0, vx: 0, vz: 0 };

/** Whether a circle overlaps one collider. Nothing is moved. */
export function circleOverlapsCollider(collider: Collider, x: number, z: number, radius: number): boolean {
  probe.x = x;
  probe.z = z;
  return collider.kind === 'circle'
    ? pushOutOfCircle(probe, radius, collider.x, collider.z, collider.radius)
    : pushOutOfBox(probe, radius, collider.x, collider.z, collider.halfX, collider.halfZ, collider.rotY);
}

function applyPush(body: CollisionBody, nx: number, nz: number, depth: number): void {
  body.x += nx * depth;
  body.z += nz * depth;
  const into = body.vx * nx + body.vz * nz;
  if (into < 0) {
    body.vx -= into * nx;
    body.vz -= into * nz;
  }
}

function pushOutOfCircle(body: CollisionBody, radius: number, cx: number, cz: number, cr: number): boolean {
  const dx = body.x - cx;
  const dz = body.z - cz;
  const reach = radius + cr;
  const distSq = dx * dx + dz * dz;
  if (distSq >= reach * reach) return false;
  const dist = Math.sqrt(distSq);
  if (dist < 1e-6) {
    applyPush(body, 1, 0, reach);
  } else {
    applyPush(body, dx / dist, dz / dist, reach - dist);
  }
  return true;
}

function pushOutOfBox(body: CollisionBody, radius: number, cx: number, cz: number, halfX: number, halfZ: number, rotY: number): boolean {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const dx = body.x - cx;
  const dz = body.z - cz;
  // World -> box space; Object3D.rotation.y maps local (x, z) to world (x cos + z sin, -x sin + z cos).
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const nearX = lx < -halfX ? -halfX : lx > halfX ? halfX : lx;
  const nearZ = lz < -halfZ ? -halfZ : lz > halfZ ? halfZ : lz;
  let ox = lx - nearX;
  let oz = lz - nearZ;
  const distSq = ox * ox + oz * oz;
  if (distSq >= radius * radius) return false;

  let depth: number;
  if (distSq > 1e-10) {
    const dist = Math.sqrt(distSq);
    ox /= dist;
    oz /= dist;
    depth = radius - dist;
  } else {
    // Centre inside the box: leave through the closest face.
    const toX = halfX - Math.abs(lx);
    const toZ = halfZ - Math.abs(lz);
    if (toX < toZ) {
      ox = lx >= 0 ? 1 : -1;
      oz = 0;
      depth = toX + radius;
    } else {
      ox = 0;
      oz = lz >= 0 ? 1 : -1;
      depth = toZ + radius;
    }
  }
  // Box space -> world.
  applyPush(body, ox * cos + oz * sin, -ox * sin + oz * cos, depth);
  return true;
}

function clampToBounds(body: CollisionBody, radius: number): boolean {
  const { minX, maxX, minZ, maxZ } = WORLD.bounds;
  let hit = false;
  if (body.x < minX + radius) {
    body.x = minX + radius;
    if (body.vx < 0) body.vx = 0;
    hit = true;
  } else if (body.x > maxX - radius) {
    body.x = maxX - radius;
    if (body.vx > 0) body.vx = 0;
    hit = true;
  }
  if (body.z < minZ + radius) {
    body.z = minZ + radius;
    if (body.vz < 0) body.vz = 0;
    hit = true;
  } else if (body.z > maxZ - radius) {
    body.z = maxZ - radius;
    if (body.vz > 0) body.vz = 0;
    hit = true;
  }
  return hit;
}
