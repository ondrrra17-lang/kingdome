import { BUILDINGS, ECONOMY, KINGDOM, PLAYER, WORLD } from '../../config';
import type { GameState, TimeState } from '../../core/GameState';
import type { NpcJob, NpcState, TravelPhase } from '../../entities/Npc';
import { applyBuildingEffect, type SiteStatus } from '../construction/ConstructionState';
import { loadExploration, saveExploration, type ExplorationSave } from '../exploration/ExplorationState';
import { createKingdomState, type KingdomState } from '../economy/KingdomState';
import { checkKingdom } from './KingdomValidation';

/**
 * The save format: plain JSON describing what happened, and nothing about how it is
 * drawn or what anyone was doing this very moment. See SAVE_SYSTEM.md.
 *
 * Reading a save never trusts it. Each value is checked, anything unusable falls back to
 * its starting value, and rules of the game are enforced again when it is applied.
 */

export const SAVE_VERSION = 3;

export interface SavedNpc {
  id: string;
  job: NpcJob;
  travelPhase: TravelPhase;
  x: number;
  z: number;
  facing: number;
  indoors: boolean;
  carrying: boolean;
  woodDelivered: number;
  workplace: 'farm' | 'lodge' | null;
  productionProgress: number;
  cargoFood: number;
  cargoFurs: number;
  huntCycles: number;
}

export interface SavedSite {
  id: string;
  status: SiteStatus;
  progress: number;
  workerId: string | null;
}

export interface SaveFile {
  version: number;
  /** Date.now() when written. */
  savedAt: number;
  player: { x: number; z: number; facing: number; distanceTravelled: number };
  time: { dayTime: number; day: number };
  economy: { coins: number; wood: number; woodCapacity: number; food: number; furs: number };
  kingdom: KingdomState;
  village: { maxWoodcutters: number; watchPosts: number };
  exploration: ExplorationSave;
  construction: SavedSite[];
  npcs: SavedNpc[];
}

/** Writes the current game state into a save. Pure: nothing here touches storage. */
export function createSave(state: GameState, savedAt: number): SaveFile {
  const { player, time, resources, village, exploration, construction, npcs } = state;
  return {
    version: SAVE_VERSION,
    savedAt,
    player: { x: player.x, z: player.z, facing: player.facing, distanceTravelled: player.distanceTravelled },
    time: { dayTime: time.dayTime, day: time.day },
    economy: { ...resources },
    kingdom: structuredClone(state.kingdom),
    village: { maxWoodcutters: village.maxWoodcutters, watchPosts: village.watchPosts },
    exploration: saveExploration(exploration),
    construction: construction.map((s) => ({ id: s.id, status: s.status, progress: s.progress, workerId: s.workerId })),
    npcs: npcs.map((n) => ({
      id: n.id, job: n.job, travelPhase: n.travelPhase,
      x: n.x, z: n.z, facing: n.facing,
      indoors: n.indoors, carrying: n.carrying, woodDelivered: n.woodDelivered,
      workplace: n.workplace, productionProgress: n.productionProgress, cargoFood: n.cargoFood, cargoFurs: n.cargoFurs, huntCycles: n.huntCycles,
    })),
  };
}

export type ReadResult =
  | { status: 'ok'; save: SaveFile; repairs: string[] }
  | { status: 'unreadable'; reason: string }
  | { status: 'newer'; version: number };

const JOBS: readonly NpcJob[] = ['villager', 'gatherer', 'woodcutter', 'traveler', 'farmer', 'hunter'];
const PHASES: readonly TravelPhase[] = ['settled', 'waiting', 'journey'];
const STATUSES: readonly SiteStatus[] = ['available', 'funded', 'building', 'completed'];

/** Upgrades older saves, one version at a time. When the format changes, add a step here. */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  // Previously this crossing was always open. Preserve access, including travelers on the road.
  2: (old) => ({ ...old, version: 3, construction: [
    ...(Array.isArray(old.construction) ? old.construction.filter((s) => !isRecord(s) || s.id !== 'bridge') : []),
    { id: 'bridge', status: 'completed', progress: 1, workerId: null },
  ] }),
  1: (old) => {
    const day = isRecord(old.time) && isFiniteNumber(old.time.day) ? old.time.day : 1;
    return { ...old, version: 2, economy: { ...(isRecord(old.economy) ? old.economy : {}), food: ECONOMY.startFood, furs: 0 }, kingdom: createKingdomState(day) };
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Turns the text of a save into a checked SaveFile. It only refuses what cannot be
 * identified as a save at all. A damaged section is repaired, and listed in `repairs`.
 */
export function readSave(text: string): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'unreadable', reason: 'The save is not valid JSON.' };
  }
  if (!isRecord(raw) || !isFiniteNumber(raw.version)) return { status: 'unreadable', reason: 'The save has no version number.' };
  if (raw.version > SAVE_VERSION) return { status: 'newer', version: raw.version };

  let data = raw;
  for (let version = Math.floor(raw.version); version < SAVE_VERSION; version++) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { status: 'unreadable', reason: `No way to upgrade a save from version ${version}.` };
    data = migrate(data);
  }
  return { status: 'ok', ...checkSave(data) };
}

function checkSave(raw: Record<string, unknown>): { save: SaveFile; repairs: string[] } {
  const repairs: string[] = [];
  const section = (name: string): Record<string, unknown> => {
    const value = raw[name];
    if (isRecord(value)) return value;
    repairs.push(`${name} was missing`);
    return {};
  };
  const number = (where: string, value: unknown, fallback: number, min = -Infinity, max = Infinity): number => {
    if (isFiniteNumber(value) && value >= min && value <= max) return value;
    if (value !== undefined) repairs.push(`${where} was invalid`);
    return fallback;
  };
  const list = (name: string): unknown[] => {
    const value = raw[name];
    if (Array.isArray(value)) return value;
    repairs.push(`${name} was missing`);
    return [];
  };

  const player = section('player');
  const time = section('time');
  const economy = section('economy');
  const village = section('village');
  const exploration = section('exploration');

  const construction: SavedSite[] = [];
  for (const entry of list('construction')) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !STATUSES.includes(entry.status as SiteStatus)) {
      repairs.push('a building was unreadable');
      continue;
    }
    construction.push({
      id: entry.id,
      status: entry.status as SiteStatus,
      progress: number(`${entry.id} progress`, entry.progress, 0, 0, 1),
      workerId: typeof entry.workerId === 'string' ? entry.workerId : null,
    });
  }

  const npcs: SavedNpc[] = [];
  for (const entry of list('npcs')) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !JOBS.includes(entry.job as NpcJob) || !PHASES.includes(entry.travelPhase as TravelPhase)) {
      repairs.push('a villager was unreadable');
      continue;
    }
    npcs.push({
      id: entry.id,
      job: entry.job as NpcJob,
      travelPhase: entry.travelPhase as TravelPhase,
      x: number(`${entry.id} x`, entry.x, NaN),
      z: number(`${entry.id} z`, entry.z, NaN),
      facing: number(`${entry.id} facing`, entry.facing, 0),
      indoors: entry.indoors === true,
      carrying: entry.carrying === true,
      woodDelivered: number(`${entry.id} wood`, entry.woodDelivered, 0, 0),
      workplace: entry.workplace === 'farm' || entry.workplace === 'lodge' ? entry.workplace : null,
      productionProgress: number('production progress', entry.productionProgress, 0, 0, 1),
      cargoFood: Math.floor(number('food cargo', entry.cargoFood, 0, 0, 100)),
      cargoFurs: Math.floor(number('fur cargo', entry.cargoFurs, 0, 0, 100)),
      huntCycles: Math.floor(number('hunt cycles', entry.huntCycles, 0, 0, Number.MAX_SAFE_INTEGER)),
    });
  }

  return {
    repairs,
    save: {
      version: SAVE_VERSION,
      savedAt: number('savedAt', raw.savedAt, 0, 0),
      player: {
        x: number('player x', player.x, NaN),
        z: number('player z', player.z, NaN),
        facing: number('player facing', player.facing, 0),
        distanceTravelled: number('distance', player.distanceTravelled, 0, 0),
      },
      time: {
        dayTime: number('time of day', time.dayTime, NaN, 0, 1),
        day: Math.floor(number('day', time.day, 1, 1)),
      },
      economy: {
        food: Math.floor(number('food', economy.food, ECONOMY.startFood, 0, Number.MAX_SAFE_INTEGER)),
        furs: Math.floor(number('furs', economy.furs, 0, 0, Number.MAX_SAFE_INTEGER)),
        coins: Math.floor(number('coins', economy.coins, ECONOMY.startCoins, 0)),
        wood: Math.floor(number('wood', economy.wood, 0, 0)),
        woodCapacity: number('wood capacity', economy.woodCapacity, ECONOMY.baseWoodCapacity, 0),
      },
      village: {
        maxWoodcutters: number('woodcutter limit', village.maxWoodcutters, ECONOMY.baseMaxWoodcutters, 0),
        watchPosts: number('watch posts', village.watchPosts, 0, 0),
      },
      exploration: {
        openedTreasures: stringList(exploration.openedTreasures),
        discoveredLandmarks: stringList(exploration.discoveredLandmarks),
      },
      construction,
      npcs,
      kingdom: checkKingdom(raw.kingdom, Math.floor(number('day', time.day, 1, 1)), repairs),
    },
  };
}

/** What applying a save needs to know about the world. Interface so tests can supply their own. */
export interface SaveWorld {
  /** Whether the player may stand here. */
  isPlayerPosition(x: number, z: number): boolean;
  /** The nearest walkable spot for a villager, or null if there is none nearby. */
  nearestWalkable(x: number, z: number): { x: number; z: number } | null;
  surfaceHeight(x: number, z: number): number;
}

/** Keeps a saved time usable: scrubbing or a damaged value must not stop the clock. */
function applyTime(time: TimeState, saved: SaveFile['time']): void {
  if (Number.isFinite(saved.dayTime)) time.dayTime = saved.dayTime % 1;
  time.day = saved.day;
}

/**
 * Applies a checked save to a freshly created game state, before any system or view is
 * built from it. Existing NPCs are updated by id, so nobody can be duplicated, and a
 * villager the save does not mention stays as a new game would have them.
 *
 * Everything is left consistent by the rules of the game, whatever the save claims:
 * capacities are worked out from what is built, and work is handed out again.
 */
export function applySave(state: GameState, save: SaveFile, world: SaveWorld): void {
  const { player, resources, village } = state;
  const crossingOpen = save.construction.some((s) => s.id === 'bridge' && s.status === 'completed');

  const closedBankEdge = WORLD.bridge.x - WORLD.bridge.repairGapHalfLength - PLAYER.radius;
  if (Number.isFinite(save.player.x) && Number.isFinite(save.player.z) && (crossingOpen || save.player.x <= closedBankEdge + 1e-6) && world.isPlayerPosition(save.player.x, save.player.z)) {
    player.x = player.prevX = save.player.x;
    player.z = player.prevZ = save.player.z;
  }
  player.y = player.prevY = world.surfaceHeight(player.x, player.z);
  player.facing = player.prevFacing = save.player.facing;
  player.distanceTravelled = save.player.distanceTravelled;
  applyTime(state.time, save.time);

  loadExploration(state.exploration, save.exploration);

  // Buildings first: what is standing decides the limits everything else is held to.
  const savedSites = new Map(save.construction.map((s) => [s.id, s]));
  state.construction.forEach((site, index) => {
    const saved = savedSites.get(site.id);
    if (!saved) return;
    site.status = saved.status;
    site.progress = saved.status === 'completed' ? 1 : saved.status === 'available' ? 0 : saved.progress;
    // Solidity is left to ConstructionSystem, which adds the collider on its first step.
    if (saved.status === 'completed') applyBuildingEffect(BUILDINGS[index], resources, village);
  });

  resources.coins = save.economy.coins;
  resources.wood = Math.min(save.economy.wood, resources.woodCapacity);
  resources.food = save.economy.food;
  resources.furs = save.economy.furs;
  state.kingdom = structuredClone(save.kingdom);
  const merchantSpot = world.nearestWalkable(state.kingdom.merchant.x, state.kingdom.merchant.z);
  if (merchantSpot) { state.kingdom.merchant.x = merchantSpot.x; state.kingdom.merchant.z = merchantSpot.z; }

  const savedNpcs = new Map(save.npcs.map((n) => [n.id, n]));
  for (const npc of state.npcs) {
    const saved = savedNpcs.get(npc.id);
    if (saved) applyNpc(npc, saved, world);
  }
  holdToWoodcutterLimit(state.npcs, village.maxWoodcutters);
  for (const job of ['farmer', 'hunter'] as const) {
    const workplace = job === 'farmer' ? 'farm' : 'lodge';
    let occupied = 0;
    const limit = job === 'farmer' ? KINGDOM.farm.slots : KINGDOM.hunt.slots;
    for (const npc of state.npcs) {
      if (npc.job !== job) continue;
      if (occupied < limit && state.construction.some((s) => s.id === workplace && s.status === 'completed')) {
        npc.workplace = workplace; occupied++;
      } else {
        npc.job = 'villager'; npc.workplace = null; npc.cargoFood = npc.cargoFurs = 0; npc.carrying = false;
      }
    }
  }
  restoreBuilders(state, savedSites);
}

/** A villager's job and journey, as far as who they started out as allows. */
function applyNpc(npc: NpcState, saved: SavedNpc, world: SaveWorld): void {
  if (npc.job === 'gatherer') {
    // Alda keeps her job whatever a save says.
  } else if (npc.travelPhase !== 'settled') {
    // Started as a traveler: waiting, on the road, or settled with any ordinary job.
    if (saved.travelPhase === 'settled') {
      npc.travelPhase = 'settled';
      npc.job = ['woodcutter', 'farmer', 'hunter'].includes(saved.job) ? saved.job : 'villager';
    } else {
      npc.travelPhase = saved.travelPhase;
    }
  } else {
    npc.job = ['woodcutter', 'farmer', 'hunter'].includes(saved.job) ? saved.job : 'villager';
  }

  if (Number.isFinite(saved.x) && Number.isFinite(saved.z)) {
    const spot = world.nearestWalkable(saved.x, saved.z);
    if (spot) {
      npc.x = npc.prevX = spot.x;
      npc.z = npc.prevZ = spot.z;
    }
  }
  npc.y = npc.prevY = world.surfaceHeight(npc.x, npc.z);
  npc.facing = npc.prevFacing = saved.facing;
  npc.indoors = saved.indoors && npc.travelPhase === 'settled';
  const producer = npc.job === 'farmer' || npc.job === 'hunter';
  npc.cargoFood = producer ? saved.cargoFood : 0;
  npc.cargoFurs = npc.job === 'hunter' ? saved.cargoFurs : 0;
  npc.carrying = saved.carrying && (npc.job === 'woodcutter' || (producer && npc.cargoFood > 0));
  if (!npc.carrying) npc.cargoFood = npc.cargoFurs = 0;
  npc.workplace = producer ? (npc.job === 'farmer' ? 'farm' : 'lodge') : null;
  npc.productionProgress = producer ? saved.productionProgress : 0;
  npc.huntCycles = npc.job === 'hunter' ? saved.huntCycles : 0;
  npc.woodDelivered = saved.woodDelivered;
  // What they were doing this moment is not saved: they decide again almost immediately,
  // and search for a fresh path from where they stand.
  npc.state = 'idle';
  npc.task = npc.indoors ? 'sleep' : 'none';
  npc.stateTimer = 0.2;
}

function holdToWoodcutterLimit(npcs: readonly NpcState[], limit: number): void {
  let count = 0;
  for (const npc of npcs) {
    if (npc.job !== 'woodcutter') continue;
    count++;
    if (count > limit) {
      npc.job = 'villager';
      npc.carrying = false;
    }
  }
}

/**
 * Puts builders back on their sites. A site whose builder cannot return goes back to waiting
 * for one, keeping its progress and without being paid for twice.
 */
function restoreBuilders(state: GameState, savedSites: ReadonlyMap<string, SavedSite>): void {
  state.construction.forEach((site, index) => {
    const saved = savedSites.get(site.id);
    site.workerId = null;
    if (site.status !== 'funded' && site.status !== 'building') return;
    const worker = state.npcs.find((n) => n.id === saved?.workerId);
    if (worker && worker.job === 'villager' && worker.assignedSite < 0) {
      site.workerId = worker.id;
      worker.assignedSite = index;
    } else {
      site.status = 'funded';
    }
  });
}

/** A short summary of a save, for the start screen. */
export function describeSave(save: SaveFile): string {
  const chests = save.exploration.openedTreasures.length;
  return `Day ${save.time.day} · ${save.economy.coins} coins · ${save.economy.wood} wood · ${chests} ${chests === 1 ? 'chest' : 'chests'} found`;
}
