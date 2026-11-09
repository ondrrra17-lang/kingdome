import { describe, expect, it } from 'vitest';
import { BUILDINGS, NPC, PLAYER, SIM, WORLD } from '../../config';
import { createGameState } from '../../core/GameState';
import { createNpc } from '../../entities/Npc';
import { buildWorldData } from '../../world/WorldData';
import { CollisionWorld } from '../CollisionWorld';
import { NavGrid } from '../navigation/NavGrid';
import { Pathfinder } from '../navigation/Pathfinder';
import { NpcSystem } from '../npc/NpcSystem';
import { ProductionSystem } from '../economy/ProductionSystem';
import { VillageSites } from '../npc/VillageSites';
import { applySave, createSave, readSave } from '../save/SaveData';
import { bridgeObjective } from './BridgeObjective';
import { BridgeSystem, bridgeIsOpen } from './BridgeSystem';
import { ConstructionSystem } from './ConstructionSystem';
import { createSiteInteractables } from './siteInteractables';

const world = buildWorldData();
const index = BUILDINGS.findIndex((s) => s.id === 'bridge');

function game(saved?: string) {
  const collision = new CollisionWorld([...world.colliders]);
  const { minX, maxX, minZ, maxZ } = WORLD.bounds;
  const inset = NPC.navClearance;
  const nav = new NavGrid({ minX: minX + inset, maxX: maxX - inset, minZ: minZ + inset, maxZ: maxZ - inset }, NPC.navCellSize,
    (x, z) => collision.isBlocked(x, z, inset));
  nav.setMainRegion(PLAYER.spawnX, PLAYER.spawnZ);
  const sites = new VillageSites(nav, world);
  const state = createGameState(0, [...NPC.villagers, ...NPC.travelers].map((n, i) => {
    expect(sites.nearestPoint(n.spawn[0], n.spawn[1])).toBe(true);
    return createNpc(n, sites.pointX, world.surfaceHeight(sites.pointX, sites.pointZ), sites.pointZ, WORLD.seed, i);
  }));
  if (saved) {
    const read = readSave(saved);
    if (read.status !== 'ok') throw new Error(read.status);
    applySave(state, read.save, {
      isPlayerPosition: (x, z) => !collision.isBlocked(x, z, PLAYER.radius),
      nearestWalkable: (x, z) => sites.nearestPoint(x, z) ? { x: sites.pointX, z: sites.pointZ } : null,
      surfaceHeight: world.surfaceHeight,
    });
  }
  const bridge = new BridgeSystem(state, collision, nav);
  const paths = new Pathfinder(nav);
  const construction = new ConstructionSystem(state, collision, nav);
  const production = new ProductionSystem(state);
  const npcs = new NpcSystem(state, sites, paths, { collision, surfaceHeight: world.surfaceHeight });
  const pathToEast = () => paths.find(-16, 1, 60, 0, new Float32Array(NPC.maxWaypoints), new Float32Array(NPC.maxWaypoints));
  const step = () => { construction.update(SIM.fixedDt); bridge.update(); production.update(SIM.fixedDt); npcs.update(SIM.fixedDt); };
  return { state, collision, nav, sites, bridge, paths, step, pathToEast, site: state.construction[index], interaction: createSiteInteractables(state)[index] };
}

describe('restoring the Old Bridge', () => {
  it('blocks players and paths to the entire east bank until completion', () => {
    const g = game();
    expect(bridgeIsOpen(g.state)).toBe(false);
    expect(g.pathToEast()).toBe(-1);
    for (let z = WORLD.bounds.minZ; z <= WORLD.bounds.maxZ; z++) expect(g.collision.isBlocked(WORLD.bridge.x, z, PLAYER.radius)).toBe(true);
    const body = { x: 30.9, z: 0, vx: 8, vz: 0 };
    body.x += 8 / 60;
    g.collision.resolve(body, PLAYER.radius);
    expect(body.x).toBeLessThanOrEqual(31 - PLAYER.radius);
    expect(g.state.npcs.find((n) => n.id === 'wren')!.x).toBeGreaterThan(50);
  });

  it('charges once, requires all materials, and explains the next step', () => {
    const g = game();
    expect(bridgeObjective(g.state).detail).toContain('assign a woodcutter');
    g.state.resources.wood = 7;
    g.interaction.interact();
    expect(g.site.status).toBe('available');
    expect(g.state.resources.wood).toBe(7);
    g.state.resources.wood = 8;
    expect(g.interaction.prompt()).toContain('Repair Old Bridge');
    g.interaction.interact(); g.interaction.interact();
    expect(g.state.resources.wood).toBe(0);
    expect(g.state.resources.coins).toBe(1);
    expect(g.site.status).toBe('funded');
    expect(bridgeObjective(g.state).detail).toContain('unemployed');
    expect(g.pathToEast()).toBe(-1);
  });

  it('queues without a free worker and stays shut during nighttime', () => {
    const g = game(); g.state.resources.wood = 8;
    for (const n of g.state.npcs) if (n.job === 'villager') n.job = 'woodcutter';
    g.interaction.interact();
    for (let i = 0; i < 120; i++) g.step();
    expect(g.site.workerId).toBeNull(); expect(g.site.progress).toBe(0);
    const n = g.state.npcs.find((n) => n.id === 'bren')!; n.job = 'villager';
    g.state.time.dayTime = 0.95;
    for (let i = 0; i < 60 * 15; i++) g.step();
    expect(g.site.workerId).toBe('bren'); expect(g.site.progress).toBe(0);
    expect(g.pathToEast()).toBe(-1);
  });

  it('a real builder repairs it on the west bank, resumes a save, and opens navigation exactly once', () => {
    let g = game();
    g.state.time.dayTime = 0.35; g.state.resources.wood = 8;
    g.interaction.interact();
    for (let i = 0; i < 60 * 90 && g.site.progress < 0.2; i++) g.step();
    expect(g.site.progress).toBeGreaterThanOrEqual(0.2);
    const worker = g.state.npcs.find((n) => n.id === g.site.workerId)!;
    const stand = g.sites.buildSites[index];
    expect(Math.hypot(worker.x - stand.standX, worker.z - stand.standZ)).toBeLessThan(NPC.closeEnough + 0.6);
    expect(g.pathToEast()).toBe(-1);
    const progress = g.site.progress;
    g = game(JSON.stringify(createSave(g.state, 1)));
    expect(g.site.progress).toBe(progress);
    expect(g.state.resources.coins).toBe(1);
    for (let i = 0; i < 60 * 90 && !bridgeIsOpen(g.state); i++) g.step();
    expect(bridgeIsOpen(g.state)).toBe(true);
    expect(g.site.solid).toBe(false);
    expect(g.pathToEast()).toBeGreaterThan(0);
    expect(g.collision.isBlocked(34, 0, PLAYER.radius)).toBe(false);
    const count = g.collision.colliders.length;
    for (let i = 0; i < 10; i++) g.bridge.update();
    expect(g.collision.colliders.length).toBe(count);
    expect(g.collision.isBlocked(WORLD.houses[0].x, WORLD.houses[0].z, PLAYER.radius)).toBe(true);
    expect(bridgeObjective(g.state).title).toBe('The east bank is open');
    g.state.exploration.landmarks.find((l) => l.id === 'traveler-camp')!.discovered = true;
    expect(bridgeObjective(g.state).done).toBe(true);
    const loaded = game(JSON.stringify(createSave(g.state, 2)));
    expect(loaded.pathToEast()).toBeGreaterThan(0);
    expect(bridgeObjective(loaded.state).done).toBe(true);
  });

  it('hunters keep using the western forest while the bridge is closed', () => {
    const g = game();
    const hunter = g.state.npcs.find((n) => n.id === 'cora')!;
    g.state.construction.find((s) => s.id === 'lodge')!.status = 'completed';
    hunter.job = 'hunter'; hunter.workplace = 'lodge'; hunter.huntCycles = 1;
    hunter.stateTimer = 0; g.state.time.dayTime = 0.35;
    for (let i = 0; i < 60 * 160 && hunter.huntCycles < 3; i++) g.step();
    expect(hunter.huntCycles).toBeGreaterThanOrEqual(3);
    expect(hunter.x).toBeLessThan(30);
    expect(g.state.resources.food).toBeGreaterThan(9);
  });

  it('migrates v2 saves with the old crossing open, preserving positions and progress', () => {
    const raw = createSave(game().state, 5);
    raw.version = 2; raw.construction = raw.construction.filter((s) => s.id !== 'bridge');
    raw.player.x = 60; raw.player.z = 0; raw.economy.coins = 17;
    const loaded = game(JSON.stringify(raw));
    expect(bridgeIsOpen(loaded.state)).toBe(true);
    expect(loaded.state.player.x).toBe(60);
    expect(loaded.state.resources.coins).toBe(17);
    expect(loaded.pathToEast()).toBeGreaterThan(0);
  });

  it('repairs invalid locked-save positions without placing the player inside the barrier', () => {
    const raw = createSave(game().state, 5); raw.player.x = 34; raw.player.z = 0;
    const loaded = game(JSON.stringify(raw));
    expect(loaded.state.player.x).toBe(PLAYER.spawnX);
    expect(bridgeIsOpen(loaded.state)).toBe(false);
    raw.player.x = WORLD.bridge.x - WORLD.bridge.repairGapHalfLength - PLAYER.radius;
    const edge = game(JSON.stringify(raw));
    expect(edge.state.player.x).toBe(raw.player.x);
  });
});
