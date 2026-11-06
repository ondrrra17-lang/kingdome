import { ECONOMY, KINGDOM, NPC, type VillagerPersonality } from '../../config';
import { nextRandom, type NpcJob, type NpcState, type NpcTask } from '../../entities/Npc';
import { settleTraveler } from '../Recruitment';
import { addWood, isStorageFull, type ResourceState } from '../Resources';
import { routinePhase, type DayPhase } from './schedule';
import type { SiteQueries } from './VillageSites';

/**
 * High-level villager decisions: a small finite state machine run a few times a
 * second, not every step. It only sets goals and states; NpcLocomotion moves the
 * body and the pathfinder is queued separately.
 */

export interface BrainContext {
  dayTime: number;
  resources: Pick<ResourceState, 'coins' | 'wood' | 'woodCapacity'>;
  sites: SiteQueries;
  /** All villagers, so workers do not pick the same tree. */
  npcs: readonly NpcState[];
  /** Called when a traveler reaches the village. */
  onSettled?(npc: NpcState): void;
  onProduceDelivery?(npc: NpcState): void;
}

export type Activity = 'work' | 'wander' | 'fire' | 'house' | 'sit' | 'home';

/** Chooses what to do next. `roll` is a random value in [0, 1). */
export function chooseActivity(job: NpcJob, personality: VillagerPersonality, phase: DayPhase, roll: number): Activity {
  if (phase === 'night') return 'home';
  if (phase === 'evening') {
    if (roll < 0.55) return 'fire';
    return roll < 0.75 ? 'sit' : 'house';
  }
  if (job === 'woodcutter' || job === 'farmer' || job === 'hunter') return 'work';
  if (job === 'gatherer') return roll < 0.85 ? 'work' : 'fire';
  const weights = NPC.personalities[personality];
  if (roll < weights.wander) return 'wander';
  if (roll < weights.wander + weights.fire) return 'fire';
  if (roll < weights.wander + weights.fire + weights.house) return 'house';
  return 'sit';
}

function between(npc: NpcState, min: number, max: number): number {
  return min + nextRandom(npc) * (max - min);
}

function setIdle(npc: NpcState, seconds: number): void {
  npc.state = 'idle';
  npc.task = 'none';
  npc.stateTimer = seconds;
  npc.pathStatus = 'none';
  npc.pathLength = 0;
  npc.arrived = false;
}

export function walkTo(npc: NpcState, task: NpcTask, x: number, z: number): void {
  npc.state = 'walk';
  npc.task = task;
  npc.goalX = x;
  npc.goalZ = z;
  npc.pathStatus = 'pending';
  npc.pathLength = 0;
  npc.pathIndex = 0;
  npc.arrived = false;
  npc.stuckTimer = 0;
  npc.stuckCount = 0;
}

function setFaceTarget(npc: NpcState, x: number, z: number): void {
  npc.hasFaceTarget = true;
  npc.faceX = x;
  npc.faceZ = z;
}

function pickTree(npc: NpcState, ctx: BrainContext): number {
  const { trees } = ctx.sites;
  const pool = Math.min(trees.length, NPC.treeChoiceCount);
  if (pool === 0) return -1;
  const offset = Math.floor(nextRandom(npc) * pool);
  for (let i = 0; i < pool; i++) {
    const candidate = (offset + i) % pool;
    let claimed = false;
    for (let n = 0; n < ctx.npcs.length; n++) {
      if (ctx.npcs[n] !== npc && ctx.npcs[n].targetTree === candidate) claimed = true;
    }
    if (!claimed) return candidate;
  }
  return -1;
}

/** Sets a walk toward a point near the fire, facing it on arrival. */
function walkToFire(npc: NpcState, ctx: BrainContext, task: NpcTask): boolean {
  const { sites } = ctx;
  const angle = nextRandom(npc) * Math.PI * 2;
  const radius = between(npc, NPC.fireRingMin, NPC.fireRingMax);
  if (!sites.nearestPoint(sites.fireX + Math.cos(angle) * radius, sites.fireZ + Math.sin(angle) * radius)) return false;
  walkTo(npc, task, sites.pointX, sites.pointZ);
  setFaceTarget(npc, sites.fireX, sites.fireZ);
  return true;
}

function startGoingHome(npc: NpcState, ctx: BrainContext): void {
  const door = ctx.sites.doors[npc.home];
  npc.targetTree = -1;
  walkTo(npc, 'goHome', door.x, door.z);
  setFaceTarget(npc, door.faceX, door.faceZ);
}

function startDelivery(npc: NpcState, ctx: BrainContext): void {
  const { sites } = ctx;
  npc.targetTree = -1;
  if (npc.job === 'gatherer') {
    if (!walkToFire(npc, ctx, 'deliver')) setIdle(npc, 1);
    return;
  }
  walkTo(npc, 'deliver', sites.storageStandX, sites.storageStandZ);
  setFaceTarget(npc, sites.storageX, sites.storageZ);
}

function startBuilding(npc: NpcState, ctx: BrainContext): void {
  const site = ctx.sites.buildSites[npc.assignedSite];
  npc.targetTree = -1;
  walkTo(npc, 'toSite', site.standX, site.standZ);
  setFaceTarget(npc, site.x, site.z);
}

/** Starts the next thing to do, according to time of day and job. */
function chooseNext(npc: NpcState, phase: DayPhase, ctx: BrainContext): void {
  if (npc.carrying) {
    startDelivery(npc, ctx);
    return;
  }
  // An assigned site comes before anything a villager would choose for themselves.
  if (npc.assignedSite >= 0 && phase === 'day') {
    startBuilding(npc, ctx);
    return;
  }
  const { sites } = ctx;
  const activity = chooseActivity(npc.job, npc.personality, phase, nextRandom(npc));
  npc.hasFaceTarget = false;
  switch (activity) {
    case 'home':
      startGoingHome(npc, ctx);
      return;
    case 'work': {
      if (npc.job === 'farmer' || npc.job === 'hunter') {
        const point = npc.job === 'farmer' ? KINGDOM.farm.workplace : KINGDOM.hunt.zones[npc.huntCycles % KINGDOM.hunt.zones.length];
        if (sites.nearestPoint(point[0], point[1])) {
          walkTo(npc, 'toWorkplace', sites.pointX, sites.pointZ);
          setFaceTarget(npc, sites.pointX, sites.pointZ + (npc.job === 'farmer' ? 2 : -1));
          return;
        }
        break;
      }
      // With the pile full there is nothing to cut wood for, so the woodcutter takes a break.
      const tree = npc.job === 'woodcutter' && isStorageFull(ctx.resources) ? -1 : pickTree(npc, ctx);
      if (tree >= 0) {
        const site = sites.trees[tree];
        npc.targetTree = tree;
        walkTo(npc, 'toTree', site.standX, site.standZ);
        setFaceTarget(npc, site.x, site.z);
        return;
      }
      break; // No free tree: spend the time wandering instead.
    }
    case 'fire':
      if (walkToFire(npc, ctx, 'loiter')) return;
      break;
    case 'sit':
      if (walkToFire(npc, ctx, 'toSit')) return;
      break;
    case 'house': {
      const door = sites.doors[npc.home];
      const x = door.x + between(npc, -NPC.houseLoiterRange, NPC.houseLoiterRange);
      const z = door.z + between(npc, 0, NPC.houseLoiterRange);
      if (sites.nearestPoint(x, z)) {
        walkTo(npc, 'loiter', sites.pointX, sites.pointZ);
        return;
      }
      break;
    }
    case 'wander':
      break;
  }
  const { wanderArea } = NPC;
  const x = between(npc, wanderArea.minX, wanderArea.maxX);
  const z = between(npc, wanderArea.minZ, wanderArea.maxZ);
  if (sites.nearestPoint(x, z)) walkTo(npc, 'loiter', sites.pointX, sites.pointZ);
  else setIdle(npc, 2);
}

function handleArrival(npc: NpcState, ctx: BrainContext): void {
  npc.arrived = false;
  npc.pathStatus = 'none';
  switch (npc.task) {
    case 'toWorkplace':
      npc.state = 'work'; npc.task = 'produce';
      return;
    case 'toTree':
      npc.state = 'work';
      npc.task = 'chop';
      npc.stateTimer = npc.job === 'woodcutter' ? between(npc, NPC.chopSeconds * 0.85, NPC.chopSeconds * 1.15) : NPC.gatherSeconds;
      return;
    case 'deliver':
      if (npc.carrying && (npc.job === 'farmer' || npc.job === 'hunter')) ctx.onProduceDelivery?.(npc);
      // Wood counts the moment it is set down. A gatherer's sticks feed the fire, not storage.
      if (npc.carrying && npc.job === 'woodcutter') {
        npc.woodDelivered += addWood(ctx.resources, ECONOMY.woodPerDelivery);
      }
      npc.carrying = false;
      npc.state = 'work';
      npc.task = 'drop';
      npc.stateTimer = NPC.dropSeconds;
      return;
    case 'toSite':
      // The building may have been finished by the time they got here.
      if (npc.assignedSite < 0) {
        setIdle(npc, between(npc, NPC.idleMin, NPC.idleMax));
        return;
      }
      npc.state = 'work';
      npc.task = 'build';
      return;
    case 'goHome':
      npc.state = 'rest';
      npc.task = 'enterHouse';
      npc.stateTimer = NPC.enterHouseSeconds;
      return;
    case 'toSit':
      npc.state = 'rest';
      npc.task = 'sit';
      npc.stateTimer = between(npc, NPC.sitMin, NPC.sitMax);
      return;
    default:
      setIdle(npc, between(npc, NPC.idleMin, NPC.idleMax));
  }
}

/** Sits or stands around the camp's fire until invited. Travelers have no house, so night changes nothing. */
function updateWaitingTraveler(npc: NpcState, ctx: BrainContext): void {
  if (npc.arrived) {
    npc.arrived = false;
    npc.pathStatus = 'none';
    if (npc.task === 'toSit') {
      npc.state = 'rest';
      npc.task = 'sit';
      npc.stateTimer = between(npc, NPC.sitMin, NPC.sitMax);
    } else {
      setIdle(npc, between(npc, NPC.idleMin, NPC.idleMax));
    }
    return;
  }
  if (npc.state === 'walk') {
    if (npc.pathStatus === 'failed') setIdle(npc, between(npc, NPC.idleMin, NPC.idleMax));
    return;
  }
  if (npc.stateTimer > 0) return;
  const angle = nextRandom(npc) * Math.PI * 2;
  const radius = between(npc, NPC.travelerFireRingMin, NPC.travelerFireRingMax);
  if (!ctx.sites.nearestPoint(npc.campX + Math.cos(angle) * radius, npc.campZ + Math.sin(angle) * radius)) {
    setIdle(npc, NPC.idleMin);
    return;
  }
  walkTo(npc, nextRandom(npc) < 0.5 ? 'toSit' : 'loiter', ctx.sites.pointX, ctx.sites.pointZ);
  setFaceTarget(npc, npc.campX, npc.campZ);
}

/** Walks to the village fire, however long that takes and at any time of day. */
function updateJourney(npc: NpcState, ctx: BrainContext): void {
  if (npc.arrived) {
    npc.arrived = false;
    npc.pathStatus = 'none';
    settleTraveler(npc);
    npc.hasFaceTarget = false;
    setIdle(npc, between(npc, NPC.idleMin, NPC.idleMax));
    ctx.onSettled?.(npc);
    return;
  }
  if (npc.state === 'walk' && npc.pathStatus !== 'failed') return;
  if (npc.state === 'walk') {
    // Could not find a way or got stuck. Nothing about the journey has changed, so try again shortly.
    setIdle(npc, NPC.journeyRetrySeconds);
    return;
  }
  if (npc.stateTimer > 0) return;
  if (!walkToFire(npc, ctx, 'journey')) setIdle(npc, NPC.journeyRetrySeconds);
}

/** Runs one decision for one villager. */
export function updateBrain(npc: NpcState, ctx: BrainContext): void {
  if (npc.attentionTimer > 0) return;
  if (npc.travelPhase === 'waiting') {
    updateWaitingTraveler(npc, ctx);
    return;
  }
  if (npc.travelPhase === 'journey') {
    updateJourney(npc, ctx);
    return;
  }
  const phase = routinePhase(ctx.dayTime, npc.schedule);

  if (npc.indoors) {
    if (phase === 'night') return;
    // Morning: step back out of the door, then decide what to do.
    const door = ctx.sites.doors[npc.home];
    npc.indoors = false;
    npc.x = npc.prevX = door.x;
    npc.z = npc.prevZ = door.z;
    npc.facing = npc.prevFacing = 0;
    npc.hasFaceTarget = false;
    setIdle(npc, between(npc, NPC.morningPauseMin, NPC.morningPauseMax));
    return;
  }

  if (npc.arrived) {
    handleArrival(npc, ctx);
    return;
  }

  // Newly assigned to a site: drop whatever a free villager is doing and go.
  if (npc.assignedSite >= 0 && phase === 'day' && npc.task !== 'toSite' && npc.task !== 'build') {
    startBuilding(npc, ctx);
    return;
  }

  switch (npc.state) {
    case 'walk':
      if (npc.pathStatus === 'failed') {
        npc.targetTree = -1;
        setIdle(npc, between(npc, NPC.idleMin, NPC.idleMax));
      } else if (phase === 'night' && npc.task !== 'goHome' && npc.task !== 'deliver') {
        startGoingHome(npc, ctx);
      } else if (phase !== 'day' && (npc.task === 'toTree' || npc.task === 'toSite' || npc.task === 'toWorkplace')) {
        npc.targetTree = -1;
        chooseNext(npc, phase, ctx);
      } else if (npc.task === 'toSite' && npc.assignedSite < 0) {
        chooseNext(npc, phase, ctx);
      }
      return;
    case 'work':
      if (npc.task === 'produce') {
        if (npc.carrying || phase !== 'day') chooseNext(npc, phase, ctx);
        return;
      }
      if (npc.task === 'build') {
        // The site keeps the worker until it is done. At dusk they stop, but stay assigned.
        if (npc.assignedSite < 0 || phase !== 'day') chooseNext(npc, phase, ctx);
      } else if (npc.task === 'chop' && phase !== 'day') {
        // Quitting time: leave the unfinished log behind.
        npc.targetTree = -1;
        chooseNext(npc, phase, ctx);
      } else if (npc.stateTimer <= 0) {
        if (npc.task === 'chop') {
          npc.carrying = true;
          startDelivery(npc, ctx);
        } else {
          chooseNext(npc, phase, ctx);
        }
      }
      return;
    case 'rest':
      if (npc.task === 'enterHouse') {
        if (npc.stateTimer <= 0) {
          npc.indoors = true;
          npc.task = 'sleep';
          npc.speed = 0;
          npc.vx = npc.vz = 0;
        }
      } else if (npc.stateTimer <= 0 || phase === 'night') {
        chooseNext(npc, phase, ctx);
      }
      return;
    case 'idle':
      if (npc.stateTimer <= 0 || phase === 'night') chooseNext(npc, phase, ctx);
      return;
  }
}
