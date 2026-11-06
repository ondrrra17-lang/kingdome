import { EXPLORATION, INTERACTION, type LandmarkDefinition, type TreasureDefinition } from '../../config';
import type { GameState } from '../../core/GameState';
import type { Interactable } from '../interaction/InteractionSystem';
import { openedTreasureCount, openTreasure, type TreasureState } from './ExplorationState';

function treasureInteractable(treasure: TreasureState, def: TreasureDefinition, state: GameState): Interactable {
  return {
    id: def.id,
    x: def.x,
    z: def.z,
    range: INTERACTION.treasureRange,
    markerRadius: INTERACTION.treasureMarker,
    // An opened chest stays usable, so the reward message is not cleared the moment it is taken.
    isAvailable: () => true,
    prompt: () => (treasure.opened ? 'Look in the empty chest' : 'Open the chest'),
    interact() {
      const coins = openTreasure(treasure, def, state.resources);
      if (coins === 0) return 'Empty. You already took what was here.';
      const { exploration } = state;
      return `You found ${coins} coins! (${openedTreasureCount(exploration)} of ${exploration.treasures.length} chests)`;
    },
  };
}

function landmarkInteractable(def: LandmarkDefinition): Interactable {
  return {
    id: `landmark-${def.id}`,
    x: def.anchor[0],
    z: def.anchor[1],
    range: INTERACTION.landmarkRange,
    markerRadius: INTERACTION.landmarkMarker,
    isAvailable: () => true,
    prompt: () => def.prompt,
    interact: () => def.inspectText,
  };
}

/** Everything out in the forest that can be used with E. Travelers are villagers, and handled with them. */
export function createExplorationInteractables(state: GameState): Interactable[] {
  const treasures = EXPLORATION.treasures.map((def, i) => treasureInteractable(state.exploration.treasures[i], def, state));
  const landmarks = EXPLORATION.landmarks.map(landmarkInteractable);
  return [...treasures, ...landmarks];
}
