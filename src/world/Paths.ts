import { EXPLORATION, WORLD } from '../config';
import { smoothstep } from '../core/math';

/** Road network as sampled polylines, with a bucketed nearest-segment query. */

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
}

const SAMPLES_PER_SPAN = 10;
const BUCKET_SIZE = 8;
/** Queries beyond this distance from any road just report it. */
const QUERY_REACH = 12;

/** Centripetal-free uniform Catmull-Rom; roads only need gentle curves. */
export function sampleSpline(points: readonly (readonly number[])[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    for (let s = 0; s < SAMPLES_PER_SPAN; s++) {
      const t = s / SAMPLES_PER_SPAN;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const last = points[points.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

export class RoadNetwork {
  private readonly buckets = new Map<number, Segment[]>();
  /** Without trails this is the valley's original road network, which its scatter is derived from. */
  constructor(includeTrails = true) {
    this.addRoad(WORLD.roads.main.points, WORLD.roads.main.halfWidth);
    for (const branch of WORLD.roads.branches) {
      this.addRoad(branch.points, branch.halfWidth);
    }
    if (!includeTrails) return;
    for (const trail of EXPLORATION.trails) {
      if (trail.paint > 0) this.addRoad(trail.points, trail.paint);
    }
  }

  /**
   * Signed distance to the nearest road edge: negative on the road surface,
   * positive off it. Capped at QUERY_REACH.
   */
  edgeDistance(x: number, z: number): number {
    const segments = this.buckets.get(Math.floor(x / BUCKET_SIZE));
    if (!segments) return QUERY_REACH;
    let best = QUERY_REACH;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const lenSq = dx * dx + dz * dz;
      let t = ((x - s.ax) * dx + (z - s.az) * dz) / lenSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = s.ax + dx * t - x;
      const pz = s.az + dz * t - z;
      const d = Math.sqrt(px * px + pz * pz) - s.halfWidth;
      if (d < best) best = d;
    }
    return best;
  }

  private addRoad(points: readonly (readonly number[])[], halfWidth: number): void {
    const line = sampleSpline(points);
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const segment: Segment = { ax, az, bx, bz, halfWidth };
      const first = Math.floor((Math.min(ax, bx) - QUERY_REACH) / BUCKET_SIZE);
      const last = Math.floor((Math.max(ax, bx) + QUERY_REACH) / BUCKET_SIZE);
      for (let b = first; b <= last; b++) {
        let list = this.buckets.get(b);
        if (!list) this.buckets.set(b, (list = []));
        list.push(segment);
      }
    }
  }
}

/** River width multiplier at a given depth: 1 along the playable strip, narrowing into the forest. */
export function riverWidthScale(z: number): number {
  const r = WORLD.river;
  return r.taperMinWidth + (1 - r.taperMinWidth) * smoothstep(r.taperFarZ, r.taperNearZ, z);
}

/** Centre of the river at a given depth. It runs along Z and crosses the main road under the bridge. */
export function riverCenterX(z: number): number {
  const r = WORLD.river;
  const blend = smoothstep(r.straightZone, r.meanderBlend, Math.abs(z));
  return r.x + r.meanderAmplitude * Math.sin(z * r.meanderFrequency + 0.6) * blend;
}
