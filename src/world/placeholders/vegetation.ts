import type { BufferGeometry } from 'three';
import { PALETTE } from '../../config';
import { createRng } from '../../core/math';
import { LowPolyBuilder } from '../../rendering/LowPolyBuilder';
import type { ScatterKind } from '../WorldData';

/** Instanced placeholder scenery. Each returns one merged, vertex-colored mesh in local space. */

function pine(seed: number, tiers: number, height: number, radius: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  b.cylinder(0.13, 0.27, height * 0.32, 6, { at: [0, height * 0.14, 0], color: PALETTE.trunk.low, colorTop: PALETTE.trunk.high });
  const canopyBase = height * 0.2;
  const tierHeight = ((height - canopyBase) / tiers) * 1.5;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = canopyBase + (height - canopyBase - tierHeight) * (i / Math.max(tiers - 1, 1));
    b.cone(radius * (1 - t * 0.62), tierHeight, 7, {
      at: [0, y, 0],
      rot: [0, rng() * 6, 0],
      color: PALETTE.pine.low,
      colorTop: PALETTE.pine.high,
      jitter: 0.2,
      rng,
    });
  }
  return b.build();
}

function broadleaf(seed: number, colors: { low: number; high: number }): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  b.cylinder(0.17, 0.34, 2.3, 6, { at: [0, 1.1, 0], color: PALETTE.trunk.low, colorTop: PALETTE.trunk.high });
  b.box(0.13, 1.1, 0.13, { at: [0.36, 2.0, 0.05], rot: [0.1, 0, -0.7], color: PALETTE.trunk.high });
  const lobes: readonly (readonly [number, number, number, number])[] = [
    [0, 3.45, 0, 1.55], [0.98, 2.95, 0.2, 1.05], [-0.92, 3.0, -0.25, 1.15], [0.1, 2.82, 0.8, 0.95], [-0.15, 4.25, -0.1, 0.95],
  ];
  for (const [x, y, z, radius] of lobes) {
    // Only the largest lobes get the finer mesh; the silhouette is what matters at this zoom.
    b.blob(radius, radius > 1.1 ? 1 : 0, { at: [x, y, z], rot: [rng() * 3, rng() * 3, 0], color: colors.low, colorTop: colors.high, jitter: 0.2, rng });
  }
  return b.build();
}

function bush(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const lobes: readonly (readonly [number, number, number, number])[] = [
    [0, 0.52, 0, 0.72], [0.58, 0.4, 0.12, 0.5], [-0.52, 0.42, -0.1, 0.56],
  ];
  for (const [x, y, z, radius] of lobes) {
    b.blob(radius, radius > 0.6 ? 1 : 0, { at: [x, y, z], scale: [1, 0.85, 1], color: PALETTE.bush.low, colorTop: PALETTE.bush.high, jitter: 0.14, rng });
  }
  return b.build();
}

function rock(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  b.blob(0.8, 1, { at: [0, 0.28, 0], scale: [1.1, 0.72, 0.95], color: PALETTE.rock.low, colorTop: PALETTE.rock.high, jitter: 0.26, rng });
  b.blob(0.36, 0, { at: [0.72, 0.1, 0.3], color: PALETTE.rock.low, colorTop: PALETTE.rock.high, jitter: 0.12, rng });
  return b.build();
}

function grassTuft(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    b.blade(0.15, 0.3 + rng() * 0.26, (rng() - 0.5) * 0.18, {
      at: [(rng() - 0.5) * 0.62, 0, (rng() - 0.5) * 0.62],
      rot: [0, rng() * 6, 0],
      color: PALETTE.grassBlade.low,
      colorTop: PALETTE.grassBlade.high,
      normalUp: true,
    });
  }
  return b.build();
}

function flowers(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  for (let i = 0; i < 4; i++) {
    const x = (rng() - 0.5) * 0.7;
    const z = (rng() - 0.5) * 0.7;
    const height = 0.3 + rng() * 0.22;
    b.blade(0.05, height, 0, { at: [x, 0, z], rot: [0, rng() * 6, 0], color: PALETTE.grassBlade.low, normalUp: true });
    b.blob(0.085, 0, { at: [x, height + 0.03, z], color: PALETTE.flowers[i % PALETTE.flowers.length], normalUp: true });
  }
  return b.build();
}

/** Prototype meshes keyed by the world data's scatter kinds. */
export function buildVegetationPrototypes(): Record<ScatterKind, BufferGeometry> {
  return {
    pine: pine(1, 4, 5.7, 1.7),
    pineSlim: pine(2, 4, 6.4, 1.28),
    oak: broadleaf(3, PALETTE.oak),
    oakAmber: broadleaf(4, PALETTE.amber),
    bush: bush(5),
    rock: rock(6),
    grass: grassTuft(7),
    flower: flowers(8),
  };
}
