import type { BufferGeometry } from 'three';
import { PALETTE, type PropDefinition } from '../../config';
import { createRng, type Rng } from '../../core/math';
import { LowPolyBuilder, type Vec3 } from '../../rendering/LowPolyBuilder';

/**
 * Procedural scenery for the forest locations. Props of one location are merged into
 * one mesh, for one draw call each. To swap in GLB assets, replace the call in
 * ExplorationView; position and collision come from the config, not from here.
 */

const MOSS = 0x7c8f58;
const STONE_LIGHT = 0xa8a294;
const IRON_RUST = 0x6a4a34;
const ROTTEN = 0x5a5046;
const COAL = 0x2e2a28;

/** Adds parts in a prop's local space, with its position, rotation and scale already applied. */
class Placer {
  constructor(
    private readonly b: LowPolyBuilder,
    private readonly x: number,
    private readonly y: number,
    private readonly z: number,
    private readonly rotY: number,
    private readonly scale: number,
  ) {}

  private at(p: Vec3): Vec3 {
    const cos = Math.cos(this.rotY);
    const sin = Math.sin(this.rotY);
    const s = this.scale;
    return [this.x + (p[0] * cos + p[2] * sin) * s, this.y + p[1] * s, this.z + (-p[0] * sin + p[2] * cos) * s];
  }

  box(w: number, h: number, d: number, at: Vec3, color: number, colorTop?: number, rot: Vec3 = [0, 0, 0]): void {
    const s = this.scale;
    this.b.box(w * s, h * s, d * s, { at: this.at(at), rot: [rot[0], rot[1] + this.rotY, rot[2]], color, colorTop });
  }

  cylinder(top: number, bottom: number, h: number, segments: number, at: Vec3, color: number, colorTop?: number, rot: Vec3 = [0, 0, 0]): void {
    const s = this.scale;
    this.b.cylinder(top * s, bottom * s, h * s, segments, { at: this.at(at), rot: [rot[0], rot[1] + this.rotY, rot[2]], color, colorTop });
  }

  cone(radius: number, h: number, segments: number, at: Vec3, color: number, colorTop?: number, rot: Vec3 = [0, 0, 0], jitter?: { amount: number; rng: Rng }): void {
    const s = this.scale;
    this.b.cone(radius * s, h * s, segments, { at: this.at(at), rot: [rot[0], rot[1] + this.rotY, rot[2]], color, colorTop, jitter: jitter?.amount, rng: jitter?.rng });
  }

  /** Ridge along local X, unless turned by `turn`. */
  prism(w: number, h: number, d: number, at: Vec3, color: number, colorTop: number, turn = 0): void {
    const s = this.scale;
    this.b.prism(w * s, h * s, d * s, { at: this.at(at), rot: [0, this.rotY + turn, 0], color, colorTop });
  }

  blob(radius: number, detail: number, at: Vec3, squash: Vec3, color: number, colorTop: number, rng: Rng, jitter = 0.1): void {
    this.b.blob(radius * this.scale, detail, { at: this.at(at), scale: squash, rot: [0, this.rotY, 0], color, colorTop, jitter, rng });
  }
}

function column(p: Placer): void {
  p.cylinder(0.72, 0.8, 0.34, 8, [0, 0.17, 0], PALETTE.stoneDark, PALETTE.stone);
  p.cylinder(0.46, 0.54, 3.5, 8, [0, 2.05, 0], PALETTE.stone, STONE_LIGHT);
  p.cylinder(0.68, 0.48, 0.32, 8, [0, 3.92, 0], PALETTE.stone, MOSS);
}

function brokenColumn(p: Placer, rng: Rng): void {
  p.cylinder(0.72, 0.8, 0.34, 8, [0, 0.17, 0], PALETTE.stoneDark, PALETTE.stone);
  p.cylinder(0.44, 0.54, 1.35, 8, [0, 1, 0], PALETTE.stone, MOSS, [0.06, 0, -0.05]);
  // The fallen drum lies alongside.
  p.cylinder(0.42, 0.44, 1.4, 8, [1.25, 0.34, 0.5], PALETTE.stoneDark, STONE_LIGHT, [Math.PI / 2, 0.7, 0]);
  p.blob(0.3, 0, [-0.9, 0.14, 0.45], [1.2, 0.7, 1], PALETTE.stoneDark, PALETTE.stone, rng);
}

function ruinWall(p: Placer, rng: Rng): void {
  const blocks = 6;
  for (let course = 0; course < 3; course++) {
    for (let i = 0; i < blocks - course; i++) {
      if (course > 0 && rng() < 0.25) continue;
      const x = (i - (blocks - course - 1) / 2) * 1.02 + (course % 2) * 0.2;
      p.box(0.98, 0.56, 0.72, [x, 0.28 + course * 0.57, (rng() - 0.5) * 0.08], course === 2 ? MOSS : PALETTE.stone, course === 2 ? MOSS : STONE_LIGHT);
    }
  }
}

function rubble(p: Placer, rng: Rng): void {
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 1.2;
    p.blob(0.2 + rng() * 0.26, 0, [Math.cos(a) * r, 0.14, Math.sin(a) * r], [1.2, 0.75, 1], PALETTE.stoneDark, STONE_LIGHT, rng);
  }
}

function altar(p: Placer): void {
  p.box(2.3, 0.3, 1.5, [0, 0.15, 0], PALETTE.stoneDark, PALETTE.stone);
  p.box(1.7, 0.8, 0.95, [0, 0.7, 0], PALETTE.stone, STONE_LIGHT);
  p.box(2, 0.18, 1.2, [0, 1.17, 0], STONE_LIGHT, 0xc0baa8);
}

function tent(p: Placer, color: number): void {
  const dark = shade(color, 0.72);
  p.prism(3.6, 2.5, 3.3, [0, 0, 0], dark, color, Math.PI / 2);
  p.box(0.09, 2.7, 0.09, [0, 1.35, 1.85], PALETTE.timber);
  p.box(0.09, 2.7, 0.09, [0, 1.35, -1.85], PALETTE.timber);
  // The dark mouth of the tent faces the camera.
  p.prism(0.05, 1.5, 1.6, [0, 0, 1.82], COAL, COAL, Math.PI / 2);
}

function collapsedTent(p: Placer, color: number): void {
  const dull = shade(color, 0.72);
  p.box(3.3, 0.22, 2.7, [0, 0.42, 0], shade(dull, 0.8), dull, [0.2, 0, 0.12]);
  p.box(2.4, 0.2, 1.7, [0.3, 0.72, -0.2], shade(dull, 0.75), dull, [-0.28, 0.2, -0.16]);
  p.box(0.09, 1.7, 0.09, [-1.5, 0.75, -1], PALETTE.timber, undefined, [0.3, 0, 0.75]);
  p.box(0.09, 1.3, 0.09, [1.4, 0.5, 1], ROTTEN, undefined, [-0.2, 0, -0.9]);
}

function wheel(p: Placer, x: number, z: number, color: number, tilt = 0, y = 0.55): void {
  p.cylinder(0.55, 0.55, 0.13, 10, [x, y, z], color, color, [Math.PI / 2, 0, tilt]);
  p.cylinder(0.14, 0.14, 0.2, 6, [x, y, z], PALETTE.iron, PALETTE.iron, [Math.PI / 2, 0, tilt]);
}

function wagon(p: Placer): void {
  p.box(3.4, 0.2, 1.7, [0, 0.82, 0], PALETTE.plankDark, PALETTE.plank);
  for (const side of [-1, 1]) {
    p.box(3.4, 0.6, 0.1, [0, 1.2, side * 0.85], PALETTE.plank, PALETTE.timberLight);
    wheel(p, -1.1, side * 0.95, PALETTE.timber);
    wheel(p, 1.1, side * 0.95, PALETTE.timber);
  }
  p.box(0.1, 0.6, 1.7, [-1.7, 1.2, 0], PALETTE.plank);
  p.box(0.1, 0.6, 1.7, [1.7, 1.2, 0], PALETTE.plank);
  // Canvas hoops over the load.
  p.prism(2.8, 1.05, 1.7, [0, 1.46, 0], 0xcfc2a0, 0xe6dcc0);
  p.box(1.5, 0.08, 0.08, [-2.4, 0.75, 0], PALETTE.timber, undefined, [0, 0, -0.2]);
}

function brokenCart(p: Placer): void {
  p.box(2.9, 0.16, 1.5, [0, 0.55, 0], ROTTEN, PALETTE.plankDark, [0.12, 0, -0.17]);
  p.box(2.9, 0.42, 0.09, [0, 0.9, -0.72], ROTTEN, PALETTE.plankDark, [0.12, 0, -0.17]);
  wheel(p, 1, -0.82, ROTTEN, -0.05);
  // One wheel has come off and lies flat.
  p.cylinder(0.55, 0.55, 0.12, 10, [-0.6, 0.08, 1.2], ROTTEN, PALETTE.plankDark);
  p.box(1.4, 0.08, 0.08, [-2, 0.2, 0.2], ROTTEN, undefined, [0, 0.3, 0.2]);
}

function crate(p: Placer): void {
  p.box(0.92, 0.82, 0.92, [0, 0.41, 0], PALETTE.plankDark, PALETTE.plank);
  p.box(0.98, 0.09, 0.98, [0, 0.82, 0], PALETTE.timber);
  p.box(0.98, 0.09, 0.98, [0, 0.05, 0], PALETTE.timber);
}

function barrel(p: Placer): void {
  p.cylinder(0.33, 0.33, 1, 9, [0, 0.5, 0], PALETTE.plankDark, PALETTE.plank);
  p.cylinder(0.36, 0.36, 0.07, 9, [0, 0.74, 0], PALETTE.iron);
  p.cylinder(0.36, 0.36, 0.07, 9, [0, 0.26, 0], PALETTE.iron);
}

function bedroll(p: Placer): void {
  p.box(0.85, 0.12, 1.9, [0, 0.07, 0], 0x6a5a48, 0x8c7a60);
  p.cylinder(0.2, 0.2, 0.85, 7, [0, 0.2, -0.85], 0x8c7a60, 0x9d8a70, [0, 0, Math.PI / 2]);
}

function fireRing(p: Placer, rng: Rng, lit: boolean): void {
  p.cylinder(0.76, 0.84, 0.04, 10, [0, 0.03, 0], lit ? PALETTE.ash : 0x4a443e);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.blob(0.2 + rng() * 0.05, 0, [Math.cos(a) * 0.82, 0.12, Math.sin(a) * 0.82], [1.1, 0.8, 1], PALETTE.stoneDark, PALETTE.stone, rng, 0.05);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    p.cylinder(0.07, 0.09, 1, 6, [Math.cos(a) * 0.22, 0.22, Math.sin(a) * 0.22], 0x22190f, PALETTE.timber, [Math.sin(a) * 0.95, -a, Math.cos(a) * 0.95]);
  }
  if (!lit) {
    // A pot left hanging over the ashes.
    p.box(0.08, 1.45, 0.08, [-0.75, 0.72, 0], ROTTEN);
    p.box(0.08, 1.45, 0.08, [0.75, 0.72, 0], ROTTEN);
    p.box(1.65, 0.07, 0.07, [0, 1.42, 0], ROTTEN);
    p.cylinder(0.3, 0.22, 0.32, 8, [0, 0.95, 0], IRON_RUST, 0x7c5a42);
  }
}

function banner(p: Placer, color: number): void {
  p.box(0.13, 3.8, 0.13, [0, 1.9, 0], PALETTE.timber, PALETTE.timberLight);
  p.box(0.9, 0.08, 0.08, [0.4, 3.6, 0], PALETTE.timber);
  p.box(0.74, 1.3, 0.05, [0.47, 2.9, 0], shade(color, 0.75), color);
}

function signpost(p: Placer): void {
  p.box(0.14, 1.75, 0.14, [0, 0.87, 0], PALETTE.timber, PALETTE.timberLight);
  p.box(1.15, 0.28, 0.07, [0.3, 1.45, 0.06], PALETTE.plankDark, PALETTE.plank, [0, 0, 0.05]);
  p.box(0.85, 0.24, 0.07, [-0.22, 1.08, 0.06], PALETTE.plankDark, PALETTE.plank, [0, 0, -0.07]);
}

function shrine(p: Placer): void {
  p.box(1.7, 0.3, 1.3, [0, 0.15, 0], PALETTE.stoneDark, PALETTE.stone);
  p.box(1.02, 0.95, 0.8, [0, 0.75, 0], PALETTE.stone, STONE_LIGHT);
  // Niche and small carved figure.
  p.box(0.62, 0.62, 0.06, [0, 0.82, 0.39], COAL);
  p.cylinder(0.08, 0.15, 0.34, 6, [0, 0.72, 0.43], 0xc98a4a, 0xe0a860);
  for (const side of [-1, 1]) p.box(0.1, 1.65, 0.1, [side * 0.64, 0.95, 0.45], PALETTE.timber, PALETTE.timberLight);
  p.prism(1.85, 0.72, 1.55, [0, 1.74, 0], 0x7a5a38, 0xa07c4a);
}

function standingStone(p: Placer, rng: Rng): void {
  p.blob(0.78, 0, [0, 1.25, 0], [0.68, 1.9, 0.5], 0x68707a, 0xa8b0a4, rng, 0.2);
  p.blob(0.42, 0, [0.45, 0.14, 0.35], [1.2, 0.5, 1], PALETTE.stoneDark, MOSS, rng, 0.08);
}

function pondRim(p: Placer, rng: Rng): void {
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng() * 0.2;
    const r = 3.35 + rng() * 0.28;
    if (rng() < 0.3) continue;
    p.blob(0.2 + rng() * 0.2, 0, [Math.cos(a) * r, 0.1, Math.sin(a) * r], [1.25, 0.65, 1], PALETTE.stoneDark, MOSS, rng, 0.06);
  }
}

/** Where a cluster's mushrooms stand, as [x, height, z]. The same for the stems and the glowing caps. */
function mushroomLayout(seed: number): Vec3[] {
  const rng = createRng(seed + 5000);
  const layout: Vec3[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 0.8;
    layout.push([Math.cos(a) * r, 0.2 + rng() * 0.26, Math.sin(a) * r]);
  }
  return layout;
}

function mushroomStems(p: Placer, seed: number): void {
  for (const [x, h, z] of mushroomLayout(seed)) {
    p.cylinder(0.035, 0.06, h, 5, [x, h / 2, z], 0xd7ceb4, 0xe7e0cc);
  }
}

function ancientTree(p: Placer, rng: Rng): void {
  p.cylinder(0.75, 1.3, 4.2, 9, [0, 2, 0], PALETTE.trunk.low, PALETTE.trunk.high);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    p.box(0.42, 0.42, 1.8, [Math.cos(a) * 1.25, 0.2, Math.sin(a) * 1.25], PALETTE.trunk.low, PALETTE.trunk.high, [-0.2, a + Math.PI / 2, 0]);
  }
  const lobes: readonly (readonly [number, number, number, number])[] = [
    [0, 6.4, 0, 3], [2.3, 5.4, 0.3, 2], [-2.4, 5.5, -0.3, 2.15], [0.3, 5.1, 1.9, 1.75], [-0.3, 8, -0.2, 1.9], [1.3, 7.2, -1.2, 1.55],
  ];
  for (const [x, y, z, radius] of lobes) p.blob(radius, 1, [x, y, z], [1, 0.92, 1], PALETTE.amber.low, PALETTE.amber.high, rng, 0.3);
  // Faded ribbons on the lower branches.
  for (const [x, z, color] of [[1.2, 0.9, 0xd77a8e], [-1.1, 1, 0x8fa0e0], [0.2, 1.4, 0xf2e2a0]] as const) {
    p.box(0.11, 0.7, 0.03, [x, 3.3, z], color);
  }
}

function kiln(p: Placer, rng: Rng): void {
  p.blob(2, 1, [0, 0.55, 0], [1, 0.78, 1], COAL, 0x5a524a, rng, 0.22);
  p.box(0.75, 0.75, 0.2, [0, 0.42, 1.76], 0x151210, undefined, [0.3, 0, 0]);
  p.cylinder(0.26, 0.3, 0.4, 7, [0, 2.1, 0], PALETTE.stoneDark, COAL);
}

function logStack(p: Placer, rng: Rng): void {
  const rows = [6, 5, 3];
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 0.46;
      p.cylinder(0.22, 0.22, 1.45, 6, [x, 0.22 + row * 0.39, 0], rng() > 0.5 ? PALETTE.plank : PALETTE.timberLight, PALETTE.timberLight, [Math.PI / 2, 0, 0]);
    }
  });
}

function shade(hex: number, factor: number): number {
  const channel = (shift: number): number => Math.min(Math.round(((hex >> shift) & 255) * factor), 255);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Adds one prop to a location's merged geometry. Flames and glows are added by the view. */
export function addProp(b: LowPolyBuilder, def: PropDefinition, groundY: number, seed: number): void {
  const rng = createRng(seed);
  const placer = new Placer(b, def.x, groundY, def.z, def.rotY ?? 0, def.scale ?? 1);
  const color = def.color ?? PALETTE.plank;
  switch (def.kind) {
    case 'column': column(placer); break;
    case 'brokenColumn': brokenColumn(placer, rng); break;
    case 'lintel':
      placer.box(7, 0.62, 1.15, [0, 4.35, 0], PALETTE.stone, MOSS);
      placer.box(1.5, 0.3, 0.8, [1.9, 4.8, 0.05], PALETTE.stoneDark, MOSS);
      break;
    case 'ruinWall': ruinWall(placer, rng); break;
    case 'rubble': rubble(placer, rng); break;
    case 'altar': altar(placer); break;
    case 'tent': tent(placer, color); break;
    case 'collapsedTent': collapsedTent(placer, color); break;
    case 'wagon': wagon(placer); break;
    case 'brokenCart': brokenCart(placer); break;
    case 'crate': crate(placer); break;
    case 'barrel': barrel(placer); break;
    case 'bedroll': bedroll(placer); break;
    case 'fire': fireRing(placer, rng, true); break;
    case 'coldFire': fireRing(placer, rng, false); break;
    case 'banner': banner(placer, color); break;
    case 'signpost': signpost(placer); break;
    case 'shrine': shrine(placer); break;
    case 'standingStone': standingStone(placer, rng); break;
    case 'pond':
      placer.cylinder(3.3, 3.3, 0.08, 20, [0, 0.04, 0], 0x2f7078, 0x4f9a98);
      pondRim(placer, rng);
      break;
    case 'mushrooms': mushroomStems(placer, seed); break;
    case 'ancientTree': ancientTree(placer, rng); break;
    case 'kiln': kiln(placer, rng); break;
    case 'logStack': logStack(placer, rng); break;
  }
}

/** Chest parts, kept apart so the lid can swing open. The lid's origin is its hinge. */
export function buildChestBase(): BufferGeometry {
  const b = new LowPolyBuilder();
  b.box(1, 0.5, 0.66, { at: [0, 0.25, 0], color: 0x5e3e28, colorTop: 0x7a5434 });
  for (const x of [-0.42, 0.42]) b.box(0.08, 0.52, 0.7, { at: [x, 0.26, 0], color: PALETTE.iron });
  b.box(0.16, 0.2, 0.04, { at: [0, 0.42, 0.34], color: 0xc9a24a });
  return b.build();
}

export function buildChestLid(): BufferGeometry {
  const b = new LowPolyBuilder();
  b.cylinder(0.33, 0.33, 1, 8, { at: [0, 0.02, 0.33], rot: [0, 0, Math.PI / 2], color: 0x6a4a2e, colorTop: 0x8e6a42 });
  for (const x of [-0.42, 0.42]) b.cylinder(0.345, 0.345, 0.08, 8, { at: [x, 0.02, 0.33], rot: [0, 0, Math.PI / 2], color: PALETTE.iron });
  return b.build();
}

/** Mushroom caps go in a geometry of their own, so they can glow at night. */
export function addMushroomCaps(b: LowPolyBuilder, def: PropDefinition, groundY: number, seed: number): void {
  const s = def.scale ?? 1;
  const rng = createRng(seed + 6000);
  for (const [x, h, z] of mushroomLayout(seed)) {
    b.cone((0.12 + rng() * 0.09) * s, 0.14 * s, 7, { at: [def.x + x * s, groundY + h * s, def.z + z * s], color: 0xffffff });
  }
}
