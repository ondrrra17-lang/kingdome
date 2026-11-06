import { describe, expect, it } from 'vitest';
import { BUILDINGS, ECONOMY, EXPLORATION, NPC, SAVE, WORLD } from '../../config';
import { createGameState, type GameState } from '../../core/GameState';
import { createNpc } from '../../entities/Npc';
import { buildWorldData } from '../../world/WorldData';
import { CollisionWorld } from '../CollisionWorld';
import { ConstructionSystem } from '../construction/ConstructionSystem';
import { DailyIncome } from '../DailyIncome';
import { openTreasure } from '../exploration/ExplorationState';
import { NavGrid } from '../navigation/NavGrid';
import { Pathfinder } from '../navigation/Pathfinder';
import { NpcSystem } from '../npc/NpcSystem';
import { VillageSites } from '../npc/VillageSites';
import { inviteTraveler, recruitWoodcutter, villagerCount, woodcutterCount } from '../Recruitment';
import { applySave, createSave, readSave, SAVE_VERSION, type SaveFile, type SaveWorld } from './SaveData';
import { SaveStore, type SaveBackend } from './SaveStore';
import { SaveSystem } from './SaveSystem';

const world = buildWorldData();

/** Colliders are added as buildings go up, so each game needs its own collision world. */
function freshWorld(): { collision: CollisionWorld; nav: NavGrid; sites: VillageSites; saveWorld: SaveWorld } {
  const collision = new CollisionWorld([...world.colliders]);
  const inset = NPC.navClearance;
  const { minX, maxX, minZ, maxZ } = WORLD.bounds;
  const nav = new NavGrid(
    { minX: minX + inset, maxX: maxX - inset, minZ: minZ + inset, maxZ: maxZ - inset },
    NPC.navCellSize,
    (x, z) => collision.isBlocked(x, z, NPC.navClearance),
  );
  nav.setMainRegion(-16, 1);
  const sites = new VillageSites(nav, world);
  const saveWorld: SaveWorld = {
    isPlayerPosition: (x, z) => !collision.isBlocked(x, z, 0.2),
    nearestWalkable: (x, z) => (sites.nearestPoint(x, z) ? { x: sites.pointX, z: sites.pointZ } : null),
    surfaceHeight: world.surfaceHeight,
  };
  return { collision, nav, sites, saveWorld };
}

const shared = freshWorld();

function freshState(sites: VillageSites = shared.sites): GameState {
  const definitions = [...NPC.villagers, ...NPC.travelers];
  const npcs = definitions.map((def, i) => {
    sites.nearestPoint(def.spawn[0], def.spawn[1]);
    return createNpc(def, sites.pointX, world.surfaceHeight(sites.pointX, sites.pointZ), sites.pointZ, WORLD.seed, i);
  });
  return createGameState(0, npcs);
}

/** Saves to text, reads it back and applies it to a new game, as reloading the page would. */
function reload(state: GameState, target = freshState(), saveWorld = shared.saveWorld): GameState {
  const read = readSave(JSON.stringify(createSave(state, 1000)));
  if (read.status !== 'ok') throw new Error(read.status);
  expect(read.repairs).toEqual([]);
  applySave(target, read.save, saveWorld);
  return target;
}

const find = (state: GameState, id: string) => state.npcs.find((n) => n.id === id)!;

function memoryBackend(): SaveBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('saving and loading', () => {
  it('holds only plain data that survives JSON unchanged', () => {
    const save = createSave(freshState(), 5);
    expect(JSON.parse(JSON.stringify(save))).toEqual(save);
    expect(save.version).toBe(SAVE_VERSION);
    expect(JSON.stringify(save).length).toBeLessThan(10_000);
  });

  it('brings back the player, the clock and the economy', () => {
    const state = freshState();
    state.player.x = -30;
    state.player.z = 2;
    state.player.facing = 1.25;
    state.time.dayTime = 0.62;
    state.time.day = 4;
    state.resources.coins = 17;
    state.resources.wood = 8;
    const loaded = reload(state);
    expect([loaded.player.x, loaded.player.z, loaded.player.facing]).toEqual([-30, 2, 1.25]);
    expect([loaded.player.prevX, loaded.player.prevZ]).toEqual([-30, 2]);
    expect([loaded.time.dayTime, loaded.time.day]).toEqual([0.62, 4]);
    expect([loaded.resources.coins, loaded.resources.wood]).toEqual([17, 8]);
  });

  it('does not pay a chest twice after loading', () => {
    const state = freshState();
    const def = EXPLORATION.treasures[4];
    openTreasure(state.exploration.treasures[4], def, state.resources);
    const coins = state.resources.coins;
    const loaded = reload(state);
    expect(loaded.resources.coins).toBe(coins);
    expect(loaded.exploration.treasures[4].opened).toBe(true);
    expect(openTreasure(loaded.exploration.treasures[4], def, loaded.resources)).toBe(0);
    expect(loaded.resources.coins).toBe(coins);
  });

  it('keeps who has been recruited, without duplicates or paying again', () => {
    const state = freshState();
    recruitWoodcutter(find(state, 'bren'), state.village, state.npcs);
    find(state, 'bren').woodDelivered = 9;
    inviteTraveler(find(state, 'wren'), state.resources);
    const coins = state.resources.coins;

    const loaded = reload(state);
    expect(loaded.npcs).toHaveLength(NPC.villagers.length + NPC.travelers.length);
    expect(new Set(loaded.npcs.map((n) => n.id)).size).toBe(loaded.npcs.length);
    expect(find(loaded, 'bren').job).toBe('woodcutter');
    expect(find(loaded, 'bren').woodDelivered).toBe(9);
    expect(find(loaded, 'wren').travelPhase).toBe('journey');
    expect(find(loaded, 'wren').job).toBe('traveler');
    expect(find(loaded, 'tobin').travelPhase).toBe('waiting');
    expect(loaded.resources.coins).toBe(coins);
    expect(villagerCount(loaded.npcs)).toBe(NPC.villagers.length);
    expect(inviteTraveler(find(loaded, 'wren'), loaded.resources)).toBe('not-available');
    expect(loaded.resources.coins).toBe(coins);
  });

  it('works out capacities from what is built, whatever the save says', () => {
    const state = freshState();
    const shed = BUILDINGS.findIndex((b) => b.id === 'shed');
    const hut = BUILDINGS.findIndex((b) => b.id === 'hut');
    for (const index of [shed, hut]) {
      state.construction[index].status = 'completed';
      state.construction[index].progress = 1;
    }
    const save = createSave(state, 0);
    save.economy.woodCapacity = 9999;
    save.economy.wood = 9999;
    save.village.maxWoodcutters = 9999;
    const target = freshState();
    applySave(target, save, shared.saveWorld);
    expect(target.resources.woodCapacity).toBe(ECONOMY.baseWoodCapacity + 15);
    expect(target.resources.wood).toBe(target.resources.woodCapacity);
    expect(target.village.maxWoodcutters).toBe(ECONOMY.baseMaxWoodcutters + 1);
  });

  it('cannot be used to get more woodcutters than the limit', () => {
    const save = createSave(freshState(), 0);
    for (const npc of save.npcs) if (npc.job === 'villager') npc.job = 'woodcutter';
    const target = freshState();
    applySave(target, save, shared.saveWorld);
    expect(woodcutterCount(target.npcs)).toBe(ECONOMY.baseMaxWoodcutters);
  });

  it('never lets a job be given to someone who cannot have it', () => {
    const save = createSave(freshState(), 0);
    const alda = save.npcs.find((n) => n.id === 'alda')!;
    alda.job = 'woodcutter';
    const bren = save.npcs.find((n) => n.id === 'bren')!;
    bren.job = 'traveler';
    bren.travelPhase = 'journey';
    const target = freshState();
    applySave(target, save, shared.saveWorld);
    expect(find(target, 'alda').job).toBe('gatherer');
    expect(find(target, 'bren').job).toBe('villager');
    expect(find(target, 'bren').travelPhase).toBe('settled');
  });

  it('gives a site back to its builder, or else back to waiting for one, keeping its progress', () => {
    const state = freshState();
    const site = state.construction[0];
    site.status = 'building';
    site.progress = 0.4;
    site.workerId = 'cora';
    find(state, 'cora').assignedSite = 0;
    let loaded = reload(state);
    expect(loaded.construction[0].workerId).toBe('cora');
    expect(find(loaded, 'cora').assignedSite).toBe(0);
    expect(loaded.construction[0].progress).toBeCloseTo(0.4);

    const save = createSave(state, 0);
    save.construction[0].workerId = 'somebody-long-gone';
    loaded = freshState();
    applySave(loaded, save, shared.saveWorld);
    expect(loaded.construction[0].status).toBe('funded');
    expect(loaded.construction[0].workerId).toBeNull();
    expect(loaded.construction[0].progress).toBeCloseTo(0.4);
    expect(loaded.npcs.every((n) => n.assignedSite < 0)).toBe(true);
  });

  it('does not let one villager hold two sites', () => {
    const save = createSave(freshState(), 0);
    for (const site of save.construction.slice(0, 2)) {
      site.status = 'building';
      site.workerId = 'cora';
    }
    const loaded = freshState();
    applySave(loaded, save, shared.saveWorld);
    expect(loaded.construction[0].workerId).toBe('cora');
    expect(loaded.construction[1].workerId).toBeNull();
  });

  it('does not pay the daily income again on loading', () => {
    const state = freshState();
    state.time.day = 3;
    const loaded = reload(state);
    const coins = loaded.resources.coins;
    const income = new DailyIncome(loaded);
    income.update();
    expect(loaded.resources.coins).toBe(coins);
    loaded.time.day = 4;
    income.update();
    expect(loaded.resources.coins).toBe(coins + ECONOMY.dailyCoins);
  });

  it('keeps a position out of the forest and off solid ground, and finds villagers a place to stand', () => {
    const save = createSave(freshState(), 0);
    save.player.x = WORLD.houses[0].x;
    save.player.z = WORLD.houses[0].z;
    const npc = save.npcs.find((n) => n.id === 'bren')!;
    npc.x = WORLD.houses[0].x;
    npc.z = WORLD.houses[0].z;
    const target = freshState();
    const startX = target.player.x;
    applySave(target, save, shared.saveWorld);
    expect(target.player.x).toBe(startX);
    const bren = find(target, 'bren');
    expect(shared.collision.isBlocked(bren.x, bren.z, NPC.radius)).toBe(false);
  });
});

describe('reading a damaged save', () => {
  const good = (): SaveFile => createSave(freshState(), 7);

  it('refuses what is not a save at all', () => {
    expect(readSave('not json {').status).toBe('unreadable');
    expect(readSave('[1,2,3]').status).toBe('unreadable');
    expect(readSave('{"coins":3}').status).toBe('unreadable');
    expect(readSave('null').status).toBe('unreadable');
  });

  it('refuses a save from a newer version rather than guessing', () => {
    expect(readSave(JSON.stringify({ ...good(), version: SAVE_VERSION + 1 }))).toEqual({ status: 'newer', version: SAVE_VERSION + 1 });
  });

  it('repairs damaged sections with starting values, and says so', () => {
    const save = good() as unknown as Record<string, unknown>;
    save.economy = { coins: -40, wood: 'lots' };
    delete save.exploration;
    save.npcs = [{ id: 'bren' }, 12, null];
    save.construction = 'gone';
    save.time = { dayTime: 55, day: -2 };
    const read = readSave(JSON.stringify(save));
    if (read.status !== 'ok') throw new Error(read.status);
    expect(read.repairs.length).toBeGreaterThan(3);
    expect(read.save.economy.coins).toBe(ECONOMY.startCoins);
    expect(read.save.economy.wood).toBe(0);
    expect(read.save.exploration.openedTreasures).toEqual([]);
    expect(read.save.npcs).toEqual([]);
    expect(read.save.construction).toEqual([]);
    expect(read.save.time.day).toBe(1);

    const target = freshState();
    const before = target.time.dayTime;
    applySave(target, read.save, shared.saveWorld);
    expect(target.time.dayTime).toBe(before);
    expect(target.npcs).toHaveLength(NPC.villagers.length + NPC.travelers.length);
    expect(target.player.x).toBeTypeOf('number');
  });

  it('ignores ids it does not know, and survives values that are not numbers', () => {
    const save = good();
    save.exploration.openedTreasures.push('a-chest-since-removed');
    save.npcs.push({ ...save.npcs[0], id: 'a-stranger' });
    (save.player as unknown as Record<string, unknown>).x = 'here';
    const read = readSave(JSON.stringify(save));
    if (read.status !== 'ok') throw new Error(read.status);
    const target = freshState();
    applySave(target, read.save, shared.saveWorld);
    expect(target.npcs.find((n) => n.id === 'a-stranger')).toBeUndefined();
    expect(Number.isFinite(target.player.x)).toBe(true);
  });
});

describe('the save store', () => {
  it('reports no save, then returns what was written', () => {
    const store = new SaveStore(memoryBackend());
    expect(store.load().status).toBe('none');
    expect(store.write(createSave(freshState(), 1))).toEqual({ ok: true });
    expect(store.load().status).toBe('ok');
  });

  it('falls back to the previous save when the latest is damaged, and keeps the damaged one', () => {
    const backend = memoryBackend();
    const store = new SaveStore(backend);
    const first = createSave(freshState(), 1);
    first.economy.coins = 11;
    store.write(first);
    const second = createSave(freshState(), 2);
    second.economy.coins = 22;
    store.write(second);
    backend.setItem('emberwick-vale:save', '{"version":1,"truncat');

    const loaded = store.load();
    if (loaded.status !== 'ok') throw new Error(loaded.status);
    expect(loaded.fromBackup).toBe(true);
    expect(loaded.save.economy.coins).toBe(11);
    expect(backend.data.get('emberwick-vale:save:damaged')).toContain('truncat');
  });

  it('never lets a damaged save replace the backup', () => {
    const backend = memoryBackend();
    const store = new SaveStore(backend);
    const good = createSave(freshState(), 1);
    good.economy.coins = 11;
    store.write(good);
    store.write(createSave(freshState(), 2));
    const backup = backend.data.get('emberwick-vale:save:previous');
    backend.setItem('emberwick-vale:save', 'garbage');
    store.write(createSave(freshState(), 3));
    expect(backend.data.get('emberwick-vale:save:previous')).toBe(backup);
  });

  it('reports a failed write rather than throwing, and keeps the last good save', () => {
    const backend = memoryBackend();
    const store = new SaveStore(backend);
    store.write(createSave(freshState(), 1));
    backend.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const result = store.write(createSave(freshState(), 2));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/full/);
    expect(store.load().status).toBe('ok');
  });

  it('copes with storage being blocked altogether', () => {
    const store = new SaveStore(null);
    expect(store.load().status).toBe('none');
    expect(store.write(createSave(freshState(), 1)).ok).toBe(false);
    expect(() => store.clear()).not.toThrow();
  });

  it('does not touch a save from a newer version until asked to', () => {
    const backend = memoryBackend();
    const store = new SaveStore(backend);
    const text = JSON.stringify({ version: SAVE_VERSION + 1 });
    backend.setItem('emberwick-vale:save', text);
    expect(store.load().status).toBe('newer');
    expect(backend.data.get('emberwick-vale:save')).toBe(text);
  });
});

describe('when the game saves by itself', () => {
  function setup(): { state: GameState; system: SaveSystem; backend: ReturnType<typeof memoryBackend>; run: () => void } {
    const backend = memoryBackend();
    const state = freshState();
    const jobs: (() => void)[] = [];
    const system = new SaveSystem(state, new SaveStore(backend), (job) => jobs.push(job), () => 123);
    return { state, system, backend, run: () => jobs.splice(0).forEach((job) => job()) };
  }

  it('saves on a timer, outside the frame, and not before', () => {
    const { system, backend, run } = setup();
    for (let t = 0; t < SAVE.autoSaveSeconds - 2; t++) system.update(1);
    run();
    expect(backend.data.size).toBe(0);
    for (let t = 0; t < 3; t++) system.update(1);
    expect(backend.data.size, 'still waiting for a free moment').toBe(0);
    run();
    expect(backend.data.size).toBe(1);
  });

  it('saves soon after something significant happens', () => {
    const { state, system, backend, run } = setup();
    for (let t = 0; t < SAVE.minSecondsBetweenSaves + 1; t++) system.update(1);
    run();
    expect(backend.data.size, 'nothing has happened yet').toBe(0);
    openTreasure(state.exploration.treasures[0], EXPLORATION.treasures[0], state.resources);
    system.update(1);
    run();
    expect(backend.data.size).toBe(1);
  });

  it('does not save more often than the minimum, however busy it gets', () => {
    const { state, system, backend, run } = setup();
    let writes = 0;
    const set = backend.setItem;
    backend.setItem = (key, value) => {
      if (key === 'emberwick-vale:save') writes++;
      set(key, value);
    };
    for (let t = 0; t < 20; t++) {
      state.resources.coins++;
      system.update(1);
      run();
    }
    expect(writes).toBeLessThanOrEqual(Math.ceil(20 / SAVE.minSecondsBetweenSaves));
  });

  it('never saves again once stopped, so a confirmed New Game stays erased', () => {
    const { system, backend } = setup();
    system.stop();
    system.saveNow('auto');
    for (let t = 0; t < 100; t++) system.update(1);
    expect(backend.data.size).toBe(0);
  });

  it('takes under a millisecond on average', () => {
    const { system } = setup();
    const start = performance.now();
    for (let i = 0; i < 200; i++) system.saveNow('auto');
    expect((performance.now() - start) / 200).toBeLessThan(1);
  });
});

describe('villagers after loading, on the real world', () => {
  const dt = 1 / 60;

  function play(state: GameState, parts: ReturnType<typeof freshWorld>): { step: (seconds: number, until?: () => boolean) => void } {
    const npcSystem = new NpcSystem(state, parts.sites, new Pathfinder(parts.nav), { collision: parts.collision, surfaceHeight: world.surfaceHeight });
    const construction = new ConstructionSystem(state, parts.collision, parts.nav);
    return {
      step(seconds, until) {
        for (let i = 0; i < seconds * 60 && !until?.(); i++) {
          construction.update(dt);
          npcSystem.update(dt);
        }
      },
    };
  }

  it('resumes a traveler\'s journey from where it stopped, over the bridge', () => {
    const before = freshWorld();
    const state = freshState(before.sites);
    state.time.paused = true;
    const wren = find(state, 'wren');
    state.player.x = wren.x;
    state.player.z = wren.z;
    inviteTraveler(wren, state.resources);
    play(state, before).step(12);
    const stoppedAt = wren.z;
    expect(stoppedAt, 'has walked some way').toBeGreaterThan(-35);

    const after = freshWorld();
    const loaded = reload(state, freshState(after.sites), after.saveWorld);
    const resumed = find(loaded, 'wren');
    expect(Math.hypot(resumed.x - wren.x, resumed.z - wren.z), 'starts where it stopped').toBeLessThan(1.5);
    loaded.player.x = -16;
    loaded.player.z = 1;
    play(loaded, after).step(120, () => resumed.travelPhase === 'settled');
    expect(resumed.travelPhase).toBe('settled');
    expect(Math.hypot(resumed.x - WORLD.campfire.x, resumed.z - WORLD.campfire.z)).toBeLessThan(NPC.fireRingMax + 2);
  }, 30000);

  it('keeps a woodcutter delivering, counting wood once', () => {
    const parts = freshWorld();
    const state = freshState(parts.sites);
    state.time.dayTime = 0.4;
    const bren = find(state, 'bren');
    recruitWoodcutter(bren, state.village, state.npcs);
    bren.carrying = true;
    const loaded = reload(state, freshState(parts.sites), parts.saveWorld);
    const resumed = find(loaded, 'bren');
    expect(resumed.carrying).toBe(true);
    play(loaded, parts).step(60, () => resumed.woodDelivered > 0);
    expect(resumed.woodDelivered).toBe(ECONOMY.woodPerDelivery);
    expect(loaded.resources.wood).toBe(ECONOMY.woodPerDelivery);
    expect(resumed.carrying).toBe(false);
  }, 30000);

  it('finishes a half-built building without charging again, and it becomes solid', () => {
    const parts = freshWorld();
    const state = freshState(parts.sites);
    state.time.dayTime = 0.4;
    state.player.x = -70;
    state.player.z = 5;
    const site = state.construction[0];
    site.status = 'building';
    site.progress = 0.8;
    site.workerId = 'cora';
    find(state, 'cora').assignedSite = 0;
    const coins = state.resources.coins;

    const loaded = reload(state, freshState(parts.sites), parts.saveWorld);
    play(loaded, parts).step(60, () => loaded.construction[0].status === 'completed');
    expect(loaded.construction[0].status).toBe('completed');
    expect(loaded.construction[0].solid).toBe(true);
    expect(loaded.resources.coins).toBe(coins);
    expect(loaded.village.maxWoodcutters).toBe(ECONOMY.baseMaxWoodcutters + 1);
    expect(find(loaded, 'cora').assignedSite).toBe(-1);
  }, 30000);

  it('makes a finished building solid once after loading, and for navigation too', () => {
    const parts = freshWorld();
    const state = freshState(parts.sites);
    const def = BUILDINGS[0];
    state.construction[0].status = 'completed';
    state.construction[0].progress = 1;
    state.player.x = -70;
    state.player.z = 5;
    const loaded = reload(state, freshState(parts.sites), parts.saveWorld);
    const colliders = parts.collision.colliders.length;
    expect(parts.nav.isWalkable(parts.nav.cellAt(def.x, def.z))).toBe(true);
    play(loaded, parts).step(1);
    expect(loaded.construction[0].solid).toBe(true);
    expect(parts.collision.colliders.length).toBe(colliders + 1);
    expect(parts.nav.isWalkable(parts.nav.cellAt(def.x, def.z))).toBe(false);
  }, 30000);

  it('sends villagers who were indoors back out in the morning', () => {
    const parts = freshWorld();
    const state = freshState(parts.sites);
    const bren = find(state, 'bren');
    bren.indoors = true;
    state.time.dayTime = 0.95;
    const loaded = reload(state, freshState(parts.sites), parts.saveWorld);
    const resumed = find(loaded, 'bren');
    expect(resumed.indoors).toBe(true);
    const game = play(loaded, parts);
    game.step(2);
    expect(resumed.indoors, 'stays in at night').toBe(true);
    loaded.time.dayTime = 0.4;
    game.step(2);
    expect(resumed.indoors).toBe(false);
  }, 30000);
});
