import type { BufferGeometry } from 'three';
import { PALETTE, WORLD } from '../../config';
import { createRng } from '../../core/math';
import { LowPolyBuilder } from '../../rendering/LowPolyBuilder';

/**
 * Procedural placeholder props. Each function returns geometry in the prop's
 * local space (origin on the ground, +Z = front). To swap in a GLB later, replace
 * the call site in SettlementView; collision is defined by world data, not here.
 */

export interface HouseSpec {
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  wall: number;
  roof: number;
}

export interface HouseGeometry {
  body: BufferGeometry;
  /** Kept apart so window panes can glow at night with their own material. */
  windows: BufferGeometry;
}

export function buildHouse(spec: HouseSpec, seed: number): HouseGeometry {
  const rng = createRng(seed);
  const { width: w, depth: d, wallHeight: wh, roofHeight: rh, wall, roof } = spec;
  const body = new LowPolyBuilder();
  const windows = new LowPolyBuilder();
  const beam = PALETTE.timber;
  const t = 0.16;
  const front = d / 2;

  body.box(w + 0.25, 0.5, d + 0.25, { at: [0, 0.2, 0], color: PALETTE.stoneDark, colorTop: PALETTE.stone });
  body.box(w, wh, d, { at: [0, wh / 2, 0], color: wall });

  // Corner posts and wall plates.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.box(t + 0.04, wh, t + 0.04, { at: [(sx * w) / 2, wh / 2, (sz * d) / 2], color: beam });
    }
  }
  for (const sz of [-1, 1]) {
    body.box(w + 0.1, t, t, { at: [0, wh - 0.08, (sz * d) / 2], color: beam });
    body.box(w + 0.1, t, t, { at: [0, 0.52, (sz * d) / 2], color: beam });
  }
  for (const sx of [-1, 1]) {
    body.box(t, t, d + 0.1, { at: [(sx * w) / 2, wh - 0.08, 0], color: beam });
    body.box(t, t, d + 0.1, { at: [(sx * w) / 2, 0.52, 0], color: beam });
  }

  // Door, frame and step.
  const doorX = w * WORLD.houseDoorOffset;
  const doorH = Math.min(2.25, wh - 0.65);
  body.box(1.1, doorH, 0.08, { at: [doorX, 0.45 + doorH / 2, front + 0.03], color: PALETTE.door });
  body.box(0.13, doorH + 0.1, 0.14, { at: [doorX - 0.6, 0.45 + doorH / 2, front + 0.04], color: beam });
  body.box(0.13, doorH + 0.1, 0.14, { at: [doorX + 0.6, 0.45 + doorH / 2, front + 0.04], color: beam });
  body.box(1.33, 0.13, 0.14, { at: [doorX, 0.5 + doorH, front + 0.04], color: beam });
  body.box(1.5, 0.22, 0.7, { at: [doorX, 0.11, front + 0.42], color: PALETTE.stone });

  // Front windows with shutters and frames, plus one on each gable end.
  const addWindow = (x: number, y: number): void => {
    windows.box(0.86, 0.82, 0.05, { at: [x, y, front + 0.03], color: 0xffffff });
    body.box(0.08, 0.92, 0.1, { at: [x, y, front + 0.06], color: beam });
    body.box(0.96, 0.08, 0.1, { at: [x, y, front + 0.06], color: beam });
    body.box(0.08, 0.92, 0.1, { at: [x - 0.48, y, front + 0.06], color: beam });
    body.box(0.08, 0.92, 0.1, { at: [x + 0.48, y, front + 0.06], color: beam });
    body.box(1.04, 0.08, 0.14, { at: [x, y - 0.46, front + 0.07], color: beam });
    body.box(1.04, 0.08, 0.14, { at: [x, y + 0.46, front + 0.07], color: beam });
    body.box(0.34, 0.9, 0.05, { at: [x - 0.72, y, front + 0.05], rot: [0, 0.25, 0], color: PALETTE.plankDark });
    body.box(0.34, 0.9, 0.05, { at: [x + 0.72, y, front + 0.05], rot: [0, -0.25, 0], color: PALETTE.plankDark });
  };
  const windowY = Math.min(wh * 0.58, 1.6);
  addWindow(w * 0.28, windowY);
  addWindow(-w * 0.36, windowY);
  for (const sx of [-1, 1]) {
    windows.box(0.05, 0.7, 0.7, { at: [(sx * w) / 2 + 0.03, windowY, 0], color: 0xffffff });
    body.box(0.08, 0.84, 0.08, { at: [(sx * w) / 2 + 0.05, windowY, -0.39], color: beam });
    body.box(0.08, 0.84, 0.08, { at: [(sx * w) / 2 + 0.05, windowY, 0.39], color: beam });
  }

  // Diagonal braces give the walls their half-timbered read.
  const braceY = wh * 0.6;
  body.box(0.12, 1.3, 0.08, { at: [w * 0.5 - 0.42, braceY, front + 0.02], rot: [0, 0, 0.6], color: beam });
  body.box(0.12, 1.3, 0.08, { at: [-w * 0.5 + 0.42, braceY, front + 0.02], rot: [0, 0, -0.6], color: beam });

  // Gable fill and roof: overlapping thatch courses along each slope.
  const overhang = 0.5;
  body.prism(w - 0.02, rh, d, { at: [0, wh, 0], color: wall, colorTop: 0xb79f78 });
  const ridgeBeamY = wh + rh;
  body.box(0.12, rh, 0.12, { at: [(w / 2), wh + rh / 2 - 0.05, 0], color: beam });
  body.box(0.12, rh, 0.12, { at: [-(w / 2), wh + rh / 2 - 0.05, 0], color: beam });

  const halfSpan = d / 2 + overhang;
  const slopeDrop = (rh / (d / 2)) * overhang;
  const slopeRise = rh + slopeDrop;
  const angle = Math.atan2(slopeRise, halfSpan);
  const slopeLength = Math.hypot(halfSpan, slopeRise);
  const courses = 8;
  const roofWidth = w + overhang * 2 + 0.3;
  for (const side of [1, -1]) {
    for (let i = 0; i < courses; i++) {
      // i = 0 at the eave. Lower courses overlap the next and sit slightly proud.
      const along = (i + 0.5) / courses;
      const shade = 0.76 + rng() * 0.34 + (i / courses) * 0.08;
      const color = shadeColor(roof, shade);
      const courseZ = side * halfSpan * (1 - along);
      const courseY = wh - slopeDrop + slopeRise * along + 0.12;
      body.box(roofWidth, 0.2, slopeLength / courses + 0.2, {
        at: [(rng() - 0.5) * 0.2, courseY, courseZ],
        rot: [side * angle, 0, 0],
        color: shadeColor(color, 0.82),
        colorTop: color,
      });
    }
  }
  body.box(roofWidth + 0.1, 0.22, 0.46, { at: [0, ridgeBeamY + 0.17, 0], color: shadeColor(roof, 0.7), colorTop: shadeColor(roof, 0.86) });

  // Chimney through the back slope.
  const chimneyX = w * 0.3;
  const chimneyTop = wh + rh + 0.75;
  body.box(0.72, chimneyTop - wh, 0.72, { at: [chimneyX, wh + (chimneyTop - wh) / 2, -d * 0.18], color: PALETTE.stoneDark, colorTop: PALETTE.stone });
  body.box(0.86, 0.14, 0.86, { at: [chimneyX, chimneyTop, -d * 0.18], color: PALETTE.stoneDark });

  return { body: body.build(), windows: windows.build() };
}

/** Scales an sRGB hex color; adequate for small value shifts on placeholder art. */
function shadeColor(hex: number, factor: number): number {
  const channel = (shift: number): number => Math.min(Math.round(((hex >> shift) & 255) * factor), 255);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Wooden bridge along X in world-height coordinates, relative to the bridge centre. */
export function buildBridge(deckHeightAt: (localX: number) => number, seed: number, part: 'whole' | 'banks' | 'gap' = 'whole'): BufferGeometry {
  const { halfLength, halfWidth } = WORLD.bridge;
  const waterY = WORLD.river.waterHeight;
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const slopeAt = (x: number): number => Math.atan2(deckHeightAt(x + 0.2) - deckHeightAt(x - 0.2), 0.4);
  const plankPitch = 0.46;
  const includes = (x: number): boolean => part === 'whole' || (part === 'gap' ? Math.abs(x) < WORLD.bridge.repairGapHalfLength : Math.abs(x) >= WORLD.bridge.repairGapHalfLength);

  for (let x = -halfLength; x <= halfLength + 0.01; x += plankPitch) {
    if (!includes(x)) continue;
    const shade = rng() > 0.5 ? PALETTE.plank : PALETTE.plankDark;
    const length = halfWidth * 2 + (rng() - 0.3) * 0.26;
    b.box(plankPitch - 0.035, 0.13, length, {
      at: [x, deckHeightAt(x) - 0.065, (rng() - 0.5) * 0.12],
      rot: [0, 0, slopeAt(x)],
      color: shade,
    });
  }

  // Stringers, rails and posts follow the arch segment by segment.
  const segments = 10;
  const span = (halfLength * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const x0 = -halfLength + i * span;
    const x1 = x0 + span;
    const midX = (x0 + x1) / 2;
    if (!includes(midX)) continue;
    const y0 = deckHeightAt(x0);
    const y1 = deckHeightAt(x1);
    const midY = (y0 + y1) / 2;
    const rise = y1 - y0;
    const tilt = Math.atan2(rise, span);
    const length = Math.hypot(span, rise) + 0.1;
    for (const side of [-1, 1]) {
      b.box(length, 0.22, 0.24, { at: [midX, midY - 0.25, side * (halfWidth - 0.28)], rot: [0, 0, tilt], color: PALETTE.timber });
      b.box(length, 0.11, 0.11, { at: [midX, midY + 0.95, side * (halfWidth + 0.02)], rot: [0, 0, tilt], color: PALETTE.timberLight });
      b.box(length, 0.08, 0.07, { at: [midX, midY + 0.5, side * (halfWidth + 0.02)], rot: [0, 0, tilt], color: PALETTE.timber });
    }
  }
  for (let i = 0; i <= segments; i++) {
    const x = -halfLength + i * span;
    if (!includes(x)) continue;
    const y = deckHeightAt(x);
    for (const side of [-1, 1]) {
      b.box(0.17, 1.2, 0.17, { at: [x, y + 0.42, side * (halfWidth + 0.02)], color: PALETTE.timber, colorTop: PALETTE.timberLight });
    }
  }

  // Piles and cross-bracing standing in the water.
  for (const x of [-3.6, 0, 3.6]) {
    if (!includes(x)) continue;
    const top = deckHeightAt(x) - 0.28;
    const bottom = waterY - 1.2;
    const h = top - bottom;
    for (const side of [-1, 1]) {
      b.box(0.3, h, 0.3, { at: [x, bottom + h / 2, side * (halfWidth - 0.28)], color: PALETTE.timber });
    }
    b.box(0.2, 0.2, halfWidth * 2, { at: [x, top - 0.12, 0], color: PALETTE.timber });
  }

  // Stone abutments ground both ends of the deck.
  for (const side of [-1, 1]) {
    const x = side * (halfLength - 0.6);
    if (!includes(x)) continue;
    const y = deckHeightAt(x);
    for (const z of [-1, 1]) {
      b.box(1.9, 1.5, 0.5, { at: [x, y - 0.95, z * (halfWidth + 0.02)], color: PALETTE.stoneDark, colorTop: PALETTE.stone });
    }
  }
  return b.build();
}

/** Fence along local X, centred on the origin. */
export function buildFence(length: number, seed: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const posts = Math.max(Math.round(length / 2.2), 1);
  const pitch = length / posts;
  for (let i = 0; i <= posts; i++) {
    const x = -length / 2 + i * pitch;
    b.box(0.16, 1.15, 0.16, { at: [x, 0.5, 0], rot: [(rng() - 0.5) * 0.08, 0, (rng() - 0.5) * 0.08], color: PALETTE.timber, colorTop: PALETTE.timberLight });
  }
  for (let i = 0; i < posts; i++) {
    const x = -length / 2 + (i + 0.5) * pitch;
    b.box(pitch + 0.12, 0.09, 0.07, { at: [x, 0.78, 0.08], rot: [0, 0, (rng() - 0.5) * 0.04], color: PALETTE.timberLight });
    b.box(pitch + 0.12, 0.09, 0.07, { at: [x, 0.4, 0.08], rot: [0, 0, (rng() - 0.5) * 0.06], color: PALETTE.plankDark });
  }
  return b.build();
}

/** Simple timber road barrier spanning local X. */
export function buildBarrier(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const halfWidth = WORLD.barrierHalfWidth;
  const b = new LowPolyBuilder();
  for (const sx of [-1, 1]) {
    b.box(0.22, 1.35, 0.22, { at: [sx * halfWidth, 0.62, 0], color: PALETTE.timber, colorTop: PALETTE.timberLight });
    b.box(0.5, 0.26, 0.5, { at: [sx * halfWidth, 0.06, 0], color: PALETTE.stoneDark });
  }
  b.box(halfWidth * 2 + 0.5, 0.16, 0.12, { at: [0, 1.0, 0.12], rot: [0, 0, 0.03], color: PALETTE.plank });
  b.box(halfWidth * 2 + 0.4, 0.14, 0.12, { at: [0, 0.55, 0.12], rot: [0, 0, -0.04], color: PALETTE.plankDark });
  for (let i = 0; i < 2; i++) {
    b.box(0.13, 1.5, 0.08, { at: [(i - 0.5) * 2, 0.77, 0.2], rot: [0, 0, (i - 0.5) * 1.1 + (rng() - 0.5) * 0.1], color: PALETTE.timberLight });
  }
  return b.build();
}

export function buildLanternPost(): { body: BufferGeometry; glass: BufferGeometry } {
  const body = new LowPolyBuilder();
  const glass = new LowPolyBuilder();
  body.box(0.17, 2.3, 0.17, { at: [0, 1.15, 0], color: PALETTE.timber, colorTop: PALETTE.timberLight });
  body.box(0.42, 0.26, 0.42, { at: [0, 0.1, 0], color: PALETTE.stoneDark });
  body.box(0.82, 0.11, 0.11, { at: [0.28, 2.2, 0], color: PALETTE.timber });
  body.cylinder(0.05, 0.27, 0.17, 6, { at: [0.55, 1.97, 0], color: PALETTE.iron });
  body.box(0.32, 0.05, 0.32, { at: [0.55, 1.54, 0], color: PALETTE.iron });
  glass.box(0.26, 0.34, 0.26, { at: [0.55, 1.73, 0], color: 0xffffff });
  return { body: body.build(), glass: glass.build() };
}

export function buildWoodpile(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const rows = [5, 4, 3];
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 0.42;
      const y = 0.2 + row * 0.36;
      b.cylinder(0.2, 0.2, 2.3 + rng() * 0.15, 6, { at: [x, y, 0], rot: [Math.PI / 2, 0, 0], color: rng() > 0.5 ? PALETTE.plank : PALETTE.timberLight });
    }
  });
  return b.build();
}

/** Stone ring, burned logs and seat logs. The flames themselves are animated in CampfireView. */
export function buildCampfireBase(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  b.cylinder(0.92, 1.0, 0.04, 12, { at: [0, 0.03, 0], color: PALETTE.ash });
  const stones = 10;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2;
    b.blob(0.22 + rng() * 0.06, 0, {
      at: [Math.cos(a) * 0.98, 0.14, Math.sin(a) * 0.98],
      scale: [1.1, 0.8, 1],
      color: PALETTE.stoneDark,
      colorTop: PALETTE.stone,
      jitter: 0.05,
      rng,
    });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.cylinder(0.08, 0.1, 1.15, 6, {
      at: [Math.cos(a) * 0.26, 0.28, Math.sin(a) * 0.26],
      rot: [Math.sin(a) * 0.95, -a, Math.cos(a) * 0.95],
      color: 0x22190f,
      colorTop: PALETTE.timber,
    });
  }
  return b.build();
}

/** Two log benches around the fire. */
export function buildFireSeats(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const { seats, seatHalfLength } = WORLD.campfire;
  for (const { x, z, rotY } of seats) {
    b.cylinder(0.25, 0.27, seatHalfLength * 2, 7, { at: [x, 0.24, z], rot: [0, rotY, Math.PI / 2], color: PALETTE.timber, colorTop: PALETTE.timberLight, jitter: 0.02, rng });
  }
  return b.build();
}
