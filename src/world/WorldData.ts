import { BUILDINGS, CAMERA, EXPLORATION, WORLD, type ClearingDefinition, type ForestTheme, type PropDefinition } from '../config';
import { createRng, fbm, lerp, type Rng } from '../core/math';
import { Heightfield } from './Heightfield';
import { OpenField } from './OpenField';
import { riverCenterX, riverWidthScale, RoadNetwork } from './Paths';

/**
 * Renderer-agnostic description of the world: terrain, road network, what is
 * placed where and what it collides with. Views build visuals from this data,
 * which is the seam where GLB assets can replace placeholders later.
 */

export type ScatterKind = 'pine' | 'pineSlim' | 'oak' | 'oakAmber' | 'bush' | 'grass' | 'flower' | 'rock';

export interface Placement {
  kind: ScatterKind;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  /** Non-uniform squash/stretch of height, adds silhouette variety. */
  heightScale: number;
  tint: number;
  castShadow: boolean;
}

export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  radius: number;
}

export interface BoxCollider {
  kind: 'box';
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  /** Rotation around Y, same convention as Object3D.rotation.y. */
  rotY: number;
}

export type Collider = CircleCollider | BoxCollider;

export interface BarrierPlacement {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface WorldData {
  roads: RoadNetwork;
  /** Where the forest is open. See OpenField. */
  open: OpenField;
  heightfield: Heightfield;
  placements: Placement[];
  colliders: Collider[];
  barriers: BarrierPlacement[];
  /** Walkable surface height: bridge deck where one exists, else terrain. */
  surfaceHeight(x: number, z: number): number;
  /** Bridge deck height for an X within the bridge span. */
  deckHeight(x: number): number;
}

interface Keepout {
  x: number;
  z: number;
  radius: number;
}

/** World position of a house's door and the spot in front of it. */
export function houseDoorPoint(house: { x: number; z: number; rotY: number; width: number; depth: number }): {
  doorX: number; doorZ: number; standX: number; standZ: number;
} {
  const localX = house.width * WORLD.houseDoorOffset;
  const cos = Math.cos(house.rotY);
  const sin = Math.sin(house.rotY);
  const place = (localZ: number): [number, number] => [house.x + localX * cos + localZ * sin, house.z - localX * sin + localZ * cos];
  const [doorX, doorZ] = place(house.depth / 2);
  const [standX, standZ] = place(house.depth / 2 + WORLD.houseDoorStandOff);
  return { doorX, doorZ, standX, standZ };
}

export function buildWorldData(): WorldData {
  const roads = new RoadNetwork();
  const open = new OpenField();
  const heightfield = new Heightfield(roads);
  const colliders: Collider[] = [];
  const keepouts: Keepout[] = [];

  addStructureColliders(colliders, keepouts);
  addExplorationColliders(colliders, keepouts);
  const barriers = addBarriers(heightfield, colliders);
  addRiverColliders(colliders);

  const { x: bx, z: bz, halfLength, halfWidth, arch } = WORLD.bridge;
  const bridgeEndLeft = heightfield.sample(bx - halfLength, bz);
  const bridgeEndRight = heightfield.sample(bx + halfLength, bz);
  const deckHeight = (x: number): number => {
    const t = (x - (bx - halfLength)) / (halfLength * 2);
    return lerp(bridgeEndLeft, bridgeEndRight, t) + arch * Math.sin(Math.PI * t);
  };
  const surfaceHeight = (x: number, z: number): number =>
    Math.abs(x - bx) < halfLength && Math.abs(z - bz) < halfWidth + 0.2 ? deckHeight(x) : heightfield.sample(x, z);

  addThicket(open, colliders);
  const placements = scatter(new RoadNetwork(false), roads, open, heightfield, keepouts, colliders);
  return { roads, open, heightfield, placements, colliders, barriers, surfaceHeight, deckHeight };
}

function addStructureColliders(colliders: Collider[], keepouts: Keepout[]): void {
  for (const h of WORLD.houses) {
    colliders.push({ kind: 'box', x: h.x, z: h.z, halfX: h.width / 2 + 0.1, halfZ: h.depth / 2 + 0.1, rotY: h.rotY });
    keepouts.push({ x: h.x, z: h.z, radius: Math.max(h.width, h.depth) / 2 + 1.8 });
  }
  const fire = WORLD.campfire;
  colliders.push({ kind: 'circle', x: fire.x, z: fire.z, radius: fire.colliderRadius });
  keepouts.push({ x: fire.x, z: fire.z, radius: 4.5 });
  for (const seat of fire.seats) {
    colliders.push({ kind: 'box', x: fire.x + seat.x, z: fire.z + seat.z, halfX: fire.seatHalfLength, halfZ: fire.seatHalfWidth, rotY: seat.rotY });
  }

  for (const f of WORLD.fences) {
    const dx = f.x2 - f.x1;
    const dz = f.z2 - f.z1;
    const length = Math.hypot(dx, dz);
    // A fence's local X runs along its length: rotation.y maps local +X to (cos, -sin).
    colliders.push({
      kind: 'box',
      x: (f.x1 + f.x2) / 2,
      z: (f.z1 + f.z2) / 2,
      halfX: length / 2,
      halfZ: 0.12,
      rotY: Math.atan2(-dz, dx),
    });
    for (let s = 0; s <= length; s += 2) {
      keepouts.push({ x: f.x1 + (dx * s) / length, z: f.z1 + (dz * s) / length, radius: 1.2 });
    }
  }
  for (const [x, z] of WORLD.lanterns) {
    colliders.push({ kind: 'circle', x, z, radius: 0.22 });
    keepouts.push({ x, z, radius: 1.2 });
  }
  const pile = WORLD.woodpile;
  colliders.push({ kind: 'box', x: pile.x, z: pile.z, halfX: pile.halfX, halfZ: pile.halfZ, rotY: pile.rotY });
  keepouts.push({ x: pile.x, z: pile.z, radius: 2 });

  // Building sites stay clear of scatter. Their colliders are added when construction starts.
  for (const b of BUILDINGS) {
    keepouts.push({ x: b.x, z: b.z, radius: Math.hypot(b.halfX, b.halfZ) + 1.4 });
    keepouts.push({ x: b.anchor[0], z: b.anchor[1], radius: 1.2 });
    keepouts.push({ x: b.stand[0], z: b.stand[1], radius: 1.2 });
  }

  // Bridge side rails: the deck can only be entered from its two ends.
  const b = WORLD.bridge;
  for (const side of [-1, 1]) {
    colliders.push({ kind: 'box', x: b.x, z: b.z + side * (b.halfWidth + 0.1), halfX: b.halfLength, halfZ: 0.1, rotY: 0 });
  }
}

/** Props, chests and the keepouts that hold scatter back from them. */
function addExplorationColliders(colliders: Collider[], keepouts: Keepout[]): void {
  const props: readonly PropDefinition[] = EXPLORATION.props;
  for (const p of props) {
    if (p.solidRadius !== undefined) colliders.push({ kind: 'circle', x: p.x, z: p.z, radius: p.solidRadius });
    if (p.solidBox) colliders.push({ kind: 'box', x: p.x, z: p.z, halfX: p.solidBox[0], halfZ: p.solidBox[1], rotY: p.rotY ?? 0 });
    const reach = p.solidRadius ?? (p.solidBox ? Math.hypot(p.solidBox[0], p.solidBox[1]) : 0.6);
    keepouts.push({ x: p.x, z: p.z, radius: reach + 1.3 });
  }
  for (const t of EXPLORATION.treasures) {
    colliders.push({ kind: 'circle', x: t.x, z: t.z, radius: EXPLORATION.chestSolidRadius });
    keepouts.push({ x: t.x, z: t.z, radius: 2.2 });
  }
  for (const { anchor } of EXPLORATION.landmarks) keepouts.push({ x: anchor[0], z: anchor[1], radius: 1.4 });
}

/**
 * The edge of the forest, as a band of overlapping circles just outside open ground.
 * Only the band is needed: nothing can get past it, so the forest behind stays free.
 */
function addThicket(open: OpenField, colliders: Collider[]): void {
  const { spacing, radius, band, rowOffsetZ } = EXPLORATION.thicket;
  const { minX, maxX, minZ, maxZ } = WORLD.bounds;
  const firstRow = Math.ceil((minZ - radius - band - rowOffsetZ) / spacing);
  const lastRow = Math.floor((maxZ + radius + band - rowOffsetZ) / spacing);
  // Allowance for rounding, so the rows meant to sit exactly one radius out are not skipped.
  const inner = radius - 0.01;
  for (let row = firstRow; row <= lastRow; row++) {
    const z = rowOffsetZ + row * spacing;
    for (let x = minX; x <= maxX; x += spacing) {
      const d = open.distance(x, z);
      if (d >= inner && d < inner + band) colliders.push({ kind: 'circle', x, z, radius });
    }
  }
}

function addRiverColliders(colliders: Collider[]): void {
  const { minZ } = WORLD.strip;
  const { maxZ } = WORLD.bounds;
  const b = WORLD.bridge;
  const half = 0.6;
  for (let z = minZ - 1; z < maxZ + 1; z += half * 2) {
    if (Math.abs(z - b.z) < b.halfWidth + half) continue;
    colliders.push({ kind: 'box', x: riverCenterX(z), z, halfX: WORLD.river.blockHalfWidth, halfZ: half, rotY: 0 });
  }
  // Fill any gap left beside the rails by the fixed sampling step above.
  for (const side of [-1, 1]) {
    const z = b.z + side * (b.halfWidth + half + 0.1);
    colliders.push({ kind: 'box', x: riverCenterX(z), z, halfX: WORLD.river.blockHalfWidth, halfZ: half, rotY: 0 });
  }
}

/** Closes the main road at both ends of the valley. Its branches now lead on into the forest. */
function addBarriers(heightfield: Heightfield, colliders: Collider[]): BarrierPlacement[] {
  const barriers: BarrierPlacement[] = [];
  const add = (x: number, z: number, rotY: number): void => {
    barriers.push({ x, y: heightfield.sample(x, z), z, rotY });
    colliders.push({ kind: 'box', x, z, halfX: WORLD.barrierHalfWidth, halfZ: 0.14, rotY });
  };
  const { minX, maxX } = WORLD.strip;
  add(minX - 0.45, 0.2, Math.PI / 2);
  add(maxX + 0.45, 0.4, Math.PI / 2);
  return barriers;
}

const TREE_HEIGHT: Partial<Record<ScatterKind, number>> = { pine: 5.7, pineSlim: 6.4, oak: 5.2, oakAmber: 5.2 };
const TALLEST_TREE = 6.4 * 1.45;
/** Ground distance hidden per unit of height, at this camera's elevation. */
const VIEW_SLOPE = 1 / Math.tan((CAMERA.elevationDeg * Math.PI) / 180);

/**
 * Jittered-grid scatter. All randomness flows from the fixed world seed.
 *
 * The valley's own scatter runs first, from its original roads and with its own random
 * stream, so it comes out the same as before the map grew. The forest is added after it.
 */
function scatter(valleyRoads: RoadNetwork, allRoads: RoadNetwork, open: OpenField, heightfield: Heightfield, keepouts: Keepout[], colliders: Collider[]): Placement[] {
  const roads = valleyRoads;
  const out: Placement[] = [];
  const treeColliders = new Map<Placement, Collider>();
  const zones = WORLD.scatter;
  const rng = createRng(WORLD.seed);
  const seed = WORLD.seed;

  const isClear = (x: number, z: number, roadMargin: number, riverMargin: number, keepoutMargin = 0): boolean => {
    if (roads.edgeDistance(x, z) < roadMargin) return false;
    if (z > WORLD.river.forestClosesZ && Math.abs(x - riverCenterX(z)) < riverMargin * riverWidthScale(z)) return false;
    for (const k of keepouts) {
      const r = k.radius + keepoutMargin;
      const dx = x - k.x;
      const dz = z - k.z;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  };

  const place = (kind: ScatterKind, x: number, z: number, scale: number, castShadow: boolean, heightScale = 1): void => {
    const placement: Placement = {
      kind, x, z, scale, castShadow, heightScale,
      y: heightfield.sample(x, z) - 0.05,
      rotY: rng() * Math.PI * 2,
      tint: 0.86 + rng() * 0.28,
    };
    out.push(placement);
    const collide = (WORLD.colliderRadius as Partial<Record<ScatterKind, number>>)[kind];
    if (collide && z > WORLD.strip.minZ - 3 && z < WORLD.strip.maxZ + 3) {
      const collider: Collider = { kind: 'circle', x, z, radius: collide * scale };
      colliders.push(collider);
      treeColliders.set(placement, collider);
    }
  };

  const grid = (
    minX: number, maxX: number, minZ: number, maxZ: number, spacing: number,
    visit: (x: number, z: number) => void,
  ): void => {
    for (let gz = minZ; gz < maxZ; gz += spacing) {
      for (let gx = minX; gx < maxX; gx += spacing) {
        visit(gx + (rng() - 0.5) * spacing * 0.85, gz + (rng() - 0.5) * spacing * 0.85);
      }
    }
  };

  // The woodlot comes first so that later scatter keeps its distance.
  for (const [x, z] of WORLD.woodlot) {
    place(rng() < 0.6 ? 'pine' : 'oak', x, z, 0.72 + rng() * 0.16, true, 0.92 + rng() * 0.16);
    keepouts.push({ x, z, radius: 2 });
  }

  const pickTree = (r: Rng, pineBias: number): ScatterKind => {
    const v = r();
    if (v < pineBias * 0.62) return 'pine';
    if (v < pineBias) return 'pineSlim';
    return r() < 0.09 ? 'oakAmber' : 'oak';
  };

  // Dense forest wall behind the playable strip.
  const back = zones.backForest;
  grid(-146, 146, back.minZ, back.maxZ, back.spacing, (x, z) => {
    if (!isClear(x, z, 0.9, 8.2)) return;
    const pineBias = 0.42 + fbm(x * 0.03, z * 0.06, 2, seed + 9) * 0.45;
    place(pickTree(rng, pineBias), x, z, 0.74 + rng() * 0.3, z > WORLD.shadowCasterMinZ, 0.9 + rng() * 0.22);
  });

  // A few trees close the gap where the stream runs into the forest, hiding the water's end.
  const streamEndZ = WORLD.valleyTerrainMinZ + 1.2;
  const streamEndX = riverCenterX(streamEndZ);
  for (const offsetX of [-5.5, -2.8, 0, 2.8, 5.5]) {
    const z = streamEndZ + rng() * 0.6;
    place(rng() < 0.5 ? 'pine' : 'oak', streamEndX + offsetX, z, 0.9 + rng() * 0.15, false);
  }

  // Dense forest closing off both ends of the valley.
  const ends = zones.worldEnds;
  for (const sign of [-1, 1]) {
    const a = sign < 0 ? -ends.outerX : ends.innerX;
    const b = sign < 0 ? -ends.innerX : ends.outerX;
    grid(a, b, ends.minZ, ends.maxZ, ends.spacing, (x, z) => {
      place(pickTree(rng, 0.65), x, z, 0.85 + rng() * 0.4, false, 0.9 + rng() * 0.25);
    });
  }

  // Sparse groves across the walkable land.
  const groves = zones.groves;
  grid(-99, 99, WORLD.strip.minZ, groves.maxTreeZ, groves.spacing, (x, z) => {
    if (fbm(x * 0.045, z * 0.1, 2, seed + 21) < groves.threshold) return;
    if (!isClear(x, z, groves.roadMargin, 8.6, 1.2)) return;
    place(pickTree(rng, 0.5), x, z, 0.72 + rng() * 0.35, true, 0.9 + rng() * 0.2);
  });

  // Low foreground that frames the bottom of the screen without hiding the player.
  const fb = zones.frontBushes;
  grid(-146, 146, fb.minZ, fb.maxZ, fb.spacing, (x, z) => {
    if (!isClear(x, z, 0.5, 8)) return;
    place('bush', x, z, 0.7 + rng() * 0.6, z < 16, 0.8 + rng() * 0.3);
  });
  const ft = zones.frontTrees;
  grid(-146, 146, ft.minZ, ft.maxZ, ft.spacing, (x, z) => {
    if (!isClear(x, z, 1, 8.2)) return;
    place(rng() < 0.7 ? 'pineSlim' : 'pine', x, z, 0.55 + rng() * 0.2, false);
  });

  // Roadside and clearing bushes inside the walkable area; no collision, purely dressing.
  grid(-99, 99, -8.5, 8, 9, (x, z) => {
    if (fbm(x * 0.09, z * 0.12, 2, seed + 41) < 0.46) return;
    if (!isClear(x, z, 0.8, 8, 0.2)) return;
    place('bush', x, z, 0.55 + rng() * 0.35, true, 0.8 + rng() * 0.25);
  });

  const rocks = zones.rocks;
  grid(-140, 140, rocks.minZ, rocks.maxZ, rocks.spacing, (x, z) => {
    if (!isClear(x, z, 1.2, 8, 0.6)) return;
    place('rock', x, z, 0.5 + rng() * 0.75, true, 0.7 + rng() * 0.4);
  });

  const grass = zones.grass;
  grid(-140, 140, grass.minZ, grass.maxZ, grass.spacing, (x, z) => {
    if (fbm(x * 0.07, z * 0.16, 2, seed + 57) < grass.threshold) return;
    if (!isClear(x, z, 0.15, 7.2, -0.8)) return;
    place('grass', x, z, 0.8 + rng() * 0.8, false, 0.7 + rng() * 0.5);
  });

  const flowers = zones.flowers;
  grid(-120, 120, flowers.minZ, flowers.maxZ, flowers.spacing, (x, z) => {
    if (fbm(x * 0.06, z * 0.11, 2, seed + 73) < flowers.threshold) return;
    if (!isClear(x, z, 0.3, 7.5, -0.5)) return;
    place('flower', x, z, 0.8 + rng() * 0.5, false);
  });

  const valleyScatter = openPassages(out, treeColliders, open, colliders);
  return valleyScatter.concat(growForest(allRoads, open, heightfield, keepouts, colliders));
}

function isInsideValley(z: number): boolean {
  return z >= WORLD.strip.minZ && z <= WORLD.strip.maxZ;
}

/**
 * How far along the view a tree stands in front of open ground, or Infinity. A tree this
 * far away and tall enough would hide someone standing there, since the camera looks
 * down at it from the south.
 */
function viewDistanceToOpen(open: OpenField, x: number, z: number, countValley: boolean): number {
  const yaw = (CAMERA.yawDeg * Math.PI) / 180;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const reach = TALLEST_TREE * VIEW_SLOPE + EXPLORATION.forest.viewMargin;
  for (let t = 1; t <= reach; t += 1) {
    for (const side of [-1.6, 0, 1.6]) {
      const px = x + fx * t - fz * side;
      const pz = z + fz * t + fx * side;
      if (open.distance(px, pz) < -0.2 && (countValley || !isInsideValley(pz))) return t;
    }
  }
  return Infinity;
}

/** The largest scale at which a tree this far from open ground still leaves that ground in view. */
function fitScale(kind: ScatterKind, heightScale: number, viewDistance: number): number {
  const allowedHeight = (viewDistance - EXPLORATION.forest.viewMargin) / VIEW_SLOPE;
  return allowedHeight / ((TREE_HEIGHT[kind] ?? 1) * heightScale);
}

/**
 * Clears the old forest and foreground wherever a new trail runs through them. Trees that
 * are left would otherwise stand in front of the new paths, so they shrink or turn to bushes.
 */
function openPassages(placements: Placement[], treeColliders: Map<Placement, Collider>, open: OpenField, colliders: Collider[]): Placement[] {
  const removed = new Set<Collider>();
  const kept: Placement[] = [];
  for (const p of placements) {
    if (isInsideValley(p.z)) {
      kept.push(p);
      continue;
    }
    const collider = treeColliders.get(p);
    const d = open.distance(p.x, p.z);
    const isTree = TREE_HEIGHT[p.kind] !== undefined;
    if (d < (isTree ? 1.4 : 0.1) && p.kind !== 'grass' && p.kind !== 'flower') {
      if (collider) removed.add(collider);
      continue;
    }
    if (isTree) {
      const view = viewDistanceToOpen(open, p.x, p.z, false);
      if (view !== Infinity) {
        const fit = fitScale(p.kind, p.heightScale, view);
        if (fit < EXPLORATION.forest.minTreeScale) {
          p.kind = 'bush';
          p.scale = 0.7;
          p.heightScale = 0.9;
          if (collider) removed.add(collider);
        } else if (fit < p.scale) {
          p.scale = fit;
        }
      }
    }
    kept.push(p);
  }
  if (removed.size > 0) {
    let write = 0;
    for (const c of colliders) if (!removed.has(c)) colliders[write++] = c;
    colliders.length = write;
  }
  return kept;
}

/** The forest beyond the valley, and what grows in its clearings. Has its own random stream. */
function growForest(roads: RoadNetwork, open: OpenField, heightfield: Heightfield, keepouts: readonly Keepout[], colliders: Collider[]): Placement[] {
  const out: Placement[] = [];
  const rng = createRng(WORLD.seed + 1000);
  const { forest } = EXPLORATION;
  const { strip } = WORLD;
  const clearings: readonly ClearingDefinition[] = EXPLORATION.clearings;

  const place = (kind: ScatterKind, x: number, z: number, scale: number, castShadow: boolean, heightScale = 1): void => {
    out.push({ kind, x, z, scale, castShadow, heightScale, y: heightfield.sample(x, z) - 0.05, rotY: rng() * Math.PI * 2, tint: 0.86 + rng() * 0.28 });
  };
  const nearRiver = (x: number, z: number, margin: number): boolean => Math.abs(x - riverCenterX(z)) < margin * riverWidthScale(z);
  const isKeptOut = (x: number, z: number): boolean => {
    for (const k of keepouts) if (Math.hypot(x - k.x, z - k.z) < k.radius) return true;
    return false;
  };
  const themeAt = (x: number, z: number): ForestTheme => {
    let best: ForestTheme = EXPLORATION.defaultTheme;
    let bestDist = 30;
    for (const c of clearings) {
      const dist = Math.hypot(x - c.x, z - c.z);
      if (c.theme && dist < bestDist) {
        bestDist = dist;
        best = c.theme;
      }
    }
    return best;
  };
  const pickKind = (theme: ForestTheme): ScatterKind => {
    if (rng() < theme.pine) return rng() < 0.62 ? 'pine' : 'pineSlim';
    return rng() < theme.amber / Math.max(1 - theme.pine, 0.01) ? 'oakAmber' : 'oak';
  };

  const plantTree = (x: number, z: number): void => {
    const d = open.distance(x, z);
    if (d < 1.2 || nearRiver(x, z, 8.2) || roads.edgeDistance(x, z) < 0.9) return;
    // The old forests at the far ends of the valley already cover this.
    if (Math.abs(x) > 100 && z > -10 && z < 32) return;
    const shadow = d < forest.shadowReach;
    if (z > strip.maxZ && z < forest.lowGrowthZ) {
      if (rng() < forest.lowGrowthDensity) place('bush', x, z, 0.7 + rng() * 0.5, false, 0.8 + rng() * 0.3);
      return;
    }
    const kind = pickKind(themeAt(x, z));
    const heightScale = 0.9 + rng() * 0.25;
    let scale = 0.8 + rng() * 0.42;
    const view = viewDistanceToOpen(open, x, z, true);
    if (view !== Infinity) {
      const fit = fitScale(kind, heightScale, view);
      if (fit < forest.minTreeScale) {
        place('bush', x, z, 0.65 + rng() * 0.45, false, 0.8 + rng() * 0.3);
        return;
      }
      scale = Math.min(scale, fit);
    }
    place(kind, x, z, scale, shadow, heightScale);
  };

  const jitteredGrid = (minX: number, maxX: number, minZ: number, maxZ: number, spacing: number, visit: (x: number, z: number) => void): void => {
    for (let gz = minZ; gz < maxZ; gz += spacing) {
      for (let gx = minX; gx < maxX; gx += spacing) {
        visit(gx + (rng() - 0.5) * spacing * 0.8, gz + (rng() - 0.5) * spacing * 0.8);
      }
    }
  };

  const half = forest.halfWidth;
  for (const zone of [forest.north, forest.south]) {
    jitteredGrid(-half, half, zone.minZ, zone.maxZ, zone.spacing, plantTree);
  }

  // A low hedge along the forest edge, so the edge reads as solid wherever it is walked along.
  jitteredGrid(-half, half, forest.north.minZ, forest.south.maxZ, forest.hedgeSpacing, (x, z) => {
    if (isInsideValley(z)) return;
    const d = open.distance(x, z);
    if (d < 0.5 || d > 3.2 || nearRiver(x, z, 7.5)) return;
    if (z > strip.maxZ && z < forest.lowGrowthZ && rng() >= forest.lowGrowthDensity) return;
    // Low and packed together, so a shadow would barely show, at a real cost: this is the most numerous caster.
    place('bush', x, z, 0.6 + rng() * 0.5, false, 0.8 + rng() * 0.35);
  });

  // Ground cover and a few rocks on the open ground itself.
  jitteredGrid(-half, half, forest.north.minZ, forest.south.maxZ, 1.15, (x, z) => {
    if (isInsideValley(z) || open.distance(x, z) > 1 || nearRiver(x, z, 7) || roads.edgeDistance(x, z) < 0.15) return;
    if (fbm(x * 0.09, z * 0.11, 2, WORLD.seed + 91) > 0.42) place('grass', x, z, 0.8 + rng() * 0.8, false, 0.7 + rng() * 0.5);
  });
  jitteredGrid(-half, half, forest.north.minZ, forest.south.maxZ, 2.4, (x, z) => {
    if (isInsideValley(z) || open.distance(x, z) > -0.5 || isKeptOut(x, z)) return;
    let chance = 0.05;
    for (const c of clearings) {
      if (c.flowers && Math.hypot(x - c.x, z - c.z) < c.radius) chance = c.flowers;
    }
    if (rng() < chance) place('flower', x, z, 0.8 + rng() * 0.5, false);
  });
  jitteredGrid(-half, half, forest.north.minZ, forest.south.maxZ, 7, (x, z) => {
    if (isInsideValley(z)) return;
    if (open.distance(x, z) > -1 || isKeptOut(x, z) || roads.edgeDistance(x, z) < 1.6 || rng() < 0.45) return;
    const scale = 0.45 + rng() * 0.5;
    place('rock', x, z, scale, true, 0.7 + rng() * 0.4);
    colliders.push({ kind: 'circle', x, z, radius: WORLD.colliderRadius.rock * scale });
  });
  return out;
}
