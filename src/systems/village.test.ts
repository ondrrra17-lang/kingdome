import { describe, expect, it } from 'vitest';
import { ATMOSPHERE, ECONOMY, NPC, WORLD } from '../config';
import { advanceClock, createGameState } from '../core/GameState';
import { createNpc, type NpcState, type VillagerDefinition } from '../entities/Npc';
import { buildWorldData } from '../world/WorldData';
import { CollisionWorld } from './CollisionWorld';
import { InteractionSystem, type Interactable } from './interaction/InteractionSystem';
import { NavGrid } from './navigation/NavGrid';
import { Pathfinder } from './navigation/Pathfinder';
import { chooseActivity, updateBrain, type BrainContext } from './npc/NpcBrain';
import { NpcSystem } from './npc/NpcSystem';
import { routinePhase } from './npc/schedule';
import { VillageSites, type SiteQueries } from './npc/VillageSites';
import { recruitWoodcutter } from './Recruitment';
import { addWood, trySpendCoins } from './Resources';

const LIMITS = { maxWoodcutters: 1, watchPosts: 0 };
const DAY = 0.5;
const EVENING = 0.75;
const NIGHT = 0.95;

const def = (overrides: Partial<VillagerDefinition> = {}): VillagerDefinition => ({ ...NPC.villagers[1], ...overrides });

function fakeSites(): SiteQueries {
  return {
    trees: [{ x: 20, z: 0, standX: 19, standZ: 0 }],
    buildSites: [],
    doors: [{ x: 1, z: 1, faceX: 1, faceZ: 0 }, { x: 2, z: 1, faceX: 2, faceZ: 0 }, { x: 3, z: 1, faceX: 3, faceZ: 0 }],
    storageX: -5, storageZ: 0, storageStandX: -4, storageStandZ: 0,
    fireX: 5, fireZ: 5,
    pointX: 0, pointZ: 0,
    nearestPoint(x, z) { this.pointX = x; this.pointZ = z; return true; },
  };
}

function setup(dayTime = DAY): { npc: NpcState; ctx: BrainContext } {
  const npc = createNpc(def(), 0, 0, 0, 1, 0);
  const ctx: BrainContext = { dayTime, resources: { coins: 5, wood: 0, woodCapacity: 100 }, sites: fakeSites(), npcs: [npc] };
  return { npc, ctx };
}

describe('resources and recruitment', () => {
  it('starts with the configured coins and no wood', () => {
    expect(createGameState(0).resources).toEqual({ coins: ECONOMY.startCoins, wood: 0, woodCapacity: ECONOMY.baseWoodCapacity });
    expect(ECONOMY.startCoins).toBe(5);
    expect(ECONOMY.travelerInviteCost).toBe(2);
  });

  it('adds delivered wood to the central count', () => {
    const r = { coins: 0, wood: 2, woodCapacity: 10 };
    addWood(r, 3);
    expect(r.wood).toBe(5);
  });

  it('never overspends', () => {
    const r = { coins: 1, wood: 0, woodCapacity: 10 };
    expect(trySpendCoins(r, 2)).toBe(false);
    expect(r.coins).toBe(1);
    expect(trySpendCoins(r, 1)).toBe(true);
    expect(r.coins).toBe(0);
  });

  it('giving a villager a job is free, and works with no coins at all', () => {
    const { npc } = setup();
    expect(recruitWoodcutter(npc, LIMITS, [npc])).toBe('recruited');
    expect(npc.job).toBe('woodcutter');
  });

  it('refuses at the woodcutter limit and changes nothing', () => {
    const { npc } = setup();
    expect(recruitWoodcutter(npc, { maxWoodcutters: 0, watchPosts: 0 }, [npc])).toBe('limit-reached');
    expect(npc.job).toBe('villager');
  });

  it('refuses someone who already has a job', () => {
    const { npc } = setup();
    recruitWoodcutter(npc, LIMITS, [npc]);
    expect(recruitWoodcutter(npc, LIMITS, [npc])).toBe('not-available');
    const gatherer = createNpc(def({ job: 'gatherer' }), 0, 0, 0, 1, 0);
    expect(recruitWoodcutter(gatherer, LIMITS, [gatherer])).toBe('not-available');
  });
});

describe('routines', () => {
  const schedule = { wake: 0.27, evening: 0.72, bed: 0.8 };

  it('maps time of day to phases', () => {
    expect(routinePhase(0.1, schedule)).toBe('night');
    expect(routinePhase(0.5, schedule)).toBe('day');
    expect(routinePhase(0.75, schedule)).toBe('evening');
    expect(routinePhase(0.9, schedule)).toBe('night');
  });

  it('gives villagers different but repeatable schedules', () => {
    const make = (): NpcState[] => NPC.villagers.map((v, i) => createNpc(v, 0, 0, 0, WORLD.seed, i));
    const a = make();
    expect(new Set(a.map((n) => n.schedule.wake)).size).toBe(a.length);
    expect(make().map((n) => n.schedule)).toEqual(a.map((n) => n.schedule));
  });

  it('chooses activities by job and phase', () => {
    expect(chooseActivity('woodcutter', 'wanderer', 'day', 0.5)).toBe('work');
    expect(chooseActivity('villager', 'wanderer', 'night', 0.5)).toBe('home');
    expect(chooseActivity('woodcutter', 'wanderer', 'night', 0.5)).toBe('home');
    expect(chooseActivity('woodcutter', 'wanderer', 'evening', 0.1)).toBe('fire');
  });
});

describe('villager state machine', () => {
  it('goes from idle to walking when the timer ends', () => {
    const { npc, ctx } = setup();
    npc.stateTimer = 0;
    updateBrain(npc, ctx);
    expect(npc.state).toBe('walk');
    expect(npc.pathStatus).toBe('pending');
  });

  it('runs the whole woodcutter loop and delivers wood once', () => {
    const { npc, ctx } = setup();
    recruitWoodcutter(npc, LIMITS, [npc]);
    npc.stateTimer = 0;
    updateBrain(npc, ctx);
    expect(npc.task).toBe('toTree');

    npc.arrived = true;
    updateBrain(npc, ctx);
    expect(npc.state).toBe('work');
    expect(npc.task).toBe('chop');
    expect(ctx.resources.wood).toBe(0);

    npc.stateTimer = 0;
    updateBrain(npc, ctx);
    expect(npc.task).toBe('deliver');
    expect(npc.carrying).toBe(true);
    expect(ctx.resources.wood).toBe(0);

    npc.arrived = true;
    updateBrain(npc, ctx);
    expect(ctx.resources.wood).toBe(ECONOMY.woodPerDelivery);
    expect(npc.woodDelivered).toBe(ECONOMY.woodPerDelivery);
    expect(npc.carrying).toBe(false);

    updateBrain(npc, ctx);
    expect(ctx.resources.wood).toBe(ECONOMY.woodPerDelivery);
  });

  it('adds nothing to storage for a firewood gatherer', () => {
    const npc = createNpc(def({ job: 'gatherer' }), 0, 0, 0, 1, 0);
    const ctx: BrainContext = { dayTime: DAY, resources: { coins: 5, wood: 0, woodCapacity: 100 }, sites: fakeSites(), npcs: [npc] };
    npc.state = 'walk';
    npc.task = 'deliver';
    npc.carrying = true;
    npc.arrived = true;
    updateBrain(npc, ctx);
    expect(ctx.resources.wood).toBe(0);
    expect(npc.carrying).toBe(false);
  });

  it('still delivers carried wood when evening comes', () => {
    const { npc, ctx } = setup(EVENING);
    recruitWoodcutter(npc, LIMITS, [npc]);
    npc.state = 'walk';
    npc.task = 'deliver';
    npc.carrying = true;
    updateBrain(npc, ctx);
    expect(npc.task).toBe('deliver');
    ctx.dayTime = NIGHT;
    updateBrain(npc, ctx);
    expect(npc.task).toBe('deliver');
  });

  it('stops chopping at evening', () => {
    const { npc, ctx } = setup(EVENING);
    recruitWoodcutter(npc, LIMITS, [npc]);
    npc.state = 'work';
    npc.task = 'chop';
    npc.stateTimer = 100;
    updateBrain(npc, ctx);
    expect(npc.task).not.toBe('chop');
  });

  it('walks home at night, goes inside, and comes out in the morning', () => {
    const { npc, ctx } = setup(NIGHT);
    npc.stateTimer = 5;
    updateBrain(npc, ctx);
    expect(npc.task).toBe('goHome');

    npc.arrived = true;
    updateBrain(npc, ctx);
    expect(npc.state).toBe('rest');
    npc.stateTimer = 0;
    updateBrain(npc, ctx);
    expect(npc.indoors).toBe(true);

    updateBrain(npc, ctx);
    expect(npc.indoors).toBe(true);

    ctx.dayTime = DAY;
    updateBrain(npc, ctx);
    expect(npc.indoors).toBe(false);
    expect(npc.state).toBe('idle');
  });

  it('holds still while talking to the player', () => {
    const { npc, ctx } = setup();
    npc.stateTimer = 0;
    npc.attentionTimer = 2;
    updateBrain(npc, ctx);
    expect(npc.state).toBe('idle');
  });
});

describe('navigation on the real world', () => {
  const world = buildWorldData();
  const collision = new CollisionWorld(world.colliders);
  const inset = NPC.navClearance;
  const { minX, maxX, minZ, maxZ } = WORLD.bounds;
  const nav = new NavGrid(
    { minX: minX + inset, maxX: maxX - inset, minZ: minZ + inset, maxZ: maxZ - inset },
    NPC.navCellSize,
    (x, z) => collision.isBlocked(x, z, NPC.navClearance),
  );
  nav.setMainRegion(WORLD.campfire.x, WORLD.campfire.z + 4);
  const pathfinder = new Pathfinder(nav);
  const sites = new VillageSites(nav, world);
  const outX = new Float32Array(NPC.maxWaypoints);
  const outZ = new Float32Array(NPC.maxWaypoints);

  it('reaches every house, the pile and the woodlot', () => {
    expect(sites.doors.length).toBe(WORLD.houses.length);
    expect(sites.trees.length).toBeGreaterThanOrEqual(WORLD.woodlot.length);
    expect(sites.trees.length).toBeGreaterThanOrEqual(NPC.treeChoiceCount);
    for (const door of sites.doors) {
      expect(pathfinder.find(WORLD.campfire.x, WORLD.campfire.z + 4, door.x, door.z, outX, outZ)).toBeGreaterThan(0);
    }
    expect(pathfinder.find(WORLD.campfire.x, WORLD.campfire.z + 4, sites.storageStandX, sites.storageStandZ, outX, outZ)).toBeGreaterThan(0);
  });

  it('crosses the river only on the bridge', () => {
    const count = pathfinder.find(10, 5, 60, 5, outX, outZ);
    expect(count).toBeGreaterThan(0);
    const b = WORLD.bridge;
    let prevX = 10;
    let prevZ = 5;
    for (let i = 0; i < count; i++) {
      const steps = 40;
      for (let s = 0; s <= steps; s++) {
        const x = prevX + ((outX[i] - prevX) * s) / steps;
        const z = prevZ + ((outZ[i] - prevZ) * s) / steps;
        if (Math.abs(x - b.x) < WORLD.river.blockHalfWidth) expect(Math.abs(z - b.z)).toBeLessThan(b.halfWidth);
      }
      prevX = outX[i];
      prevZ = outZ[i];
    }
    expect(prevX).toBeGreaterThan(b.x + b.halfLength);
  });

  it('has no route through a solid obstacle', () => {
    expect(nav.isWalkable(nav.cellAt(WORLD.houses[1].x, WORLD.houses[1].z))).toBe(false);
    expect(nav.isWalkable(nav.cellAt(WORLD.bridge.x, 5))).toBe(false);
  });

  it('keeps a recruited woodcutter delivering over simulated time, with no one stuck in a blocked spot', () => {
    const npcs = NPC.villagers.map((v, i) => {
      sites.nearestPoint(v.spawn[0], v.spawn[1]);
      return createNpc(v, sites.pointX, world.surfaceHeight(sites.pointX, sites.pointZ), sites.pointZ, WORLD.seed, i);
    });
    const state = createGameState(0, npcs);
    state.time.dayTime = 0.3;
    const system = new NpcSystem(state, sites, pathfinder, { collision, surfaceHeight: world.surfaceHeight });
    const cutter = npcs.find((n) => n.job === 'villager')!;
    recruitWoodcutter(cutter, state.village, state.npcs);
    state.resources.woodCapacity = 100000;

    const dt = 1 / 60;
    let crossedRiverOffBridge = false;
    for (let step = 0; step < 60 * 90; step++) {
      state.time.dayTime = 0.3 + (step / (60 * 90)) * 0.35;
      system.update(dt);
      for (const npc of npcs) {
        const b = WORLD.bridge;
        if (Math.abs(npc.x - b.x) < 4 && Math.abs(npc.z - b.z) > b.halfWidth) crossedRiverOffBridge = true;
      }
    }
    expect(state.resources.wood).toBeGreaterThanOrEqual(ECONOMY.woodPerDelivery);
    expect(state.resources.wood % ECONOMY.woodPerDelivery).toBe(0);
    expect(cutter.woodDelivered).toBe(state.resources.wood);
    expect(crossedRiverOffBridge).toBe(false);

    // Evening and night: everybody ends up indoors.
    for (let step = 0; step < 60 * 90; step++) {
      state.time.dayTime = 0.9;
      system.update(dt);
    }
    expect(npcs.every((n) => n.indoors)).toBe(true);
  });
});

describe('long-run village simulation', () => {
  it('keeps working for five game days with nobody stuck, lost or in the river', () => {
    const world = buildWorldData();
    const collision = new CollisionWorld(world.colliders);
    const inset = NPC.navClearance;
    const { minX, maxX, minZ, maxZ } = WORLD.bounds;
    const nav = new NavGrid(
      { minX: minX + inset, maxX: maxX - inset, minZ: minZ + inset, maxZ: maxZ - inset },
      NPC.navCellSize,
      (x, z) => collision.isBlocked(x, z, NPC.navClearance),
    );
    nav.setMainRegion(-16, 1);
    const pathfinder = new Pathfinder(nav);
    const sites = new VillageSites(nav, world);
    const npcs = NPC.villagers.map((v, i) => {
      sites.nearestPoint(v.spawn[0], v.spawn[1]);
      return createNpc(v, sites.pointX, 0, sites.pointZ, WORLD.seed, i);
    });
    const state = createGameState(0, npcs);
    const system = new NpcSystem(state, sites, pathfinder, { collision, surfaceHeight: world.surfaceHeight });
    recruitWoodcutter(npcs[1], state.village, state.npcs);
    // This run is about behavior over time, so the wood limit should not cap the count.
    state.resources.woodCapacity = 100000;

    const dt = 1 / 60;
    const stepsPerDay = ATMOSPHERE.dayLengthSeconds * 60;
    const woodByDay: number[] = [];
    const statesSeen = new Set<string>();
    const lastMoved = npcs.map(() => 0);
    for (let step = 0; step < stepsPerDay * 5; step++) {
      advanceClock(state.time, 1 / stepsPerDay);
      system.update(dt);
      for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        statesSeen.add(npc.state);
        expect(Number.isFinite(npc.x) && Number.isFinite(npc.z)).toBe(true);
        expect(npc.x).toBeGreaterThanOrEqual(minX);
        expect(npc.x).toBeLessThanOrEqual(maxX);
        expect(npc.z).toBeGreaterThanOrEqual(minZ);
        expect(npc.z).toBeLessThanOrEqual(maxZ);
        if (Math.abs(npc.x - WORLD.bridge.x) < 4) expect(Math.abs(npc.z - WORLD.bridge.z)).toBeLessThan(WORLD.bridge.halfWidth);
        if (npc.speed > 0.1 || npc.indoors || npc.state !== 'walk') lastMoved[i] = step;
        // Nobody may be trying to walk yet going nowhere for more than half a minute.
        expect(step - lastMoved[i]).toBeLessThan(60 * 30);
      }
      if (step % stepsPerDay === stepsPerDay - 1) woodByDay.push(state.resources.wood);
    }
    expect([...statesSeen].sort()).toEqual(['idle', 'rest', 'walk', 'work']);
    // Wood must keep coming in on every single day, not only the first.
    for (let d = 1; d < woodByDay.length; d++) expect(woodByDay[d]).toBeGreaterThan(woodByDay[d - 1]);
    // Far below one search per villager per second: pathfinding is not running every frame.
    const searchesPerSecond = pathfinder.searches / (ATMOSPHERE.dayLengthSeconds * 5);
    expect(searchesPerSecond).toBeLessThan(1);
  }, 60000);
});

describe('interaction system', () => {
  const item = (id: string, x: number, available = true): Interactable & { uses: number } => ({
    id, x, z: 0, range: 3, markerRadius: 1, uses: 0,
    isAvailable: () => available,
    prompt: () => id,
    interact() { this.uses++; return `used ${id}`; },
  });

  it('focuses only the nearest item in range', () => {
    const near = item('near', 1);
    const far = item('far', 2);
    const system = new InteractionSystem([far, near]);
    system.update(0, 0, false, 1 / 60);
    expect(system.focus).toBe(near);
  });

  it('ignores out-of-range and unavailable items', () => {
    const system = new InteractionSystem([item('away', 10), item('off', 1, false)]);
    system.update(0, 0, false, 1 / 60);
    expect(system.focus).toBeNull();
  });

  it('triggers once per press and hides feedback on walking away', () => {
    const a = item('a', 1);
    const system = new InteractionSystem([a]);
    system.update(0, 0, true, 1 / 60);
    system.update(0, 0, false, 1 / 60);
    system.update(0, 0, false, 1 / 60);
    expect(a.uses).toBe(1);
    expect(system.feedback).toBe('used a');
    system.update(50, 0, false, 1 / 60);
    expect(system.focus).toBeNull();
    expect(system.feedback).toBe('');
  });

  it('does nothing when pressed with no focus', () => {
    const a = item('a', 10);
    const system = new InteractionSystem([a]);
    system.update(0, 0, true, 1 / 60);
    expect(a.uses).toBe(0);
  });
});
