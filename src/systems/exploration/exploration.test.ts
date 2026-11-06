import { describe, expect, it } from 'vitest';
import { BUILDINGS, CAMERA, ECONOMY, EXPLORATION, NPC, WORLD } from '../../config';
import { createGameState, type GameState } from '../../core/GameState';
import { createNpc, type NpcState } from '../../entities/Npc';
import { cameraDepthTarget, horizonForFocus } from '../../rendering/CameraRig';
import { buildWorldData } from '../../world/WorldData';
import { assignWorkers } from '../construction/ConstructionState';
import { CollisionWorld } from '../CollisionWorld';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { createVillageInteractables } from '../interaction/villageInteractables';
import { NavGrid } from '../navigation/NavGrid';
import { Pathfinder } from '../navigation/Pathfinder';
import { NpcSystem } from '../npc/NpcSystem';
import { VillageSites } from '../npc/VillageSites';
import { inviteTraveler, recruitWoodcutter, villagerCount, woodcutterCount } from '../Recruitment';
import { createExplorationInteractables } from './explorationInteractables';
import { createExplorationState, discoverLandmarks, loadExploration, openedTreasureCount, openTreasure, saveExploration } from './ExplorationState';
import { ExplorationSystem } from './ExplorationSystem';

const world = buildWorldData();
const collision = new CollisionWorld(world.colliders);

function navGrid(extraBlock?: (x: number, z: number) => boolean): NavGrid {
  const inset = NPC.navClearance;
  const { minX, maxX, minZ, maxZ } = WORLD.bounds;
  const nav = new NavGrid(
    { minX: minX + inset, maxX: maxX - inset, minZ: minZ + inset, maxZ: maxZ - inset },
    NPC.navCellSize,
    (x, z) => collision.isBlocked(x, z, NPC.navClearance) || (extraBlock?.(x, z) ?? false),
  );
  nav.setMainRegion(WORLD.campfire.x, WORLD.campfire.z + 4);
  return nav;
}

const nav = navGrid();
const pathfinder = new Pathfinder(nav);
const sites = new VillageSites(nav, world);
const VILLAGE_START: readonly [number, number] = [WORLD.campfire.x, WORLD.campfire.z + 4];

function walkableCells(filter: (x: number, z: number) => boolean): number {
  let count = 0;
  for (let cell = 0; cell < nav.cellCount; cell++) {
    if (nav.isReachable(cell) && filter(nav.centerX(cell), nav.centerZ(cell))) count++;
  }
  return count;
}

function freshGame(): { state: GameState; system: NpcSystem; npcs: NpcState[] } {
  const definitions = [...NPC.villagers, ...NPC.travelers];
  const npcs = definitions.map((def, i) => {
    sites.nearestPoint(def.spawn[0], def.spawn[1]);
    return createNpc(def, sites.pointX, world.surfaceHeight(sites.pointX, sites.pointZ), sites.pointZ, WORLD.seed, i);
  });
  const state = createGameState(0, npcs);
  const system = new NpcSystem(state, sites, new Pathfinder(nav), { collision, surfaceHeight: world.surfaceHeight });
  return { state, system, npcs };
}

const traveler = (npcs: NpcState[], id: string): NpcState => npcs.find((n) => n.id === id)!;

describe('the expanded map', () => {
  it('has two to three times the walkable area of the valley', () => {
    const { minZ, maxZ } = WORLD.strip;
    const valley = walkableCells((_, z) => z >= minZ && z <= maxZ);
    const total = walkableCells(() => true);
    const ratio = total / valley;
    console.log(`walkable cells: valley ${valley}, whole map ${total}, ratio ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThanOrEqual(2);
    expect(ratio).toBeLessThanOrEqual(3);
  });

  it('can be left in several directions, on both sides of the river', () => {
    const { minZ, maxZ } = WORLD.strip;
    const river = WORLD.river.x;
    const areas = {
      northWest: walkableCells((x, z) => z < minZ - 3 && x < river),
      northEast: walkableCells((x, z) => z < minZ - 3 && x > river),
      southWest: walkableCells((x, z) => z > maxZ + 3 && x < river),
      southEast: walkableCells((x, z) => z > maxZ + 3 && x > river),
    };
    for (const cells of Object.values(areas)) expect(cells).toBeGreaterThan(50);
  });

  it('has only the road barriers at the valley ends left', () => {
    expect(world.barriers.length).toBe(2);
  });

  it('reaches every chest, landmark, camp and sign on foot from the village', () => {
    const outX = new Float32Array(NPC.maxWaypoints);
    const outZ = new Float32Array(NPC.maxWaypoints);
    const targets: [string, number, number][] = [
      ...EXPLORATION.treasures.map((t): [string, number, number] => [t.id, t.x, t.z]),
      ...EXPLORATION.landmarks.map((l): [string, number, number] => [l.id, l.anchor[0], l.anchor[1]]),
      ...NPC.travelers.map((t): [string, number, number] => [t.id, t.spawn[0], t.spawn[1]]),
    ];
    for (const [id, x, z] of targets) {
      const cell = nav.nearestWalkable(x, z, 3);
      expect(cell, `${id} has no walkable ground nearby`).toBeGreaterThanOrEqual(0);
      const standX = nav.centerX(cell);
      const standZ = nav.centerZ(cell);
      expect(Math.hypot(standX - x, standZ - z), `${id} can be stood next to`).toBeLessThan(INTERACT_REACH);
      expect(pathfinder.find(VILLAGE_START[0], VILLAGE_START[1], standX, standZ, outX, outZ), `${id} is reachable`).toBeGreaterThan(0);
    }
  });

  it('has no walkable ground anywhere in the forest', () => {
    for (let cell = 0; cell < nav.cellCount; cell++) {
      if (nav.isReachable(cell)) expect(world.open.distance(nav.centerX(cell), nav.centerZ(cell))).toBeLessThan(EXPLORATION.thicket.radius + 0.2);
    }
  });

  it('keeps a player running at the forest edge out of the forest', () => {
    let seed = 12345;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const body = { x: -16, z: 1, vx: 0, vz: 0 };
    const dt = 1 / 60;
    let worst = -Infinity;
    for (let turn = 0; turn < 900; turn++) {
      const angle = random() * Math.PI * 2;
      for (let step = 0; step < 90; step++) {
        body.vx = Math.cos(angle) * 8.2;
        body.vz = Math.sin(angle) * 8.2;
        body.x += body.vx * dt;
        body.z += body.vz * dt;
        collision.resolve(body, 0.42);
        worst = Math.max(worst, world.open.distance(body.x, body.z));
      }
    }
    // Forest thinner than the thicket between two nearby openings can be stepped through,
    // which is harmless, and reads a little over one radius. A real way out would not stop
    // there: nothing lies behind the edge, so this walk would end up many units deep.
    expect(worst).toBeLessThan(EXPLORATION.thicket.radius + 0.5);
  });

  it('does not cross the river anywhere but the bridge, even through the new forest', () => {
    const b = WORLD.bridge;
    const blocked = navGrid((x, z) => Math.abs(x - b.x) < 2 && Math.abs(z - b.z) < b.halfWidth + 1);
    const eastCamp = blocked.nearestWalkable(NPC.travelers[0].spawn[0], NPC.travelers[0].spawn[1], 3, false);
    expect(eastCamp).toBeGreaterThanOrEqual(0);
    expect(blocked.isReachable(eastCamp)).toBe(false);
    const hollow = blocked.nearestWalkable(79, 28, 3, false);
    expect(blocked.isReachable(hollow)).toBe(false);
    const ruins = blocked.nearestWalkable(3, -33, 3, false);
    expect(blocked.isReachable(ruins)).toBe(true);
  });

  it('never leaves a tree hiding open ground outside the valley', () => {
    const slope = 1 / Math.tan((CAMERA.elevationDeg * Math.PI) / 180);
    const yaw = (CAMERA.yawDeg * Math.PI) / 180;
    const heights: Record<string, number> = { pine: 5.7, pineSlim: 6.4, oak: 5.2, oakAmber: 5.2 };
    const { minZ, maxZ } = WORLD.strip;
    for (const p of world.placements) {
      const proto = heights[p.kind];
      if (!proto || (p.z >= minZ && p.z <= maxZ)) continue;
      const hides = proto * p.scale * p.heightScale * slope;
      // Directly behind the trunk, stopping short of the margin the scatter keeps.
      for (let t = 1; t < hides - EXPLORATION.forest.viewMargin - 0.5; t += 1) {
        const x = p.x - Math.sin(yaw) * t;
        const z = p.z - Math.cos(yaw) * t;
        if (z >= minZ && z <= maxZ) continue;
        expect(world.open.distance(x, z), `${p.kind} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeGreaterThan(-0.3);
      }
    }
  });

  it('keeps the camera as it was inside the valley, and with the player beyond it', () => {
    const { minZ, maxZ } = WORLD.strip;
    for (let z = minZ; z <= maxZ; z += 1) expect(cameraDepthTarget(z)).toBeCloseTo(z * CAMERA.depthFollow);
    // Continuous everywhere, with no jump at the edges.
    for (let z = WORLD.bounds.minZ; z < WORLD.bounds.maxZ; z += 0.25) {
      expect(Math.abs(cameraDepthTarget(z + 0.25) - cameraDepthTarget(z))).toBeLessThan(0.5);
    }
    expect(cameraDepthTarget(WORLD.bounds.minZ)).toBe(WORLD.bounds.minZ);
    expect(cameraDepthTarget(WORLD.bounds.maxZ)).toBe(WORLD.bounds.maxZ + CAMERA.southLead);
  });
});

const INTERACT_REACH = 2.2;

describe('the horizon', () => {
  const { horizon } = CAMERA;

  it('stays where the valley always had it, whenever the player is in the valley', () => {
    for (let z = WORLD.strip.minZ; z <= WORLD.strip.maxZ; z += 0.5) {
      expect(horizonForFocus(cameraDepthTarget(z))).toBe(horizon.valleyZ);
    }
    // Further south nothing is cut off at all: the village stays in view behind you.
    expect(horizonForFocus(cameraDepthTarget(WORLD.bounds.maxZ))).toBe(horizon.valleyZ);
  });

  it('moves smoothly ahead of a player going north, within the terrain', () => {
    let previous = horizonForFocus(cameraDepthTarget(WORLD.strip.minZ));
    for (let z = WORLD.strip.minZ; z >= WORLD.bounds.minZ; z -= 0.25) {
      const value = horizonForFocus(cameraDepthTarget(z));
      expect(value).toBeLessThanOrEqual(previous);
      expect(previous - value).toBeLessThan(0.6);
      expect(value).toBeLessThan(z);
      previous = value;
    }
    expect(previous - horizon.band).toBeGreaterThanOrEqual(WORLD.terrain.minZ);
  });
});

describe('treasure', () => {
  it('has 5 to 8 chests worth 2 to 6 coins, both near paths and hidden away', () => {
    const { treasures } = EXPLORATION;
    expect(treasures.length).toBeGreaterThanOrEqual(5);
    expect(treasures.length).toBeLessThanOrEqual(8);
    for (const t of treasures) {
      expect(t.coins).toBeGreaterThanOrEqual(2);
      expect(t.coins).toBeLessThanOrEqual(6);
    }
    expect(treasures.some((t) => t.placement === 'visible')).toBe(true);
    expect(treasures.some((t) => t.placement === 'hidden')).toBe(true);
    expect(new Set(treasures.map((t) => t.id)).size).toBe(treasures.length);
  });

  it('pays once only, and the same amount every time the game is played', () => {
    const resources = { coins: 0, wood: 0, woodCapacity: 10 };
    const state = createExplorationState();
    const def = EXPLORATION.treasures[0];
    expect(openTreasure(state.treasures[0], def, resources)).toBe(def.coins);
    expect(resources.coins).toBe(def.coins);
    expect(openTreasure(state.treasures[0], def, resources)).toBe(0);
    expect(resources.coins).toBe(def.coins);
    expect(openedTreasureCount(state)).toBe(1);
  });

  it('works through the E interaction, standing at the chest', () => {
    const { state } = freshGame();
    const def = EXPLORATION.treasures[2];
    const interaction = new InteractionSystem(createExplorationInteractables(state));
    const before = state.resources.coins;
    interaction.update(def.x + 1, def.z + 1, false, 1 / 60);
    expect(interaction.focus?.prompt()).toBe('Open the chest');
    interaction.update(def.x + 1, def.z + 1, true, 1 / 60);
    expect(state.resources.coins).toBe(before + def.coins);
    expect(interaction.feedback).toContain(`${def.coins} coins`);
    // The message stays on screen, and pressing again gives nothing.
    interaction.update(def.x + 1, def.z + 1, false, 1 / 60);
    expect(interaction.feedback).toContain(`${def.coins} coins`);
    interaction.update(def.x + 1, def.z + 1, true, 1 / 60);
    expect(state.resources.coins).toBe(before + def.coins);
    expect(interaction.focus?.prompt()).toBe('Look in the empty chest');
  });

  it('survives a save and load, as plain JSON', () => {
    const resources = { coins: 0, wood: 0, woodCapacity: 10 };
    const state = createExplorationState();
    openTreasure(state.treasures[3], EXPLORATION.treasures[3], resources);
    state.landmarks[1].discovered = true;
    const save = JSON.parse(JSON.stringify(saveExploration(state)));

    const restored = createExplorationState();
    loadExploration(restored, { ...save, openedTreasures: [...save.openedTreasures, 'a-chest-since-removed'] });
    expect(restored.treasures[3].opened).toBe(true);
    expect(restored.treasures[0].opened).toBe(false);
    expect(restored.landmarks[1].discovered).toBe(true);
    expect(openTreasure(restored.treasures[3], EXPLORATION.treasures[3], resources)).toBe(0);
  });
});

describe('landmarks', () => {
  it('are announced once, when first reached', () => {
    const { state } = freshGame();
    const system = new ExplorationSystem(state);
    system.update(1);
    expect(state.notice.text).toBe('');
    const def = EXPLORATION.landmarks[0];
    state.player.x = def.x;
    state.player.z = def.z;
    system.update(1);
    expect(state.notice.text).toContain(def.name);
    state.notice.text = '';
    system.update(1);
    expect(state.notice.text).toBe('');
    expect(discoverLandmarks(state.exploration, EXPLORATION.landmarks, def.x, def.z)).toBeNull();
  });

  it('exist in distinct places, at least four of them', () => {
    expect(EXPLORATION.landmarks.length).toBeGreaterThanOrEqual(4);
    for (const a of EXPLORATION.landmarks) {
      for (const b of EXPLORATION.landmarks) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(20);
      }
    }
  });
});

describe('travelers', () => {
  it('cost 2 coins to invite, once, and refuse without them', () => {
    expect(ECONOMY.travelerInviteCost).toBe(2);
    const { npcs } = freshGame();
    const wren = traveler(npcs, 'wren');
    const poor = { coins: 1, wood: 0, woodCapacity: 10 };
    expect(inviteTraveler(wren, poor)).toBe('no-coins');
    expect(poor.coins).toBe(1);
    expect(wren.travelPhase).toBe('waiting');

    const rich = { coins: 5, wood: 0, woodCapacity: 10 };
    expect(inviteTraveler(wren, rich)).toBe('invited');
    expect(rich.coins).toBe(3);
    expect(inviteTraveler(wren, rich)).toBe('not-available');
    expect(rich.coins).toBe(3);
  });

  it('do not count as villagers or workers before they arrive', () => {
    const { state, npcs } = freshGame();
    expect(villagerCount(npcs)).toBe(NPC.villagers.length);
    const wren = traveler(npcs, 'wren');
    inviteTraveler(wren, state.resources);
    expect(villagerCount(npcs)).toBe(NPC.villagers.length);

    // Neither hiring nor a building site can claim someone still on the road.
    state.village.maxWoodcutters = 10;
    expect(recruitWoodcutter(wren, state.village, npcs)).toBe('not-available');
    for (const npc of npcs) if (npc !== wren && npc.job === 'villager') npc.job = 'woodcutter';
    state.construction[0].status = 'funded';
    assignWorkers(state.construction, BUILDINGS, npcs);
    expect(state.construction[0].workerId).not.toBe('wren');
    expect(wren.assignedSite).toBe(-1);
  });

  it('offer a clear result through the E interaction', () => {
    const { state, npcs } = freshGame();
    const wren = traveler(npcs, 'wren');
    const interaction = new InteractionSystem(createVillageInteractables(state));
    state.resources.coins = 1;
    interaction.update(wren.x + 1, wren.z, false, 1 / 60);
    expect(interaction.focus?.prompt()).toContain('Invite Wren');
    expect(interaction.focus?.isActionable?.()).toBe(false);
    interaction.update(wren.x + 1, wren.z, true, 1 / 60);
    expect(interaction.feedback).toContain('2 coins');
    expect(state.resources.coins).toBe(1);

    state.resources.coins = 2;
    expect(interaction.focus?.isActionable?.()).toBe(true);
    interaction.update(wren.x + 1, wren.z, true, 1 / 60);
    expect(state.resources.coins).toBe(0);
    expect(interaction.feedback).toContain('sets off');
    expect(wren.travelPhase).toBe('journey');
    interaction.update(wren.x + 1, wren.z, true, 1 / 60);
    expect(state.resources.coins).toBe(0);
  });

  it('walk all the way from the far camp over the bridge, then settle and can be hired', () => {
    const { state, system, npcs } = freshGame();
    state.time.paused = true;
    const wren = traveler(npcs, 'wren');
    state.player.x = wren.x + 1;
    state.player.z = wren.z;
    const startX = wren.x;
    const startZ = wren.z;
    expect(inviteTraveler(wren, state.resources)).toBe('invited');
    state.player.x = -16;
    state.player.z = 1;

    const dt = 1 / 60;
    const b = WORLD.bridge;
    let crossedOnBridge = false;
    let travelled = 0;
    let lastMoved = 0;
    let step = 0;
    // The whole journey runs through the day and into the night, which must not stop it.
    for (; step < 60 * 180 && wren.travelPhase === 'journey'; step++) {
      state.time.dayTime = 0.5 + (step / (60 * 180)) * 0.45;
      const px = wren.x;
      const pz = wren.z;
      system.update(dt);
      const moved = Math.hypot(wren.x - px, wren.z - pz);
      expect(moved, 'no teleporting').toBeLessThan((wren.walkSpeed + 2) * dt * 2);
      travelled += moved;
      if (moved > 0.001) lastMoved = step;
      expect(step - lastMoved, 'never stuck for long').toBeLessThan(60 * 10);
      if (Math.abs(wren.x - b.x) < WORLD.river.blockHalfWidth) {
        expect(Math.abs(wren.z - b.z)).toBeLessThan(b.halfWidth + 0.2);
        crossedOnBridge = true;
      }
      expect(collision.isBlocked(wren.x, wren.z, NPC.radius - 0.15), `inside something at ${wren.x},${wren.z}`).toBe(false);
    }
    expect(wren.travelPhase, `still walking at ${wren.x},${wren.z}, task ${wren.task}`).toBe('settled');
    expect(crossedOnBridge).toBe(true);
    expect(travelled).toBeGreaterThan(Math.hypot(startX - WORLD.campfire.x, startZ - WORLD.campfire.z));
    expect(Math.hypot(wren.x - WORLD.campfire.x, wren.z - WORLD.campfire.z)).toBeLessThan(NPC.fireRingMax + 2);

    expect(wren.job).toBe('villager');
    expect(villagerCount(npcs)).toBe(NPC.villagers.length + 1);
    expect(state.notice.text).toContain('Wren has reached the village');
    expect(recruitWoodcutter(wren, state.village, npcs)).toBe('recruited');
    expect(woodcutterCount(npcs)).toBe(1);
  });

  it('are also able to come from the south-west camp', () => {
    const { state, system, npcs } = freshGame();
    const maren = traveler(npcs, 'maren');
    inviteTraveler(maren, state.resources);
    for (let step = 0; step < 60 * 90 && maren.travelPhase === 'journey'; step++) system.update(1 / 60);
    expect(maren.travelPhase).toBe('settled');
  });

  it('are not simulated while waiting far from the player, and wake when the player comes near', () => {
    const { state, system, npcs } = freshGame();
    const wren = traveler(npcs, 'wren');
    const x = wren.x;
    const z = wren.z;
    const stateBefore = { state: wren.state, timer: wren.stateTimer };
    for (let step = 0; step < 600; step++) system.update(1 / 60);
    expect(wren.dormant).toBe(true);
    expect([wren.x, wren.z]).toEqual([x, z]);
    expect(wren.stateTimer).toBe(stateBefore.timer);

    state.player.x = x + 6;
    state.player.z = z;
    for (let step = 0; step < 60 * 20; step++) system.update(1 / 60);
    expect(wren.dormant).toBe(false);
    expect(wren.stateTimer).not.toBe(stateBefore.timer);
  });
});
