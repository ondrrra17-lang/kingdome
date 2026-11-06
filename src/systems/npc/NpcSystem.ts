import { NPC } from '../../config';
import { postNotice, type GameState } from '../../core/GameState';
import type { NpcState } from '../../entities/Npc';
import type { Pathfinder } from '../navigation/Pathfinder';
import { updateBrain, type BrainContext } from './NpcBrain';
import { stepLocomotion, type LocomotionWorld } from './NpcLocomotion';
import type { SiteQueries } from './VillageSites';
import { workEfficiency } from '../economy/FoodSystem';
import { deliverProduce } from '../economy/ProductionSystem';

function isDormant(npc: NpcState, playerX: number, playerZ: number): boolean {
  if (npc.travelPhase !== 'waiting') return false;
  const dx = npc.x - playerX;
  const dz = npc.z - playerZ;
  return dx * dx + dz * dz > NPC.travelerActiveRadius * NPC.travelerActiveRadius;
}

/**
 * Runs all villagers inside the fixed simulation step. Movement runs every step;
 * decisions run at NPC.decisionInterval; at most NPC.maxPathsPerStep searches run
 * per step, so several villagers changing plans at once cannot cause a spike.
 * Travelers still waiting far from the player are not simulated at all.
 */
export class NpcSystem {
  private readonly actors: readonly NpcState[];
  private readonly context: BrainContext;
  private pathCursor = 0;

  constructor(
    private readonly state: GameState,
    sites: SiteQueries,
    private readonly pathfinder: Pathfinder,
    private readonly world: LocomotionWorld,
    private readonly visitor?: { npc: NpcState; decide(): void },
  ) {
    this.actors = visitor ? [...state.npcs, visitor.npc] : state.npcs;
    this.context = {
      dayTime: state.time.dayTime,
      resources: state.resources,
      sites,
      npcs: state.npcs,
      onSettled: (npc) => postNotice(state, `${npc.name} has reached the village and is ready for work.`),
      onProduceDelivery: (npc) => deliverProduce(state, npc),
    };
  }

  update(dt: number): void {
    const { player } = this.state;
    const npcs = this.actors;
    this.context.dayTime = this.state.time.dayTime;

    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (npc !== this.visitor?.npc) npc.dormant = isDormant(npc, player.x, player.z);
      if (npc.dormant) continue;
      if (npc.attentionTimer > 0) {
        npc.attentionTimer -= dt;
      } else {
        npc.stateTimer -= dt * (npc.state === 'work' ? workEfficiency(this.state) : 1);
      }
      npc.decisionTimer -= dt;
      // Arrivals skip the wait, so nobody stands confused at their destination.
      if (npc.decisionTimer <= 0 || npc.arrived) {
        npc.decisionTimer += NPC.decisionInterval;
        if (npc.decisionTimer <= 0) npc.decisionTimer = NPC.decisionInterval;
        if (npc === this.visitor?.npc) this.visitor.decide();
        else updateBrain(npc, this.context);
      }
    }

    this.servicePathRequests(npcs);

    for (let i = 0; i < npcs.length; i++) {
      if (!npcs[i].dormant) stepLocomotion(npcs[i], dt, npcs, player.x, player.z, this.world);
    }
  }

  private servicePathRequests(npcs: readonly NpcState[]): void {
    let budget = NPC.maxPathsPerStep;
    for (let i = 0; i < npcs.length && budget > 0; i++) {
      const npc = npcs[(this.pathCursor + i) % npcs.length];
      if (npc.pathStatus !== 'pending' || npc.state !== 'walk' || npc.dormant) continue;
      budget--;
      const count = this.pathfinder.find(npc.x, npc.z, npc.goalX, npc.goalZ, npc.pathX, npc.pathZ);
      if (count < 0) {
        npc.pathStatus = 'failed';
      } else {
        npc.pathLength = count;
        npc.pathIndex = 0;
        npc.pathStatus = 'ready';
      }
      this.pathCursor = (this.pathCursor + i + 1) % npcs.length;
    }
  }
}
