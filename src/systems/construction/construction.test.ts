import { describe, expect, it } from 'vitest';
import { BUILDINGS, ECONOMY, NPC, WORLD } from '../../config';
import { createGameState, type GameState } from '../../core/GameState';
import { createNpc, type NpcState } from '../../entities/Npc';
import { buildWorldData } from '../../world/WorldData';
import { CollisionWorld } from '../CollisionWorld';
import { DailyIncome } from '../DailyIncome';
import { NavGrid } from '../navigation/NavGrid';
import { Pathfinder } from '../navigation/Pathfinder';
import { updateBrain, type BrainContext } from '../npc/NpcBrain';
import { NpcSystem } from '../npc/NpcSystem';
import { VillageSites } from '../npc/VillageSites';
import { canBeRecruited, recruitWoodcutter } from '../Recruitment';
import { addWood } from '../Resources';
import { advanceSite, applyBuildingEffect, assignWorkers, createSiteStates, fundSite } from './ConstructionState';
import { ConstructionSystem } from './ConstructionSystem';
import { createSiteInteractables } from './siteInteractables';

const def = (id: string) => BUILDINGS.find((b) => b.id === id)!;
const HUT = def('hut');
const TOWER = def('watchtower');
const SHED = def('shed');

function makeNpcs(): NpcState[] {
  return NPC.villagers.map((v, i) => createNpc(v, 100 + i * 10, 0, 0, WORLD.seed, i));
}

describe('building data', () => {
  it('has the specified costs', () => {
    expect(HUT.cost).toEqual({ wood: 4, coins: 2 });
    expect(TOWER.cost).toEqual({ wood: 6, coins: 3 });
    expect(SHED.cost).toEqual({ wood: 5, coins: 2 });
  });

  it('can store enough wood for the most expensive building', () => {
    for (const b of BUILDINGS) expect(b.cost.wood).toBeLessThanOrEqual(ECONOMY.baseWoodCapacity);
  });

  it('lets the whole village be afforded through income', () => {
    expect(ECONOMY.dailyCoins).toBeGreaterThan(0);
  });
});

describe('funding', () => {
  it('deducts the exact cost once and moves to FUNDED', () => {
    const [site] = createSiteStates();
    const r = { coins: 5, wood: 9, woodCapacity: 10 };
    expect(fundSite(site, HUT.cost, r)).toBe('funded');
    expect(r).toEqual({ coins: 3, wood: 5, woodCapacity: 10 });
    expect(site.status).toBe('funded');
  });

  it('never deducts a second time', () => {
    const [site] = createSiteStates();
    const r = { coins: 20, wood: 9, woodCapacity: 10 };
    fundSite(site, HUT.cost, r);
    expect(fundSite(site, HUT.cost, r)).toBe('already-funded');
    expect(r.coins).toBe(18);
    expect(r.wood).toBe(5);
  });

  it.each([
    ['too little wood', { coins: 5, wood: 3, woodCapacity: 10 }],
    ['too few coins', { coins: 1, wood: 9, woodCapacity: 10 }],
  ])('refuses with %s and takes nothing', (_name, r) => {
    const before = { ...r };
    const [site] = createSiteStates();
    expect(fundSite(site, HUT.cost, r)).toBe('insufficient');
    expect(r).toEqual(before);
    expect(site.status).toBe('available');
  });
});

describe('state transitions', () => {
  function funded() {
    const sites = createSiteStates();
    const npcs = makeNpcs();
    fundSite(sites[0], HUT.cost, { coins: 9, wood: 9, woodCapacity: 10 });
    assignWorkers(sites, BUILDINGS, npcs);
    const worker = npcs.find((n) => n.id === sites[0].workerId)!;
    return { site: sites[0], worker };
  }

  it('stays FUNDED until the worker is actually building', () => {
    const { site, worker } = funded();
    worker.task = 'toSite';
    expect(advanceSite(site, worker, 10, 1)).toBe(false);
    expect(site.status).toBe('funded');
    expect(site.progress).toBe(0);
  });

  it('goes BUILDING, then COMPLETED, releasing the worker', () => {
    const { site, worker } = funded();
    worker.task = 'build';
    expect(advanceSite(site, worker, 10, 5)).toBe(false);
    expect(site.status).toBe('building');
    expect(site.progress).toBeCloseTo(0.5);
    expect(advanceSite(site, worker, 10, 5)).toBe(true);
    expect(site.status).toBe('completed');
    expect(worker.assignedSite).toBe(-1);
    expect(site.workerId).toBeNull();
    expect(advanceSite(site, worker, 10, 5)).toBe(false);
  });

  it('pauses while the worker talks to the player', () => {
    const { site, worker } = funded();
    worker.task = 'build';
    worker.attentionTimer = 2;
    advanceSite(site, worker, 10, 5);
    expect(site.progress).toBe(0);
  });

  it('does not advance an unfunded site', () => {
    const [site] = createSiteStates();
    const worker = makeNpcs()[1];
    worker.task = 'build';
    expect(advanceSite(site, worker, 10, 5)).toBe(false);
    expect(site.status).toBe('available');
  });
});

describe('worker assignment', () => {
  it('uses only unemployed villagers', () => {
    const sites = createSiteStates();
    const npcs = makeNpcs();
    for (const n of npcs) if (n.job === 'villager') n.job = 'woodcutter';
    fundSite(sites[0], HUT.cost, { coins: 9, wood: 9, woodCapacity: 10 });
    assignWorkers(sites, BUILDINGS, npcs);
    expect(sites[0].workerId).toBeNull();
    expect(sites[0].status).toBe('funded');
  });

  it('never gives one villager two sites, even when all are funded at once', () => {
    const sites = createSiteStates();
    const npcs = makeNpcs();
    const r = { coins: 99, wood: 99, woodCapacity: 99 };
    sites.forEach((s, i) => fundSite(s, BUILDINGS[i].cost, r));
    assignWorkers(sites, BUILDINGS, npcs);
    assignWorkers(sites, BUILDINGS, npcs);
    const ids = sites.map((s) => s.workerId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(Math.min(BUILDINGS.length, npcs.filter((n) => n.job === 'villager').length));
    for (const n of npcs) {
      expect(sites.filter((s) => s.workerId === n.id).length).toBeLessThanOrEqual(1);
    }
  });

  it('queues a site when there are more sites than free villagers', () => {
    const sites = createSiteStates();
    const npcs = makeNpcs();
    const free = npcs.filter((n) => n.job === 'villager');
    free.slice(2).forEach((n) => { n.job = 'woodcutter'; });
    const r = { coins: 99, wood: 99, woodCapacity: 99 };
    sites.forEach((s, i) => fundSite(s, BUILDINGS[i].cost, r));
    assignWorkers(sites, BUILDINGS, npcs);
    const waiting = sites.filter((s) => s.workerId === null);
    expect(waiting.length).toBe(BUILDINGS.length - 2);
    expect(waiting[0].status).toBe('funded');

    // When a worker finishes, the waiting site gets them.
    const busy = sites.find((s) => s.workerId !== null)!;
    const worker = npcs.find((n) => n.id === busy.workerId)!;
    worker.task = 'build';
    advanceSite(busy, worker, 1, 2);
    assignWorkers(sites, BUILDINGS, npcs);
    expect(waiting[0].workerId).toBe(worker.id);
  });

  it('will not recruit someone who is assigned to build', () => {
    const npc = makeNpcs()[1];
    npc.assignedSite = 0;
    const state = createGameState(0, [npc]);
    expect(canBeRecruited(npc)).toBe(false);
    expect(recruitWoodcutter(npc, state.village, state.npcs)).toBe('not-available');
    expect(state.resources.coins).toBe(ECONOMY.startCoins);
  });
});

describe('villager AI with a site', () => {
  function context(npc: NpcState, dayTime = 0.5): BrainContext {
    return {
      dayTime,
      resources: { coins: 5, wood: 0, woodCapacity: 10 },
      npcs: [npc],
      sites: {
        trees: [{ x: 20, z: 0, standX: 19, standZ: 0 }],
        doors: [{ x: 1, z: 1, faceX: 1, faceZ: 0 }, { x: 2, z: 1, faceX: 2, faceZ: 0 }, { x: 3, z: 1, faceX: 3, faceZ: 0 }],
        buildSites: [{ x: 9, z: 9, standX: 8, standZ: 8 }],
        storageX: -5, storageZ: 0, storageStandX: -4, storageStandZ: 0,
        fireX: 5, fireZ: 5, pointX: 0, pointZ: 0,
        nearestPoint(x, z) { this.pointX = x; this.pointZ = z; return true; },
      },
    };
  }
  const fresh = (): NpcState => createNpc(NPC.villagers[1], 0, 0, 0, 1, 0);

  it('interrupts wandering to go to the site, then builds on arrival', () => {
    const npc = fresh();
    const ctx = context(npc);
    npc.stateTimer = 0;
    updateBrain(npc, ctx);
    expect(npc.state).toBe('walk');
    npc.assignedSite = 0;
    updateBrain(npc, ctx);
    expect(npc.task).toBe('toSite');
    expect(npc.goalX).toBe(8);
    npc.arrived = true;
    updateBrain(npc, ctx);
    expect(npc.state).toBe('work');
    expect(npc.task).toBe('build');
  });

  it('keeps building past any timer until released, then moves on', () => {
    const npc = fresh();
    const ctx = context(npc);
    npc.assignedSite = 0;
    updateBrain(npc, ctx);
    npc.arrived = true;
    updateBrain(npc, ctx);
    npc.stateTimer = -100;
    updateBrain(npc, ctx);
    expect(npc.task).toBe('build');
    npc.assignedSite = -1;
    updateBrain(npc, ctx);
    expect(npc.task).not.toBe('build');
  });

  it('stops at evening but keeps the assignment for the morning', () => {
    const npc = fresh();
    const ctx = context(npc);
    npc.assignedSite = 0;
    updateBrain(npc, ctx);
    npc.arrived = true;
    updateBrain(npc, ctx);
    ctx.dayTime = 0.76;
    updateBrain(npc, ctx);
    expect(npc.task).not.toBe('build');
    expect(npc.assignedSite).toBe(0);
    ctx.dayTime = 0.5;
    updateBrain(npc, ctx);
    expect(npc.task).toBe('toSite');
  });

  it('does not walk to work at night', () => {
    const npc = fresh();
    const ctx = context(npc, 0.95);
    npc.assignedSite = 0;
    npc.stateTimer = 0;
    updateBrain(npc, ctx);
    expect(npc.task).toBe('goHome');
  });
});

describe('building effects', () => {
  it('hut unlocks exactly one more woodcutter', () => {
    const npcs = makeNpcs();
    const state = createGameState(0, npcs);
    state.resources.coins = 20;
    const free = npcs.filter((n) => n.job === 'villager');
    expect(recruitWoodcutter(free[0], state.village, npcs)).toBe('recruited');
    expect(recruitWoodcutter(free[1], state.village, npcs)).toBe('limit-reached');
    expect(state.resources.coins, 'giving a job is free').toBe(20);

    applyBuildingEffect(HUT, state.resources, state.village);
    expect(recruitWoodcutter(free[1], state.village, npcs)).toBe('recruited');
    expect(recruitWoodcutter(free[2], state.village, npcs)).toBe('limit-reached');
  });

  it('shed raises the wood limit, and delivery respects it', () => {
    const r = { coins: 0, wood: 0, woodCapacity: ECONOMY.baseWoodCapacity };
    expect(addWood(r, 100)).toBe(ECONOMY.baseWoodCapacity);
    expect(r.wood).toBe(ECONOMY.baseWoodCapacity);
    expect(addWood(r, 3)).toBe(0);
    const limits = { maxWoodcutters: 1, watchPosts: 0 };
    applyBuildingEffect(SHED, r, limits);
    expect(r.woodCapacity).toBeGreaterThan(ECONOMY.baseWoodCapacity);
    expect(addWood(r, 3)).toBe(3);
  });

  it('watchtower records a watch post and nothing else', () => {
    const r = { coins: 1, wood: 1, woodCapacity: 10 };
    const limits = { maxWoodcutters: 1, watchPosts: 0 };
    applyBuildingEffect(TOWER, r, limits);
    expect(limits).toEqual({ maxWoodcutters: 1, watchPosts: 1 });
    expect(r).toEqual({ coins: 1, wood: 1, woodCapacity: 10 });
  });
});

describe('daily income', () => {
  it('pays once per new day, including when the clock is scrubbed back and forth', () => {
    const state = createGameState(0);
    const income = new DailyIncome(state);
    income.update();
    expect(state.resources.coins).toBe(ECONOMY.startCoins);
    state.time.day = 2;
    income.update();
    income.update();
    expect(state.resources.coins).toBe(ECONOMY.startCoins + ECONOMY.dailyCoins);
    state.time.day = 1;
    income.update();
    state.time.day = 2;
    income.update();
    expect(state.resources.coins).toBe(ECONOMY.startCoins + ECONOMY.dailyCoins);
  });
});

describe('interaction', () => {
  function setup(): { state: GameState; hut: ReturnType<typeof createSiteInteractables>[number] } {
    const state = createGameState(0, makeNpcs());
    const hut = createSiteInteractables(state)[BUILDINGS.indexOf(HUT)];
    return { state, hut };
  }

  it('shows name, costs and affordability', () => {
    const { state, hut } = setup();
    expect(hut.prompt()).toContain("Woodcutter's Hut");
    expect(hut.prompt()).toContain('4 wood');
    expect(hut.prompt()).toContain('2 coins');
    expect(hut.isActionable?.()).toBe(false);
    state.resources.wood = 4;
    expect(hut.isActionable?.()).toBe(true);
    expect(hut.prompt()).toMatch(/^Build /);
  });

  it('explains what is missing and takes nothing', () => {
    const { state, hut } = setup();
    state.resources.wood = 1;
    expect(hut.interact()).toContain('3 more wood');
    expect(state.resources).toMatchObject({ wood: 1, coins: ECONOMY.startCoins });
  });

  it('charges only once across repeated use', () => {
    const { state, hut } = setup();
    state.resources.wood = 10;
    hut.interact();
    hut.interact();
    hut.interact();
    expect(state.resources.wood).toBe(6);
    expect(state.resources.coins).toBe(ECONOMY.startCoins - 2);
  });
});

describe('on the real world', () => {
  function realWorld() {
    const world = buildWorldData();
    const collision = new CollisionWorld(world.colliders);
    const { minX, maxX, minZ, maxZ } = WORLD.bounds;
    const inset = NPC.navClearance;
    const nav = new NavGrid(
      { minX: minX + inset, maxX: maxX - inset, minZ: minZ + inset, maxZ: maxZ - inset },
      NPC.navCellSize,
      (x, z) => collision.isBlocked(x, z, NPC.navClearance),
    );
    nav.setMainRegion(WORLD.campfire.x, WORLD.campfire.z + 4);
    const sites = new VillageSites(nav, world);
    const pathfinder = new Pathfinder(nav);
    const npcs = NPC.villagers.map((v, i) => {
      sites.nearestPoint(v.spawn[0], v.spawn[1]);
      return createNpc(v, sites.pointX, world.surfaceHeight(sites.pointX, sites.pointZ), sites.pointZ, WORLD.seed, i);
    });
    const state = createGameState(0, npcs);
    state.player.x = state.player.prevX = -70;
    state.player.z = state.player.prevZ = 5;
    const construction = new ConstructionSystem(state, collision, nav);
    const npcSystem = new NpcSystem(state, sites, pathfinder, { collision, surfaceHeight: world.surfaceHeight });
    return { world, collision, nav, sites, pathfinder, npcs, state, construction, npcSystem };
  }

  it('starts with every site on free, reachable, walkable ground', () => {
    const { collision, nav, sites, pathfinder } = realWorld();
    const outX = new Float32Array(NPC.maxWaypoints);
    const outZ = new Float32Array(NPC.maxWaypoints);
    BUILDINGS.forEach((b, i) => {
      expect(collision.isBlocked(b.x, b.z, 0.3), b.id).toBe(false);
      expect(nav.isWalkable(nav.cellAt(b.x, b.z))).toBe(true);
      const stand = sites.buildSites[i];
      expect(pathfinder.find(WORLD.campfire.x, WORLD.campfire.z + 4, stand.standX, stand.standZ, outX, outZ)).toBeGreaterThan(0);
      expect(Math.hypot(stand.standX - b.stand[0], stand.standZ - b.stand[1])).toBeLessThan(1.5);
    });
  });

  it('has no scatter trees or colliders inside a footprint', () => {
    const { world } = realWorld();
    for (const b of BUILDINGS) {
      for (const c of world.colliders) {
        if (c.kind === 'circle' && Math.abs(c.x - b.x) < b.halfX && Math.abs(c.z - b.z) < b.halfZ) {
          throw new Error(`${b.id} overlaps a collider at ${c.x},${c.z}`);
        }
      }
    }
  });

  it('a villager physically walks over, builds all three, and the world updates', () => {
    const { collision, nav, sites, pathfinder, npcs, state, construction, npcSystem } = realWorld();
    state.time.dayTime = 0.35;
    state.time.paused = true;
    state.resources.wood = BUILDINGS.reduce((sum, b) => sum + b.cost.wood, 0);
    state.resources.woodCapacity = 50;
    state.resources.coins = 20;
    const free = npcs.filter((n) => n.job === 'villager').length;
    expect(free).toBeGreaterThanOrEqual(3);
    state.construction.forEach((s, i) => fundSite(s, BUILDINGS[i].cost, state.resources));

    const dt = 1 / 60;
    let distinctWorkersAtOnce = 0;
    let everWorkingAway = false;
    for (let step = 0; step < 60 * 240 && !state.construction.every((s) => s.status === 'completed'); step++) {
      construction.update(dt);
      npcSystem.update(dt);
      const active = state.construction.filter((s) => s.workerId !== null).map((s) => s.workerId);
      distinctWorkersAtOnce = Math.max(distinctWorkersAtOnce, new Set(active).size);
      expect(new Set(active).size).toBe(active.length);
      state.construction.forEach((s, i) => {
        if (s.status !== 'building' || s.workerId === null) return;
        const w = npcs.find((n) => n.id === s.workerId)!;
        if (w.task === 'build' && Math.hypot(w.x - sites.buildSites[i].standX, w.z - sites.buildSites[i].standZ) > NPC.closeEnough + 0.6) everWorkingAway = true;
      });
    }
    // A few more steps for anything still waiting to turn solid.
    for (let step = 0; step < 120; step++) { construction.update(dt); npcSystem.update(dt); }

    expect(state.construction.map((s) => s.status)).toEqual(BUILDINGS.map(() => 'completed'));
    expect(everWorkingAway).toBe(false);
    expect(distinctWorkersAtOnce).toBeGreaterThan(1);
    expect(state.resources.woodCapacity).toBeGreaterThan(50);
    expect(state.village.maxWoodcutters).toBe(2);
    expect(state.village.watchPosts).toBe(1);
    expect(npcs.every((n) => n.assignedSite === -1)).toBe(true);

    // Collision and navigation now treat all three as solid.
    expect(state.construction.every((s) => s.solid)).toBe(true);
    const outX = new Float32Array(NPC.maxWaypoints);
    const outZ = new Float32Array(NPC.maxWaypoints);
    BUILDINGS.forEach((b, i) => {
      expect(collision.isBlocked(b.x, b.z, 0.1)).toBe(true);
      expect(nav.isWalkable(nav.cellAt(b.x, b.z))).toBe(false);
      expect(pathfinder.find(WORLD.campfire.x, WORLD.campfire.z + 4, b.x, b.z, outX, outZ)).toBe(-1);
      // The spot used for the work is still usable afterward.
      expect(nav.isReachable(nav.cellAt(sites.buildSites[i].standX, sites.buildSites[i].standZ)), b.id).toBe(true);
    });
    // And nothing else in the village was cut off.
    for (const door of sites.doors) {
      expect(pathfinder.find(WORLD.campfire.x, WORLD.campfire.z + 4, door.x, door.z, outX, outZ)).toBeGreaterThan(0);
    }
    expect(pathfinder.find(WORLD.campfire.x, WORLD.campfire.z + 4, sites.storageStandX, sites.storageStandZ, outX, outZ)).toBeGreaterThan(0);
    expect(pathfinder.find(WORLD.campfire.x, WORLD.campfire.z + 4, 60, 5, outX, outZ)).toBeGreaterThan(0);
    for (const site of sites.trees.slice(0, NPC.treeChoiceCount)) {
      expect(nav.isReachable(nav.cellAt(site.standX, site.standZ))).toBe(true);
    }
  }, 60000);

  it('waits for the player to step off before a structure turns solid', () => {
    const { collision, state, construction, npcs } = realWorld();
    const index = BUILDINGS.indexOf(SHED);
    const site = state.construction[index];
    site.status = 'funded';
    state.player.x = SHED.x;
    state.player.z = SHED.z;
    const worker = npcs.find((n) => n.job === 'villager')!;
    site.workerId = worker.id;
    worker.assignedSite = index;
    worker.task = 'build';
    construction.update(1 / 60);
    expect(site.status).toBe('building');
    expect(site.solid).toBe(false);
    expect(collision.isBlocked(SHED.x, SHED.z, 0.1)).toBe(false);
    state.player.x = -70;
    construction.update(1 / 60);
    expect(site.solid).toBe(true);
    expect(collision.isBlocked(SHED.x, SHED.z, 0.1)).toBe(true);
  });

  it('repaths villagers whose route the new building cuts through', () => {
    const { state, construction, npcs } = realWorld();
    const walker = npcs[0];
    walker.x = -70;
    walker.state = 'walk';
    walker.task = 'loiter';
    walker.pathStatus = 'ready';
    const index = BUILDINGS.indexOf(SHED);
    const builder = npcs.find((n) => n !== walker && n.job === 'villager')!;
    state.construction[index].status = 'funded';
    state.construction[index].workerId = builder.id;
    builder.assignedSite = index;
    builder.task = 'build';
    construction.update(1 / 60);
    expect(state.construction[index].solid).toBe(true);
    expect(walker.pathStatus).toBe('pending');
  });
});
