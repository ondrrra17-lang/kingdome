import { ATMOSPHERE, ECONOMY, INTERACTION, PLAYER } from '../config';
import type { NpcState } from '../entities/Npc';
import { createSiteStates, type BuildingSiteState, type VillageLimits } from '../systems/construction/ConstructionState';
import { createExplorationState, type ExplorationState } from '../systems/exploration/ExplorationState';
import type { ResourceState } from '../systems/Resources';

/**
 * Pure gameplay state. It holds no Three.js objects and knows nothing about how
 * it is drawn; systems mutate it at a fixed rate and views read it each frame.
 */
export interface PlayerState {
  x: number;
  y: number;
  z: number;
  /** Position at the previous sim step, used for render interpolation. */
  prevX: number;
  prevY: number;
  prevZ: number;
  vx: number;
  vz: number;
  /** Heading around Y, radians; 0 faces +Z (toward the camera). */
  facing: number;
  prevFacing: number;
  /** Accumulated walk-cycle distance, in strides. */
  stride: number;
  prevStride: number;
  /** Current ground speed in units/s. */
  speed: number;
  /** Total distance moved this session; drives the controls hint. */
  distanceTravelled: number;
}

export interface TimeState {
  /** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  dayTime: number;
  /** Starts at 1 and goes up at each midnight. */
  day: number;
  paused: boolean;
}

export interface GameState {
  player: PlayerState;
  time: TimeState;
  resources: ResourceState;
  npcs: NpcState[];
  construction: BuildingSiteState[];
  village: VillageLimits;
  exploration: ExplorationState;
  /** A village-wide message, unrelated to what the player is standing near. */
  notice: { text: string; timer: number };
}

export function postNotice(state: GameState, text: string): void {
  state.notice.text = text;
  state.notice.timer = INTERACTION.noticeSeconds;
}

export function updateNotice(state: GameState, dt: number): void {
  if (state.notice.timer <= 0) return;
  state.notice.timer -= dt;
  if (state.notice.timer <= 0) state.notice.text = '';
}

/** Moves the clock, keeping the day number in step when it crosses midnight in either direction. */
export function advanceClock(time: TimeState, days: number): void {
  let next = time.dayTime + days;
  if (next >= 1) {
    next -= 1;
    time.day++;
  } else if (next < 0) {
    next += 1;
    time.day = Math.max(time.day - 1, 1);
  }
  time.dayTime = next;
}

export function createGameState(spawnY: number, npcs: NpcState[] = []): GameState {
  return {
    player: {
      x: PLAYER.spawnX,
      y: spawnY,
      z: PLAYER.spawnZ,
      prevX: PLAYER.spawnX,
      prevY: spawnY,
      prevZ: PLAYER.spawnZ,
      vx: 0,
      vz: 0,
      facing: PLAYER.spawnFacing,
      prevFacing: PLAYER.spawnFacing,
      stride: 0,
      prevStride: 0,
      speed: 0,
      distanceTravelled: 0,
    },
    time: { dayTime: ATMOSPHERE.startTime, day: 1, paused: false },
    resources: { coins: ECONOMY.startCoins, wood: 0, woodCapacity: ECONOMY.baseWoodCapacity },
    npcs,
    construction: createSiteStates(),
    village: { maxWoodcutters: ECONOMY.baseMaxWoodcutters, watchPosts: 0 },
    exploration: createExplorationState(),
    notice: { text: '', timer: 0 },
  };
}
