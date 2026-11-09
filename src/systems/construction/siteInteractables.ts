import { BUILDINGS, INTERACTION, type BuildingCost, type BuildingDefinition } from '../../config';
import type { GameState } from '../../core/GameState';
import type { Interactable } from '../interaction/InteractionSystem';
import { canAfford, fundSite, type BuildingSiteState } from './ConstructionState';

function costText(cost: BuildingCost): string {
  return `${cost.wood} wood, ${cost.coins} coins`;
}

function missingText(cost: BuildingCost, state: GameState): string {
  const parts: string[] = [];
  const wood = cost.wood - state.resources.wood;
  const coins = cost.coins - state.resources.coins;
  if (wood > 0) parts.push(`${wood} more wood`);
  if (coins > 0) parts.push(`${coins} more ${coins === 1 ? 'coin' : 'coins'}`);
  return parts.join(' and ');
}

function workerName(site: BuildingSiteState, state: GameState): string | null {
  const worker = state.npcs.find((npc) => npc.id === site.workerId);
  return worker ? worker.name : null;
}

function siteInteractable(site: BuildingSiteState, def: BuildingDefinition, state: GameState): Interactable {
  return {
    id: `site-${def.id}`,
    x: def.anchor[0],
    z: def.anchor[1],
    range: INTERACTION.siteRange,
    markerRadius: INTERACTION.siteMarker,
    isAvailable: () => true,
    isActionable: () => site.status !== 'available' || canAfford(def.cost, state.resources),
    prompt() {
      switch (site.status) {
        case 'available':
          return canAfford(def.cost, state.resources)
            ? `${def.style === 'bridge' ? 'Repair' : 'Build'} ${def.name} (${costText(def.cost)})`
            : `${def.name}: not enough (${costText(def.cost)})`;
        case 'funded':
          return `${def.name}: waiting for a builder`;
        case 'building':
          return `${def.name}: ${Math.floor(site.progress * 100)}% built`;
        case 'completed':
          return `Look at the ${def.name}`;
      }
    },
    interact() {
      if (site.status === 'completed') return `${def.name}: ${def.completedText}`;
      if (site.status !== 'available') {
        const name = workerName(site, state);
        return name ? `${name} is working on the ${def.name}. Builders stop at dusk and return in the morning.` : `The ${def.name} is paid for. The next free villager will start on it.`;
      }
      if (fundSite(site, def.cost, state.resources) === 'insufficient') {
        return `The ${def.name} costs ${costText(def.cost)}. You need ${missingText(def.cost, state)}.`;
      }
      return `Materials paid: ${costText(def.cost)}. A free villager will ${def.style === 'bridge' ? 'repair' : 'build'} the ${def.name}.`;
    },
  };
}

export function createSiteInteractables(state: GameState): Interactable[] {
  return BUILDINGS.map((def, index) => siteInteractable(state.construction[index], def, state));
}
