import { ECONOMY } from '../config';
import type { NpcState } from '../entities/Npc';
import type { VillageLimits } from './construction/ConstructionState';
import { trySpendCoins, type ResourceState } from './Resources';

export type RecruitResult = 'recruited' | 'not-available' | 'limit-reached';
export type InviteResult = 'invited' | 'not-available' | 'no-coins';

/** Someone unemployed and not already on a building site. */
export function canBeRecruited(npc: NpcState): boolean {
  return npc.job === 'villager' && npc.assignedSite < 0;
}

/** Everyone who lives in the village. A traveler only counts on arrival. */
export function villagerCount(npcs: readonly NpcState[]): number {
  let count = 0;
  for (let i = 0; i < npcs.length; i++) if (npcs[i].job !== 'traveler') count++;
  return count;
}

export function woodcutterCount(npcs: readonly NpcState[]): number {
  let count = 0;
  for (let i = 0; i < npcs.length; i++) if (npcs[i].job === 'woodcutter') count++;
  return count;
}

export function hasWoodcutterSlot(limits: VillageLimits, npcs: readonly NpcState[]): boolean {
  return woodcutterCount(npcs) < limits.maxWoodcutters;
}

/** Pays a traveler to set off for the village. On failure nothing changes. */
export function inviteTraveler(npc: NpcState, resources: Pick<ResourceState, 'coins'>): InviteResult {
  if (npc.travelPhase !== 'waiting') return 'not-available';
  if (!trySpendCoins(resources, ECONOMY.travelerInviteCost)) return 'no-coins';
  npc.travelPhase = 'journey';
  npc.dormant = false;
  npc.state = 'idle';
  npc.task = 'none';
  npc.stateTimer = 0;
  npc.pathStatus = 'none';
  npc.pathLength = 0;
  npc.arrived = false;
  npc.hasFaceTarget = false;
  return 'invited';
}

/** A traveler reaching the village becomes an ordinary, unemployed villager. */
export function settleTraveler(npc: NpcState): void {
  npc.job = 'villager';
  npc.travelPhase = 'settled';
}

/** Gives an unemployed villager the woodcutter's job, which is free. On failure nothing changes. */
export function recruitWoodcutter(npc: NpcState, limits: VillageLimits, npcs: readonly NpcState[]): RecruitResult {
  if (!canBeRecruited(npc)) return 'not-available';
  if (!hasWoodcutterSlot(limits, npcs)) return 'limit-reached';
  npc.job = 'woodcutter';
  npc.state = 'idle';
  npc.task = 'none';
  npc.stateTimer = 0.8;
  npc.pathStatus = 'none';
  npc.pathLength = 0;
  npc.arrived = false;
  npc.hasFaceTarget = false;
  return 'recruited';
}
