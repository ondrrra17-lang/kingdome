import type { BufferGeometry } from 'three';
import { PALETTE, type BuildingDefinition } from '../../config';
import { createRng } from '../../core/math';
import { LowPolyBuilder } from '../../rendering/LowPolyBuilder';

/**
 * Procedural construction visuals, in each site's local space (origin on the
 * ground, +Z = front). A GLB could replace `structure` as long as it can be
 * revealed in stages.
 */

export interface StructureGeometry {
  geometry: BufferGeometry;
  /** Vertex count at the end of each piece, in build order, bottom to top. */
  pieceEnds: number[];
}

/** Stone outline and corner stakes. Low enough to walk over while nothing is built yet. */
export function buildFoundation(def: BuildingDefinition, seed: number): BufferGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const { halfX: hx, halfZ: hz } = def;
  b.box(hx * 2 + 0.1, 0.1, hz * 2 + 0.1, { at: [0, 0.03, 0], color: 0x7d6a4c });
  const stones = Math.round((hx + hz) * 2.6);
  for (let i = 0; i < stones; i++) {
    // Walk around the rectangle's perimeter.
    const t = (i / stones) * (hx + hz) * 4;
    let x: number;
    let z: number;
    if (t < hx * 2) { x = -hx + t; z = hz; }
    else if (t < hx * 2 + hz * 2) { x = hx; z = hz - (t - hx * 2); }
    else if (t < hx * 4 + hz * 2) { x = hx - (t - hx * 2 - hz * 2); z = -hz; }
    else { x = -hx; z = -hz + (t - hx * 4 - hz * 2); }
    b.blob(0.2 + rng() * 0.08, 0, { at: [x, 0.09, z], scale: [1.15, 0.65, 1], color: PALETTE.stoneDark, colorTop: PALETTE.stone, jitter: 0.05, rng });
  }
  return b.build();
}

/** Stakes and a small sign, only shown until the site is paid for. */
export function buildSiteMarker(def: BuildingDefinition): BufferGeometry {
  const b = new LowPolyBuilder();
  const { halfX: hx, halfZ: hz } = def;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    b.box(0.09, 0.8, 0.09, { at: [sx * hx, 0.4, sz * hz], color: PALETTE.timberLight });
    b.box(0.13, 0.13, 0.13, { at: [sx * hx, 0.78, sz * hz], color: 0xc9852e });
  }
  const signX = def.timberSide * (hx + 0.5);
  b.box(0.12, 1.35, 0.12, { at: [signX, 0.67, -hz + 0.2], color: PALETTE.timber });
  b.box(1.05, 0.56, 0.08, { at: [signX, 1.17, -hz + 0.28], color: PALETTE.plank, colorTop: PALETTE.timberLight });
  b.box(0.72, 0.06, 0.02, { at: [signX, 1.27, -hz + 0.33], color: PALETTE.timber });
  b.box(0.56, 0.06, 0.02, { at: [signX, 1.11, -hz + 0.33], color: PALETTE.timber });
  return b.build();
}

/** Logs beside the site, used up as work progresses. */
export function buildTimberPile(seed: number): StructureGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const pieceEnds: number[] = [];
  const rows = [4, 3, 2, 1];
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      b.cylinder(0.14, 0.14, 2 + rng() * 0.2, 6, {
        at: [0, 0.14 + row * 0.25, (i - (count - 1) / 2) * 0.3],
        rot: [0, (rng() - 0.5) * 0.08, Math.PI / 2],
        color: rng() > 0.5 ? PALETTE.plank : PALETTE.timberLight,
      });
      pieceEnds.push(b.vertexCount);
    }
  });
  return { geometry: b.build(), pieceEnds };
}

export function buildScaffold(def: BuildingDefinition): BufferGeometry {
  const b = new LowPolyBuilder();
  const hx = def.halfX + 0.42;
  const hz = def.halfZ + 0.42;
  const h = def.height * 0.92;
  const pole = PALETTE.timberLight;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    b.box(0.11, h, 0.11, { at: [sx * hx, h / 2, sz * hz], rot: [0.015 * sz, 0, 0.015 * sx], color: pole });
  }
  const levels = Math.max(Math.floor(h / 1.5), 2);
  for (let i = 1; i <= levels; i++) {
    const y = (h * i) / (levels + 0.3);
    for (const sz of [-1, 1]) {
      b.box(hx * 2 + 0.3, 0.08, 0.08, { at: [0, y, sz * hz], color: PALETTE.plank });
    }
    for (const sx of [-1, 1]) {
      b.box(0.08, 0.08, hz * 2 + 0.3, { at: [sx * hx, y, 0], color: PALETTE.plank });
    }
  }
  // A plank walkway across the front and a diagonal brace.
  b.box(hx * 2, 0.06, 0.42, { at: [0, (h * 1) / (levels + 0.3) + 0.07, hz + 0.02], color: PALETTE.plankDark });
  b.box(0.07, Math.hypot(hx * 2, h * 0.5), 0.07, { at: [0, h * 0.28, hz + 0.05], rot: [0, 0, Math.atan2(hx * 2, h * 0.5)], color: PALETTE.timberLight });
  return b.build();
}

function hut(def: BuildingDefinition, seed: number): StructureGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const ends: number[] = [];
  const mark = (): void => { ends.push(b.vertexCount); };
  const w = def.halfX * 2 - 0.2;
  const d = def.halfZ * 2 - 0.2;
  const wallH = 1.95;
  const layers = 6;
  const log = wallH / layers;
  for (let i = 0; i < layers; i++) {
    const y = 0.1 + log * (i + 0.5);
    const color = i % 2 === 0 ? PALETTE.timber : 0x63472f;
    for (const sz of [-1, 1]) {
      const isDoorGap = sz === 1 && i < 4;
      if (isDoorGap) {
        const side = (w - 1.1) / 2;
        b.box(side, log * 1.02, 0.28, { at: [-(w + 1.1) / 4, y, (sz * d) / 2], color }); mark();
        b.box(side, log * 1.02, 0.28, { at: [(w + 1.1) / 4, y, (sz * d) / 2], color }); mark();
      } else {
        b.box(w + 0.3, log * 1.02, 0.28, { at: [0, y, (sz * d) / 2], color }); mark();
      }
    }
    for (const sx of [-1, 1]) {
      b.box(0.28, log * 1.02, d + 0.3, { at: [(sx * w) / 2, y, 0], color }); mark();
    }
  }
  b.box(1.1, 1.35, 0.08, { at: [0, 0.76, d / 2 - 0.02], color: PALETTE.door }); mark();
  const peak = 1.25;
  const top = 0.1 + wallH;
  b.prism(w, peak, d, { at: [0, top, 0], color: 0x6e5238, colorTop: PALETTE.plank }); mark();
  const overhang = 0.42;
  const span = d / 2 + overhang;
  const drop = (peak / (d / 2)) * overhang;
  const rise = peak + drop;
  const angle = Math.atan2(rise, span);
  const length = Math.hypot(span, rise);
  const courses = 5;
  for (const side of [1, -1]) {
    for (let i = 0; i < courses; i++) {
      const along = (i + 0.5) / courses;
      const shade = rng() > 0.5 ? PALETTE.plankDark : PALETTE.plank;
      b.box(w + overhang * 2 + 0.3, 0.16, length / courses + 0.14, {
        at: [0, top - drop + rise * along + 0.1, side * span * (1 - along)],
        rot: [side * angle, 0, 0],
        color: shade,
      });
      mark();
    }
  }
  b.box(w + overhang * 2 + 0.4, 0.18, 0.36, { at: [0, top + peak + 0.13, 0], color: PALETTE.timber }); mark();
  return { geometry: b.build(), pieceEnds: ends };
}

function shed(def: BuildingDefinition, seed: number): StructureGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const ends: number[] = [];
  const mark = (): void => { ends.push(b.vertexCount); };
  const w = def.halfX * 2 - 0.15;
  const d = def.halfZ * 2 - 0.15;
  const backH = 2;
  const frontH = 2.5;
  for (const [sx, sz, h] of [[-1, -1, backH], [1, -1, backH], [-1, 1, frontH], [1, 1, frontH], [0, 1, frontH]] as const) {
    b.box(0.2, h, 0.2, { at: [(sx * w) / 2, h / 2, (sz * d) / 2], color: PALETTE.timber, colorTop: PALETTE.timberLight }); mark();
  }
  // Back and side walls, leaving the front open to show the stored logs.
  const planks = Math.round(w / 0.42);
  for (let i = 0; i < planks; i++) {
    const x = -w / 2 + ((i + 0.5) / planks) * w;
    b.box(0.38, backH, 0.08, { at: [x, backH / 2, -d / 2], rot: [0, 0, (rng() - 0.5) * 0.015], color: i % 2 ? PALETTE.plank : PALETTE.plankDark }); mark();
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      b.box(0.08, 0.42, d, { at: [(sx * w) / 2, 0.25 + i * 0.46, 0], color: i % 2 ? PALETTE.plank : PALETTE.plankDark }); mark();
    }
  }
  // Rows of stored logs.
  for (let row = 0; row < 3; row++) {
    const count = 6 - row;
    for (let i = 0; i < count; i++) {
      b.cylinder(0.17, 0.17, d * 0.6, 6, {
        at: [(i - (count - 1) / 2) * 0.36, 0.26 + row * 0.3, -0.1],
        rot: [Math.PI / 2, 0, 0],
        color: rng() > 0.5 ? PALETTE.plank : PALETTE.timberLight,
      });
      mark();
    }
  }
  // Lean-to roof, high at the front.
  const pitch = Math.atan2(frontH - backH, d);
  const courses = 5;
  for (let i = 0; i < courses; i++) {
    const t = (i + 0.5) / courses;
    const z = -d / 2 - 0.2 + (d + 0.6) * t;
    b.box(w + 0.7, 0.14, (d + 0.6) / courses + 0.08, {
      at: [0, backH + (frontH - backH) * t + 0.1, z],
      rot: [-pitch, 0, 0],
      color: rng() > 0.5 ? PALETTE.plankDark : PALETTE.plank,
    });
    mark();
  }
  return { geometry: b.build(), pieceEnds: ends };
}

function watchtower(def: BuildingDefinition, seed: number): StructureGeometry {
  const rng = createRng(seed);
  const b = new LowPolyBuilder();
  const ends: number[] = [];
  const mark = (): void => { ends.push(b.vertexCount); };
  const leg = def.halfX - 0.2;
  const deck = 4.4;
  const stages = 4;
  const stageH = deck / stages;
  for (let s = 0; s < stages; s++) {
    const y = stageH * (s + 0.5);
    const spread = leg * (1 - (s / stages) * 0.26);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      b.box(0.26, stageH + 0.04, 0.26, { at: [sx * spread, y, sz * spread], rot: [sz * 0.08, 0, -sx * 0.08], color: PALETTE.timber, colorTop: PALETTE.timberLight }); mark();
    }
    const beamY = stageH * (s + 1);
    const beam = spread * 2 + 0.2;
    for (const sz of [-1, 1]) {
      b.box(beam, 0.13, 0.13, { at: [0, beamY, sz * spread], color: PALETTE.timber }); mark();
    }
    for (const sx of [-1, 1]) {
      b.box(0.13, 0.13, beam, { at: [sx * spread, beamY, 0], color: PALETTE.timber }); mark();
    }
    // Cross-bracing on the sides facing the camera.
    b.box(0.09, Math.hypot(beam, stageH), 0.08, { at: [0, y, spread], rot: [0, 0, Math.atan2(beam, stageH) * (s % 2 ? 1 : -1)], color: PALETTE.timberLight }); mark();
    b.box(0.08, Math.hypot(beam, stageH), 0.09, { at: [spread, y, 0], rot: [Math.atan2(beam, stageH) * (s % 2 ? -1 : 1), 0, 0], color: PALETTE.timberLight }); mark();
  }
  // Ladder up the front.
  for (let i = 0; i < 12; i++) {
    b.box(0.5, 0.06, 0.06, { at: [0, 0.3 + i * 0.35, leg * 0.9 + 0.22], color: PALETTE.plank }); mark();
  }
  // Platform planks.
  const platform = leg * 1.2 + 0.25;
  const boards = 7;
  for (let i = 0; i < boards; i++) {
    const x = -platform + ((i + 0.5) / boards) * platform * 2;
    b.box((platform * 2) / boards - 0.03, 0.12, platform * 2 + (rng() - 0.5) * 0.1, { at: [x, deck + 0.1, 0], color: i % 2 ? PALETTE.plank : PALETTE.plankDark }); mark();
  }
  // Railing posts and rails.
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    b.box(0.13, 1.8, 0.13, { at: [sx * platform * 0.94, deck + 1, sz * platform * 0.94], color: PALETTE.timber }); mark();
  }
  for (const sz of [-1, 1]) {
    b.box(platform * 2, 0.1, 0.09, { at: [0, deck + 0.85, sz * platform * 0.94], color: PALETTE.timberLight }); mark();
  }
  for (const sx of [-1, 1]) {
    b.box(0.09, 0.1, platform * 2, { at: [sx * platform * 0.94, deck + 0.85, 0], color: PALETTE.timberLight }); mark();
  }
  // Pointed roof.
  b.cone(platform * 1.5, 1.35, 4, { at: [0, deck + 1.82, 0], rot: [0, Math.PI / 4, 0], color: PALETTE.plankDark, colorTop: 0x9d8146 }); mark();
  return { geometry: b.build(), pieceEnds: ends };
}

export function buildStructure(def: BuildingDefinition, seed: number): StructureGeometry {
  switch (def.style) {
    case 'farm': return farm(def);
    case 'lodge': return hut(def, seed);
    case 'hut': return hut(def, seed);
    case 'shed': return shed(def, seed);
    case 'watchtower': return watchtower(def, seed);
  }
}

function farm(def: BuildingDefinition): StructureGeometry {
  const b = new LowPolyBuilder();
  const ends: number[] = [];
  const mark = (): void => { ends.push(b.vertexCount); };
  b.box(def.halfX * 2, 0.12, def.halfZ * 2, { at: [0, 0.04, 0], color: 0x65472e }); mark();
  for (const x of [-def.halfX, 0, def.halfX]) {
    b.box(0.13, 1.15, 0.13, { at: [x, 0.55, -def.halfZ], color: PALETTE.timber }); mark();
  }
  for (const y of [0.38, 0.8]) {
    b.box(def.halfX * 2, 0.09, 0.09, { at: [0, y, -def.halfZ], color: PALETTE.plank }); mark();
  }
  b.box(0.8, 0.5, 0.65, { at: [def.halfX + 0.4, 0.25, 0], color: PALETTE.plank }); mark();
  b.box(0.07, 1.45, 0.07, { at: [def.halfX + 0.6, 0.8, 0.35], rot: [0, 0, 0.25], color: PALETTE.timberLight }); mark();
  return { geometry: b.build(), pieceEnds: ends };
}
