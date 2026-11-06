/** Small allocation-free math helpers shared by simulation and rendering. */

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite step from edge0 to edge1. Edges may be reversed for a falling step. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent smoothing: closes half the remaining gap every `halfLife` seconds. */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(2, -dt / halfLife);
}

/** Wraps an angle to the range [-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

export function dampAngle(current: number, target: number, halfLife: number, dt: number): number {
  const delta = wrapAngle(target - current);
  return wrapAngle(current + delta - delta * Math.pow(2, -dt / halfLife));
}

export type Rng = () => number;

/** Deterministic seeded PRNG (mulberry32), so the world is identical on each load. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Value noise in [0, 1]. When `period` is above zero the lattice wraps every
 * `period` cells, which is what makes the shared detail texture tile.
 */
export function valueNoise(x: number, y: number, seed = 0, period = 0): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const tx = x - fx;
  const ty = y - fy;
  const u = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
  const v = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  let x0 = fx;
  let x1 = fx + 1;
  let y0 = fy;
  let y1 = fy + 1;
  if (period > 0) {
    x0 = ((x0 % period) + period) % period;
    x1 = ((x1 % period) + period) % period;
    y0 = ((y0 % period) + period) % period;
    y1 = ((y1 % period) + period) % period;
  }
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Fractal value noise normalized to [0, 1]. */
export function fbm(x: number, y: number, octaves: number, seed = 0, period = 0): number {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let px = period;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, y, seed + i * 17, px) * amp;
    total += amp;
    amp *= 0.5;
    x *= 2;
    y *= 2;
    px *= 2;
  }
  return sum / total;
}
