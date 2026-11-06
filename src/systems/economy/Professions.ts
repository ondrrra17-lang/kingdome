import { KINGDOM } from '../../config';
import type { GameState } from '../../core/GameState';
import type { NpcState } from '../../entities/Npc';

export type Profession = 'villager' | 'woodcutter' | 'farmer' | 'hunter';
export const PROFESSIONS: readonly Profession[] = ['villager', 'woodcutter', 'farmer', 'hunter'];
export function professionProblem(state: GameState, npc: NpcState, job: Profession): string | null {
  if (npc.travelPhase !== 'settled' || npc.job === 'gatherer') return 'This villager cannot change profession.';
  if (npc.assignedSite >= 0) return 'Finish the current construction assignment first.';
  if (npc.carrying) return 'Deliver the current load before changing profession.';
  if (npc.job === job) return null;
  const limit = job === 'woodcutter' ? state.village.maxWoodcutters : job === 'farmer' ? KINGDOM.farm.slots : KINGDOM.hunt.slots;
  const building = job === 'farmer' ? KINGDOM.farm.building : job === 'hunter' ? KINGDOM.hunt.building : null;
  if (building && !state.construction.some((s) => s.id === building && s.status === 'completed')) return `Build the ${job === 'farmer' ? 'Small Farm' : "Hunter's Lodge"} first.`;
  if (job !== 'villager' && state.npcs.filter((n) => n.job === job).length >= limit) return `No ${job} workplace is free.`;
  return null;
}
/** Free, validated job change; cargo cannot be discarded or reinterpreted as another product. */
export function assignProfession(state: GameState, npc: NpcState, job: Profession): string | null {
  if (!PROFESSIONS.includes(job)) return 'Unknown profession.';
  const problem = professionProblem(state, npc, job);
  if (problem || npc.job === job) return problem;
  npc.job = job;
  npc.workplace = job === 'farmer' ? 'farm' : job === 'hunter' ? 'lodge' : null;
  npc.productionProgress = 0;
  npc.targetTree = -1;
  npc.state = 'idle'; npc.task = 'none'; npc.stateTimer = 0;
  npc.pathStatus = 'none'; npc.pathLength = 0; npc.arrived = false;
  npc.hasFaceTarget = false;
  return null;
}
