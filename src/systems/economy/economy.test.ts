import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ATMOSPHERE, BUILDINGS, ECONOMY, EXPLORATION, KINGDOM, NPC, SIM, WORLD } from '../../config';
import { advanceClock, createGameState } from '../../core/GameState';
import { createNpc } from '../../entities/Npc';
import { buildWorldData } from '../../world/WorldData';
import { CollisionWorld } from '../CollisionWorld';
import { ConstructionSystem } from '../construction/ConstructionSystem';
import { fundSite } from '../construction/ConstructionState';
import { DailyIncome } from '../DailyIncome';
import { NavGrid } from '../navigation/NavGrid';
import { Pathfinder } from '../navigation/Pathfinder';
import { NpcSystem } from '../npc/NpcSystem';
import { VillageSites } from '../npc/VillageSites';
import { exchange, trySpendCoins } from '../Resources';
import { applySave, createSave, readSave, SAVE_VERSION } from '../save/SaveData';
import { dailyFood, FoodSystem, workEfficiency } from './FoodSystem';
import { MerchantSystem, trade } from './MerchantSystem';
import { assignProfession } from './Professions';
import { deliverProduce, ProductionSystem } from './ProductionSystem';
import { collectSupplies, hearRumor, villageRequest } from './WorldEvents';

const world = buildWorldData();
function game() {
  const collision = new CollisionWorld([...world.colliders]);
  const b = WORLD.bounds, inset = NPC.navClearance;
  const nav = new NavGrid({ minX: b.minX + inset, maxX: b.maxX - inset, minZ: b.minZ + inset, maxZ: b.maxZ - inset }, NPC.navCellSize, (x, z) => collision.isBlocked(x, z, inset));
  nav.setMainRegion(-16, 1);
  const sites = new VillageSites(nav, world);
  const npcs = [...NPC.villagers, ...NPC.travelers].map((d, i) => {
    sites.nearestPoint(d.spawn[0], d.spawn[1]);
    return createNpc(d, sites.pointX, world.surfaceHeight(sites.pointX, sites.pointZ), sites.pointZ, WORLD.seed, i);
  });
  const state = createGameState(0, npcs);
  const pathfinder = new Pathfinder(nav);
  const merchant = new MerchantSystem(state, sites, world.surfaceHeight);
  const ai = new NpcSystem(state, sites, pathfinder, { collision, surfaceHeight: world.surfaceHeight }, merchant);
  const production = new ProductionSystem(state), food = new FoodSystem(state), income = new DailyIncome(state);
  const construction = new ConstructionSystem(state, collision, nav);
  const saveWorld = { isPlayerPosition: (x: number, z: number) => !collision.isBlocked(x, z, 0.2), nearestWalkable: (x: number, z: number) => sites.nearestPoint(x, z) ? { x: sites.pointX, z: sites.pointZ } : null, surfaceHeight: world.surfaceHeight };
  const worker = state.npcs.find((n) => n.id === 'bren')!;
  const complete = (id: string) => {
    const site = state.construction.find((s) => s.id === id)!;
    site.status = 'completed'; site.progress = 1; construction.update(0);
  };
  const step = (seconds: number, clock = false) => {
    const dt = SIM.fixedDt;
    for (let i = 0; i < Math.ceil(seconds / dt); i++) {
      if (clock) advanceClock(state.time, dt / ATMOSPHERE.dayLengthSeconds);
      income.update(); food.update(); construction.update(dt); production.update(dt); merchant.update(); ai.update(dt);
    }
  };
  return { state, sites, collision, nav, worker, complete, step, food, production, merchant, saveWorld, pathfinder };
}

describe('validated economy commands', () => {
  it('rejects invalid prices and insufficient transactions without partial changes', () => {
    const state = createGameState(0);
    for (const amount of [-2, NaN, Infinity, 0.5]) expect(trySpendCoins(state.resources, amount)).toBe(false);
    const before = { ...state.resources };
    expect(exchange(state.resources, { coins: 6 }, { food: 20 })).toBe(false);
    expect(exchange(state.resources, { food: -1 }, { coins: 20 })).toBe(false);
    expect(state.resources).toEqual(before);
  });
  it('keeps trade prices, costs and balances exact', () => {
    const s = createGameState(0);
    s.resources.wood = 10; s.resources.furs = 2;
    expect(trade(s, 'sell-wood')).toContain('not trading');
    s.kingdom.merchant.phase = 'visiting';
    expect(trade(s, 'sell-wood')).toContain('completed');
    expect([s.resources.wood, s.resources.coins]).toEqual([5, 7]);
    trade(s, 'sell-furs'); trade(s, 'buy-food');
    expect([s.resources.furs, s.resources.coins, s.resources.food]).toEqual([0, 9, 12]);
    expect(trade(s, 'sell-furs')).toContain('Not enough');
    expect(trade(s, 'unknown')).toContain('unavailable');
    expect(s.resources.coins).toBe(9);
  });
  it('charges the new construction costs once', () => {
    const s = createGameState(0); s.resources.wood = 10;
    for (const [id, cost] of [['farm', { wood: 5, coins: 2 }], ['lodge', { wood: 6, coins: 3 }]] as const) {
      const def = BUILDINGS.find((b) => b.id === id)!;
      expect(def.cost).toEqual(cost);
      const site = s.construction.find((b) => b.id === id)!;
      s.resources.wood = 10; s.resources.coins = 5;
      expect(fundSite(site, def.cost, s.resources)).toBe('funded');
      expect(fundSite(site, def.cost, s.resources)).toBe('already-funded');
      expect(s.resources.wood).toBe(10 - cost.wood);
    }
  });
});

describe('daily food and recoverable shortages', () => {
  it('keeps both daily income and food consumption visible at midnight', () => {
    const g = game();
    g.state.time.day = 2; g.step(1);
    expect(g.state.notice.text).toContain('tithes');
    expect(g.state.notice.text).toContain('used 2 food');
  });
  it('starts with at least three days of food and charges only completed days', () => {
    const g = game();
    expect(g.state.resources.food).toBeGreaterThanOrEqual(dailyFood(g.state) * 3);
    g.food.update(); expect(g.state.resources.food).toBe(ECONOMY.startFood);
    advanceClock(g.state.time, 3); g.food.update();
    expect(g.state.resources.food).toBe(ECONOMY.startFood - 6);
    g.food.update(); expect(g.state.resources.food).toBe(3);
    advanceClock(g.state.time, -2); g.food.update(); advanceClock(g.state.time, 2); g.food.update();
    expect(g.state.resources.food).toBe(3);
    advanceClock(g.state.time, 100); g.food.update(); expect(g.state.resources.food).toBe(0);
    expect(workEfficiency(g.state)).toBe(ECONOMY.shortageEfficiency);
  });
  it('uses the settled population and rounds consumption upward', () => {
    const g = game(); expect(dailyFood(g.state)).toBe(2);
    for (const n of g.state.npcs) { n.travelPhase = 'settled'; if (n.job === 'traveler') n.job = 'villager'; }
    expect(dailyFood(g.state)).toBe(3);
  });
});

describe('professions and physically delivered production', () => {
  it('requires a completed workplace, free capacity and no conflicting assignment', () => {
    const g = game();
    expect(assignProfession(g.state, g.worker, 'farmer')).toContain('Build');
    g.complete('farm');
    expect(assignProfession(g.state, g.worker, 'farmer')).toBeNull();
    const other = g.state.npcs.find((n) => n.id === 'cora')!;
    expect(assignProfession(g.state, other, 'farmer')).toContain('free');
    other.assignedSite = 0;
    expect(assignProfession(g.state, other, 'woodcutter')).toContain('construction');
    expect(assignProfession(g.state, g.state.npcs[0], 'farmer')).toContain('cannot');
    expect(g.state.resources.coins).toBe(ECONOMY.startCoins);
  });
  it('grows crops, harvests off-screen and physically carries food to storage', () => {
    const g = game(); g.complete('farm'); g.state.time.dayTime = 0.35;
    g.state.player.x = -90; assignProfession(g.state, g.worker, 'farmer');
    let sawWork = false, sawCargo = false, sawMature = false;
    const initial = g.state.resources.food;
    for (let i = 0; i < 160 && g.state.resources.food === initial; i++) {
      g.step(1);
      sawWork ||= g.worker.task === 'produce'; sawCargo ||= g.worker.carrying;
      sawMature ||= g.state.kingdom.field.stage === 'mature';
      if (g.worker.task === 'produce') expect(Math.hypot(g.worker.x - KINGDOM.farm.workplace[0], g.worker.z - KINGDOM.farm.workplace[1])).toBeLessThan(1.5);
    }
    expect([sawWork, sawCargo, sawMature]).toEqual([true, true, true]);
    expect(g.state.resources.food).toBe(initial + KINGDOM.farm.food);
    expect(g.worker.cargoFood).toBe(0);
    deliverProduce(g.state, g.worker); expect(g.state.resources.food).toBe(initial + KINGDOM.farm.food);
  });
  it('hunts in both existing zones, respects the river route and produces rarer furs', () => {
    const g = game(); g.complete('lodge'); g.state.time.dayTime = 0.4;
    assignProfession(g.state, g.worker, 'hunter');
    const initial = g.state.resources.food;
    let sawEast = false;
    for (let second = 0; second < 900 && g.worker.huntCycles < 3; second++) {
      g.step(1); sawEast ||= g.worker.x > 60;
      expect(g.collision.isBlocked(g.worker.x, g.worker.z, NPC.radius * 0.8)).toBe(false);
      if (g.worker.x > 35 && g.worker.x < 50) expect(Math.abs(g.worker.z)).toBeLessThan(5);
    }
    expect(g.worker.huntCycles).toBe(3); expect(sawEast).toBe(true);
    g.step(100);
    expect(g.state.resources.food).toBeGreaterThanOrEqual(initial + KINGDOM.hunt.food * 3);
    expect(g.state.resources.furs).toBeGreaterThanOrEqual(1);
    expect(g.state.resources.furs).toBeLessThan(g.worker.huntCycles);
  });
  it('pauses farm growth at night, preserves partial progress and blocks cargo job changes', () => {
    const g = game(); g.complete('farm'); g.state.time.dayTime = 0.35;
    assignProfession(g.state, g.worker, 'farmer');
    for (let i = 0; i < 90 && g.state.kingdom.field.progress < 0.2; i++) g.step(1);
    const progress = g.state.kingdom.field.progress;
    expect(progress).toBeGreaterThan(0);
    g.state.time.dayTime = 0.95; g.step(90);
    expect(g.worker.indoors).toBe(true); expect(g.state.kingdom.field.progress).toBe(progress);
    g.state.time.dayTime = 0.35; g.step(140);
    expect(g.state.resources.food).toBeGreaterThan(ECONOMY.startFood);
    g.worker.carrying = true; g.worker.cargoFood = 5;
    expect(assignProfession(g.state, g.worker, 'villager')).toContain('Deliver');
  });
  it('recovers from zero food while keeping production slower but possible', () => {
    const g = game(); g.complete('farm'); g.state.time.dayTime = 0.35; g.state.resources.food = 0;
    assignProfession(g.state, g.worker, 'farmer'); g.step(180);
    expect(g.state.resources.food).toBeGreaterThan(0); expect(workEfficiency(g.state)).toBe(1);
    expect(g.state.npcs.length).toBe(8);
  });
});

describe('merchant and authored events', () => {
  it('walks in, visits once, leaves and skips missed visits without duplicates', () => {
    const g = game(); g.state.time.day = 3;
    g.step(100); expect(g.state.kingdom.merchant.phase).toBe('visiting');
    expect(Math.hypot(g.merchant.npc.x - KINGDOM.merchant.market[0], g.merchant.npc.z - KINGDOM.merchant.market[1])).toBeLessThan(1.5);
    const departure = g.state.kingdom.merchant.departAt;
    g.state.time.dayTime = departure % 1; g.state.time.day = Math.floor(departure);
    g.step(100); expect(g.state.kingdom.merchant.phase).toBe('away');
    g.state.time.day = 100; g.step(100);
    expect(g.state.kingdom.merchant.phase).toBe('visiting');
    expect(g.state.kingdom.merchant.nextVisitDay).toBe(103);
    expect(g.state.npcs).toHaveLength(8);
  });
  it('collects supplies and pays a village request once, and never rumors an opened chest', () => {
    const g = game(), s = g.state;
    const before = s.resources.food; collectSupplies(s); collectSupplies(s);
    expect(s.notice.text).toContain('Lost supplies recovered');
    expect(s.notice.timer).toBeGreaterThan(0);
    expect(s.resources.food).toBe(before + KINGDOM.events.cache.food);
    s.exploration.treasures[0].opened = true;
    hearRumor(s); expect(s.kingdom.events.rumorTreasureId).not.toBe(EXPLORATION.treasures[0].id);
    const id = s.kingdom.events.rumorTreasureId;
    s.exploration.treasures.find((t) => t.id === id)!.opened = true;
    expect(hearRumor(s)).toContain('already followed');
    expect(villageRequest(s)).toContain('needs');
    s.resources.wood = 0; const coins = s.resources.coins;
    expect(villageRequest(s)).toContain('still needs'); expect(s.resources.coins).toBe(coins);
    s.resources.wood = 4; villageRequest(s); villageRequest(s);
    expect([s.resources.wood, s.resources.coins]).toEqual([1, coins + KINGDOM.events.request.coins]);
  });
});

describe('save migration and long-term economy', () => {
  it('repairs damaged new resources, duplicate workplaces and impossible hunting jobs', () => {
    const g = game(); g.complete('farm');
    const raw = JSON.parse(JSON.stringify(createSave(g.state, 0)));
    raw.economy.food = -20; raw.economy.furs = 'many';
    raw.kingdom.field.progress = 9; raw.kingdom.merchant.phase = 'duplicated';
    for (const n of raw.npcs.filter((n: { id: string }) => n.id === 'bren' || n.id === 'cora')) { n.job = 'farmer'; n.cargoFood = 10; n.carrying = true; }
    raw.npcs.find((n: { id: string }) => n.id === 'edda').job = 'hunter';
    const read = readSave(JSON.stringify(raw));
    expect(read.status).toBe('ok'); if (read.status !== 'ok') return;
    expect(read.repairs.length).toBeGreaterThan(0);
    applySave(g.state, read.save, g.saveWorld);
    expect(g.state.resources.food).toBe(ECONOMY.startFood);
    expect(g.state.resources.furs).toBe(0);
    expect(g.state.npcs.filter((n) => n.job === 'farmer')).toHaveLength(1);
    expect(g.state.npcs.filter((n) => n.job === 'hunter')).toHaveLength(0);
    expect(g.state.kingdom.field.progress).toBe(0);
    expect(g.state.kingdom.merchant.phase).toBe('away');
  });
  it('migrates a real v1-shaped save without losing any old progression', () => {
    const g = game(), raw = JSON.parse(readFileSync('e2e/fixtures/phase4-save.json', 'utf8'));
    expect(raw.version).toBe(1);
    const result = readSave(JSON.stringify(raw));
    expect(result.status).toBe('ok'); if (result.status !== 'ok') return;
    expect(result.repairs).toEqual([]); expect(result.save.version).toBe(SAVE_VERSION);
    applySave(g.state, result.save, g.saveWorld); g.food.update();
    expect([g.state.resources.coins, g.state.resources.food, g.state.time.day]).toEqual([raw.economy.coins, ECONOMY.startFood, raw.time.day]);
    expect(g.state.exploration.treasures[0].opened).toBe(true);
    expect(g.state.exploration.landmarks[0].discovered).toBe(true);
    expect(g.state.construction.find((s) => s.id === 'farm')!.status).toBe('available');
  });
  it('round-trips cargo, field progress, merchant visit, consumption ledger and event rewards', () => {
    const g = game(); g.complete('farm'); g.complete('lodge');
    assignProfession(g.state, g.worker, 'hunter');
    g.worker.productionProgress = 0.45; g.worker.carrying = true; g.worker.cargoFood = 5; g.worker.cargoFurs = 1; g.worker.huntCycles = 3;
    g.state.kingdom.field = { stage: 'growing', progress: 0.42 };
    g.state.kingdom.merchant = { phase: 'visiting', nextVisitDay: 6, departAt: 3.9, x: -12, z: 1.5 };
    g.state.time.day = 3; g.state.kingdom.foodPaidThroughDay = 3;
    collectSupplies(g.state); villageRequest(g.state); g.state.resources.wood = 3; villageRequest(g.state); hearRumor(g.state);
    const result = readSave(JSON.stringify(createSave(g.state, 44)));
    expect(result.status).toBe('ok'); if (result.status !== 'ok') return;
    const restored = game(); applySave(restored.state, result.save, restored.saveWorld);
    expect(restored.state.kingdom).toEqual({ ...g.state.kingdom, merchant: { ...g.state.kingdom.merchant, x: restored.state.kingdom.merchant.x, z: restored.state.kingdom.merchant.z } });
    expect(Math.hypot(restored.state.kingdom.merchant.x + 12, restored.state.kingdom.merchant.z - 1.5)).toBeLessThan(1);
    expect(restored.worker.cargoFood).toBe(5); expect(restored.worker.productionProgress).toBe(0.45);
    const before = { ...restored.state.resources }; restored.food.update();
    expect(restored.state.resources).toEqual(before);
    deliverProduce(restored.state, restored.worker); deliverProduce(restored.state, restored.worker);
    expect(restored.state.resources.food).toBe(before.food + 5);
    collectSupplies(restored.state); villageRequest(restored.state);
    expect(restored.state.resources.coins).toBe(before.coins);
  });
  it.each(['farmer', 'hunter'] as const)('supports ten real simulated game days with one %s and no off-screen production loss', (job) => {
    const g = game(); g.complete(job === 'farmer' ? 'farm' : 'lodge');
    assignProfession(g.state, g.worker, job); g.state.player.x = -90;
    g.step(ATMOSPHERE.dayLengthSeconds * 10, true);
    expect(g.state.time.day).toBe(11);
    expect(g.state.resources.food).toBeGreaterThan(0);
    expect(g.state.kingdom.foodPaidThroughDay).toBe(11);
    expect(g.state.resources.coins).toBe(ECONOMY.startCoins + ECONOMY.dailyCoins * 10);
    expect(g.state.kingdom.merchant.nextVisitDay).toBe(12);
    expect(g.state.kingdom.events).toEqual({ cacheCollected: false, rumorTreasureId: null, rumorHeard: false, request: 'available' });
    expect(g.state.npcs).toHaveLength(8);
    expect(g.pathfinder.searches).toBeLessThan(60 * ATMOSPHERE.dayLengthSeconds * 10);
    for (const amount of Object.values(g.state.resources)) expect(amount).toBeGreaterThanOrEqual(0);
    console.info(`Ten-day ${job}: ${JSON.stringify({ day: g.state.time.day, resources: g.state.resources, huntCycles: g.worker.huntCycles, nextMerchantDay: g.state.kingdom.merchant.nextVisitDay, pathSearches: g.pathfinder.searches })}`);
  }, 30_000);
});
