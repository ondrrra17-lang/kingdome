import { EXPLORATION, WORLD } from '../config';
import { sampleSpline } from './Paths';

/** Trails further than this report no distance of their own. */
const TRAIL_REACH = 12;
const FAR_AWAY = 40;
const CELL = 1;

/** Radius of a clearing in a given direction: wobbled, so no clearing reads as a circle. */
function clearingRadius(radius: number, angle: number, seed: number): number {
  return radius * (1 + 0.09 * Math.sin(angle * 3 + seed) + 0.05 * Math.sin(angle * 5 + seed * 2.3));
}

/**
 * Where the forest is open, as a signed distance baked to a grid: negative on open
 * ground (the valley, trails, clearings), positive inside the forest. Collision,
 * scatter, terrain height and the ground mask all read this one field, so nothing
 * can disagree about where the forest edge is.
 */
export class OpenField {
  private readonly columns: number;
  private readonly rows: number;
  private readonly values: Float32Array;

  constructor() {
    const { terrain, strip } = WORLD;
    this.columns = Math.ceil((terrain.maxX - terrain.minX) / CELL) + 1;
    this.rows = Math.ceil((terrain.maxZ - terrain.minZ) / CELL) + 1;
    this.values = new Float32Array(this.columns * this.rows);

    for (let row = 0; row < this.rows; row++) {
      const z = terrain.minZ + row * CELL;
      for (let col = 0; col < this.columns; col++) {
        const x = terrain.minX + col * CELL;
        // Signed distance to the valley's rectangle.
        const dx = Math.max(strip.minX - x, x - strip.maxX);
        const dz = Math.max(strip.minZ - z, z - strip.maxZ);
        let d = dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
        EXPLORATION.clearings.forEach((c, seed) => {
          const cx = x - c.x;
          const cz = z - c.z;
          const edge = clearingRadius(c.radius, Math.atan2(cz, cx), seed);
          d = Math.min(d, Math.hypot(cx, cz) - edge);
        });
        this.values[row * this.columns + col] = Math.min(d, FAR_AWAY);
      }
    }
    for (const trail of EXPLORATION.trails) this.stampTrail(trail.points, trail.open);
  }

  /** Bilinear lookup, clamped at the edges. */
  distance(x: number, z: number): number {
    const { terrain } = WORLD;
    const fx = (x - terrain.minX) / CELL;
    const fz = (z - terrain.minZ) / CELL;
    const col = Math.min(Math.max(Math.floor(fx), 0), this.columns - 2);
    const row = Math.min(Math.max(Math.floor(fz), 0), this.rows - 2);
    const tx = Math.min(Math.max(fx - col, 0), 1);
    const tz = Math.min(Math.max(fz - row, 0), 1);
    const i = row * this.columns + col;
    const v = this.values;
    const near = v[i] + (v[i + 1] - v[i]) * tx;
    const far = v[i + this.columns] + (v[i + this.columns + 1] - v[i + this.columns]) * tx;
    return near + (far - near) * tz;
  }

  /** Lowers the field around each segment of a trail. Only nearby cells are touched. */
  private stampTrail(points: readonly (readonly [number, number])[], open: number): void {
    const { terrain } = WORLD;
    const line = sampleSpline(points);
    for (let s = 0; s < line.length - 1; s++) {
      const [ax, az] = line[s];
      const [bx, bz] = line[s + 1];
      const abx = bx - ax;
      const abz = bz - az;
      const lengthSq = abx * abx + abz * abz || 1;
      const firstCol = Math.max(Math.floor((Math.min(ax, bx) - TRAIL_REACH - terrain.minX) / CELL), 0);
      const lastCol = Math.min(Math.ceil((Math.max(ax, bx) + TRAIL_REACH - terrain.minX) / CELL), this.columns - 1);
      const firstRow = Math.max(Math.floor((Math.min(az, bz) - TRAIL_REACH - terrain.minZ) / CELL), 0);
      const lastRow = Math.min(Math.ceil((Math.max(az, bz) + TRAIL_REACH - terrain.minZ) / CELL), this.rows - 1);
      for (let row = firstRow; row <= lastRow; row++) {
        const z = terrain.minZ + row * CELL;
        for (let col = firstCol; col <= lastCol; col++) {
          const x = terrain.minX + col * CELL;
          let t = ((x - ax) * abx + (z - az) * abz) / lengthSq;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(ax + abx * t - x, az + abz * t - z) - open;
          const cell = row * this.columns + col;
          if (d < this.values[cell]) this.values[cell] = d;
        }
      }
    }
  }
}
