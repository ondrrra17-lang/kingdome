import { KINGDOM, NPC } from '../../config';
import { postNotice, type GameState } from '../../core/GameState';
import type { NpcState } from '../../entities/Npc';
import { routinePhase } from '../npc/schedule';
import { workEfficiency } from './FoodSystem';
import type { BuildingSiteState } from '../construction/ConstructionState';

export function deliverProduce(state: GameState, npc: NpcState): void {
  const food = npc.cargoFood;
  const furs = npc.cargoFurs;
  state.resources.food += food;
  state.resources.furs += furs;
  npc.cargoFood = npc.cargoFurs = 0;
  npc.carrying = false;
  if (food || furs) postNotice(state, `${npc.name} delivered ${food} food${furs ? ` and ${furs} fur` : ''} to storage.`);
}

/** Production advances only while physically working, independently of camera visibility. */
export class ProductionSystem {
  private readonly farm: BuildingSiteState | undefined;
  private readonly lodge: BuildingSiteState | undefined;
  constructor(private readonly state: GameState) {
    this.farm = state.construction.find((s) => s.id === KINGDOM.farm.building);
    this.lodge = state.construction.find((s) => s.id === KINGDOM.hunt.building);
  }
  update(dt: number): void {
    const state = this.state;
    const efficiency = workEfficiency(state);
    for (const npc of state.npcs) {
      if ((npc.job !== 'farmer' && npc.job !== 'hunter') || npc.task !== 'produce' || npc.state !== 'work'
        || npc.indoors || npc.attentionTimer > 0 || npc.carrying || routinePhase(state.time.dayTime, npc.schedule) !== 'day'
        || Math.hypot(npc.x - npc.goalX, npc.z - npc.goalZ) > NPC.closeEnough + NPC.radius) continue;
      const farmer = npc.job === 'farmer';
      const building = farmer ? KINGDOM.farm.building : KINGDOM.hunt.building;
      if (npc.workplace !== building || (farmer ? this.farm : this.lodge)?.status !== 'completed') continue;
      const field = state.kingdom.field;
      if (farmer && field.stage === 'harvested') { field.progress = 0; field.stage = 'empty'; }
      const progress = Math.min(1, (farmer ? field.progress : npc.productionProgress) + dt * efficiency / (farmer ? KINGDOM.farm.seconds : KINGDOM.hunt.seconds));
      if (farmer) {
        field.progress = progress;
        field.stage = progress >= KINGDOM.farm.matureAt ? 'mature' : 'growing';
      } else npc.productionProgress = progress;
      if (progress < 1) continue;
      npc.cargoFood = farmer ? KINGDOM.farm.food : KINGDOM.hunt.food;
      if (farmer) {
        field.stage = 'harvested';
        postNotice(state, `${npc.name} harvested ${npc.cargoFood} food and is carrying it to storage.`);
      }
      else {
        npc.huntCycles++;
        npc.cargoFurs = npc.huntCycles % KINGDOM.hunt.furEveryCycles === 0 ? KINGDOM.hunt.furs : 0;
        npc.productionProgress = 0;
      }
      npc.carrying = true;
      npc.stateTimer = 0;
    }
  }
}
