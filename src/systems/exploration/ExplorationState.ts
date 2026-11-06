import { EXPLORATION, type LandmarkDefinition, type TreasureDefinition } from '../../config';
import type { ResourceState } from '../Resources';

/**
 * What the player has found out in the forest. Plain data, keyed by stable ids rather
 * than by position in a list, so a save file keeps working if the map's content changes.
 */

export interface TreasureState {
  readonly id: string;
  opened: boolean;
}

export interface LandmarkState {
  readonly id: string;
  discovered: boolean;
}

export interface ExplorationState {
  treasures: TreasureState[];
  landmarks: LandmarkState[];
}

/** The part of exploration a save file needs. */
export interface ExplorationSave {
  openedTreasures: string[];
  discoveredLandmarks: string[];
}

export function createExplorationState(): ExplorationState {
  return {
    treasures: EXPLORATION.treasures.map((t) => ({ id: t.id, opened: false })),
    landmarks: EXPLORATION.landmarks.map((l) => ({ id: l.id, discovered: false })),
  };
}

/** Pays out a treasure's fixed reward the first time only. Returns the coins gained. */
export function openTreasure(treasure: TreasureState, def: TreasureDefinition, resources: Pick<ResourceState, 'coins'>): number {
  if (treasure.opened) return 0;
  treasure.opened = true;
  resources.coins += def.coins;
  return def.coins;
}

export function openedTreasureCount(state: ExplorationState): number {
  return state.treasures.filter((t) => t.opened).length;
}

export function discoveredLandmarkCount(state: ExplorationState): number {
  return state.landmarks.filter((l) => l.discovered).length;
}

/** Marks every landmark the player has reached and returns the first new one, if any. */
export function discoverLandmarks(
  state: ExplorationState, defs: readonly LandmarkDefinition[], x: number, z: number,
): LandmarkDefinition | null {
  let found: LandmarkDefinition | null = null;
  for (let i = 0; i < defs.length; i++) {
    const landmark = state.landmarks[i];
    const def = defs[i];
    if (landmark.discovered) continue;
    if (Math.hypot(x - def.x, z - def.z) > def.discoverRadius) continue;
    landmark.discovered = true;
    found ??= def;
  }
  return found;
}

export function saveExploration(state: ExplorationState): ExplorationSave {
  return {
    openedTreasures: state.treasures.filter((t) => t.opened).map((t) => t.id),
    discoveredLandmarks: state.landmarks.filter((l) => l.discovered).map((l) => l.id),
  };
}

/** Restores a save onto current state. Ids the map no longer has are ignored. */
export function loadExploration(state: ExplorationState, save: ExplorationSave): void {
  const opened = new Set(save.openedTreasures);
  const discovered = new Set(save.discoveredLandmarks);
  for (const treasure of state.treasures) treasure.opened = opened.has(treasure.id);
  for (const landmark of state.landmarks) landmark.discovered = discovered.has(landmark.id);
}
