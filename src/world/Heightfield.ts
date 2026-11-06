import { EXPLORATION, WORLD } from '../config';
import { fbm, lerp, smoothstep } from '../core/math';
import { riverCenterX, riverWidthScale, type RoadNetwork } from './Paths';

const { terrain, river, settlementFlatten } = WORLD;

/** Terrain heights baked to a grid. The terrain mesh and gameplay read the same data. */
export class Heightfield {
  readonly columns: number;
  readonly rows: number;
  readonly heights: Float32Array;

  constructor(roads: RoadNetwork) {
    this.columns = Math.ceil((terrain.maxX - terrain.minX) / terrain.cellSize) + 1;
    this.rows = Math.ceil((terrain.maxZ - terrain.minZ) / terrain.cellSize) + 1;
    this.heights = new Float32Array(this.columns * this.rows);
    for (let row = 0; row < this.rows; row++) {
      const z = terrain.minZ + row * terrain.cellSize;
      for (let col = 0; col < this.columns; col++) {
        const x = terrain.minX + col * terrain.cellSize;
        this.heights[row * this.columns + col] = computeHeight(x, z, roads);
      }
    }
  }

  /** Bilinear height lookup, clamped at the terrain's edges. */
  sample(x: number, z: number): number {
    const fx = (x - terrain.minX) / terrain.cellSize;
    const fz = (z - terrain.minZ) / terrain.cellSize;
    const col = Math.min(Math.max(Math.floor(fx), 0), this.columns - 2);
    const row = Math.min(Math.max(Math.floor(fz), 0), this.rows - 2);
    const tx = Math.min(Math.max(fx - col, 0), 1);
    const tz = Math.min(Math.max(fz - row, 0), 1);
    const i = row * this.columns + col;
    const h = this.heights;
    return lerp(lerp(h[i], h[i + 1], tx), lerp(h[i + this.columns], h[i + this.columns + 1], tx), tz);
  }
}

function computeHeight(x: number, z: number, roads: RoadNetwork): number {
  const broad = (fbm(x * 0.028, z * 0.04, 3, WORLD.seed) - 0.5) * 1.5;
  let h = broad;
  h += (fbm(x * 0.05, z * 0.09, 2, WORLD.seed + 5) - 0.3) * WORLD.ridgeRise * smoothstep(-8, -26, z) * 1.5;
  h -= WORLD.frontFall * smoothstep(10, 30, z);
  h += WORLD.endRise * smoothstep(100, 128, Math.abs(x));

  // Settlement ground and roads are flattened toward a gentle base level.
  const sdx = x - settlementFlatten.x;
  const sdz = z - settlementFlatten.z;
  const sDist = Math.sqrt(sdx * sdx + sdz * sdz);
  h = lerp(h, 0, smoothstep(settlementFlatten.radius, settlementFlatten.radius * 0.45, sDist));
  const roadEdge = roads.edgeDistance(x, z);
  h = lerp(h, broad * 0.15, smoothstep(3.2, 0.2, roadEdge) * 0.92);

  // Clearings are level enough to camp on.
  for (const c of EXPLORATION.clearings) {
    const dist = Math.hypot(x - c.x, z - c.z);
    if (dist < c.radius + 3) h = lerp(h, broad * 0.2, smoothstep(c.radius + 3, c.radius * 0.6, dist) * 0.9);
  }

  // The river cuts through everything else.
  const riverDist = Math.abs(x - riverCenterX(z)) / riverWidthScale(z);
  h = lerp(h, river.bedHeight, smoothstep(river.bankOuter, river.bankInner, riverDist));
  return h;
}
