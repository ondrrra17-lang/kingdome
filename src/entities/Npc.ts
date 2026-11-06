import { NPC, type CharacterPalette, type VillagerPersonality } from '../config';
import type { DaySchedule } from '../systems/npc/schedule';
import { createSchedule } from '../systems/npc/schedule';

/**
 * Plain NPC state. Holds no scene objects, so behavior can be simulated and
 * tested without a renderer. NpcView reads it to draw the villager.
 */

/** A traveler is someone who does not live in the village yet, and so cannot be given work. */
export type NpcJob = 'villager' | 'gatherer' | 'woodcutter' | 'traveler';

/** Where a traveler is in joining the village. Everyone else is 'settled'. */
export type TravelPhase = 'settled' | 'waiting' | 'journey';

/** The finite state machine's top-level states. */
export type NpcFsmState = 'idle' | 'walk' | 'work' | 'rest';

/** What the current state is for. Decides what happens on arrival or when a timer ends. */
export type NpcTask =
  | 'none' | 'loiter' | 'toSit' | 'sit'
  | 'toTree' | 'chop' | 'deliver' | 'drop'
  | 'toSite' | 'build'
  | 'goHome' | 'enterHouse' | 'sleep'
  | 'journey';

export type PathStatus = 'none' | 'pending' | 'ready' | 'failed';

export interface VillagerDefinition {
  id: string;
  name: string;
  job: 'villager' | 'gatherer' | 'traveler';
  home: number;
  walkSpeed: number;
  personality: VillagerPersonality;
  spawn: readonly [number, number];
  /** The fire a traveler stays around until invited. */
  camp?: readonly [number, number];
  palette: CharacterPalette;
}

export interface NpcState {
  readonly id: string;
  readonly name: string;
  readonly personality: VillagerPersonality;
  readonly home: number;
  readonly walkSpeed: number;
  readonly schedule: DaySchedule;
  job: NpcJob;
  state: NpcFsmState;
  task: NpcTask;

  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  vx: number;
  vz: number;
  facing: number;
  prevFacing: number;
  stride: number;
  prevStride: number;
  speed: number;

  /** Inside a house: hidden, not simulated, and not interactable. */
  indoors: boolean;
  travelPhase: TravelPhase;
  campX: number;
  campZ: number;
  /** A waiting traveler far from the player: not simulated or drawn until the player comes near. */
  dormant: boolean;
  carrying: boolean;
  /** Index into the village's tree sites, or -1. */
  targetTree: number;
  /** Index of the building site this villager is assigned to, or -1. */
  assignedSite: number;
  /** Lifetime wood delivered to storage. */
  woodDelivered: number;

  stateTimer: number;
  decisionTimer: number;
  /** While above zero the villager stops to face the player. */
  attentionTimer: number;
  rngState: number;

  goalX: number;
  goalZ: number;
  hasFaceTarget: boolean;
  faceX: number;
  faceZ: number;
  arrived: boolean;
  pathStatus: PathStatus;
  pathLength: number;
  pathIndex: number;
  readonly pathX: Float32Array;
  readonly pathZ: Float32Array;
  stuckTimer: number;
  stuckCount: number;
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Per-villager deterministic random stream: the same seed always plays out the same way. */
export function nextRandom(npc: Pick<NpcState, 'rngState'>): number {
  npc.rngState = (npc.rngState + 0x6d2b79f5) >>> 0;
  let t = npc.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createNpc(def: VillagerDefinition, x: number, y: number, z: number, seed: number, index: number): NpcState {
  const rng = { rngState: (hashString(def.id) ^ seed) >>> 0 };
  const schedule = createSchedule(() => nextRandom(rng));
  return {
    id: def.id,
    name: def.name,
    personality: def.personality,
    home: def.home,
    walkSpeed: def.walkSpeed,
    schedule,
    job: def.job,
    state: 'idle',
    task: 'none',
    x, y, z,
    prevX: x, prevY: y, prevZ: z,
    vx: 0, vz: 0,
    facing: nextRandom(rng) * Math.PI * 2 - Math.PI,
    prevFacing: 0,
    stride: 0, prevStride: 0, speed: 0,
    indoors: false,
    travelPhase: def.job === 'traveler' ? 'waiting' : 'settled',
    campX: def.camp?.[0] ?? x,
    campZ: def.camp?.[1] ?? z,
    dormant: false,
    carrying: false,
    targetTree: -1,
    assignedSite: -1,
    woodDelivered: 0,
    stateTimer: 0.4 + nextRandom(rng) * 2.5,
    // Staggered so all villagers do not make decisions on the same step.
    decisionTimer: (index / 5) * NPC.decisionInterval,
    attentionTimer: 0,
    rngState: rng.rngState,
    goalX: x, goalZ: z,
    hasFaceTarget: false, faceX: 0, faceZ: 0,
    arrived: false,
    pathStatus: 'none',
    pathLength: 0,
    pathIndex: 0,
    pathX: new Float32Array(NPC.maxWaypoints),
    pathZ: new Float32Array(NPC.maxWaypoints),
    stuckTimer: 0,
    stuckCount: 0,
  };
}
