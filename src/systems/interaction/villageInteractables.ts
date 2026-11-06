import { BUILDINGS, ECONOMY, INTERACTION, NPC, WORLD } from '../../config';
import type { GameState } from '../../core/GameState';
import type { NpcState } from '../../entities/Npc';
import { houseDoorPoint } from '../../world/WorldData';
import { routinePhase } from '../npc/schedule';
import { canBeRecruited, hasWoodcutterSlot, inviteTraveler, recruitWoodcutter } from '../Recruitment';
import { createSiteInteractables } from '../construction/siteInteractables';
import type { Interactable } from './InteractionSystem';

function names(list: readonly NpcState[]): string {
  const all = list.map((npc) => npc.name);
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : (all[0] ?? 'nobody');
}

function describeWork(npc: NpcState): string {
  if (npc.task === 'chop') return 'is chopping a tree';
  if (npc.carrying) return 'is hauling logs to the pile';
  if (npc.task === 'toTree') return 'is heading to a tree';
  return 'is taking a break';
}

/** What using a traveler means, before they have become an ordinary villager. */
function talkToTraveler(npc: NpcState, state: GameState): string {
  const cost = ECONOMY.travelerInviteCost;
  if (npc.travelPhase === 'journey') return `${npc.name}: "I know the way. See you by the fire."`;
  npc.attentionTimer = NPC.attentionSeconds;
  if (inviteTraveler(npc, state.resources) === 'no-coins') {
    return `${npc.name}: "It's a long road, and I'd need ${cost} coins to take it." You have ${state.resources.coins}.`;
  }
  npc.attentionTimer = 1.2;
  return `${npc.name} shoulders a pack and sets off for the village.`;
}

function villager(npc: NpcState, state: GameState): Interactable {
  const range = INTERACTION.villagerRange;
  return {
    id: npc.id,
    get x() { return npc.x; },
    get z() { return npc.z; },
    range,
    markerRadius: INTERACTION.villagerMarker,
    isAvailable: () => !npc.indoors,
    isActionable: () => npc.travelPhase !== 'waiting' || state.resources.coins >= ECONOMY.travelerInviteCost,
    prompt() {
      if (npc.travelPhase === 'waiting') return `Invite ${npc.name} to the village (${ECONOMY.travelerInviteCost} coins)`;
      if (npc.travelPhase === 'journey') return `Talk to ${npc.name}`;
      if (canBeRecruited(npc) && hasWoodcutterSlot(state.village, state.npcs)) return `Recruit ${npc.name} as a woodcutter (free)`;
      return `Talk to ${npc.name}`;
    },
    interact() {
      if (npc.travelPhase !== 'settled') return talkToTraveler(npc, state);
      npc.attentionTimer = NPC.attentionSeconds;
      if (npc.job === 'gatherer') return `${npc.name}: "Somebody has to keep that fire going."`;
      if (npc.assignedSite >= 0) return `${npc.name} is building the ${BUILDINGS[npc.assignedSite].name}.`;
      if (npc.job === 'woodcutter') {
        return `${npc.name} ${describeWork(npc)}. Delivered so far: ${npc.woodDelivered} wood.`;
      }
      const result = recruitWoodcutter(npc, state.village, state.npcs);
      if (result === 'limit-reached') {
        const { maxWoodcutters } = state.village;
        return `The village can only support ${maxWoodcutters} woodcutter${maxWoodcutters === 1 ? '' : 's'}. ${state.construction.some((s) => s.id === 'hut' && s.status !== 'completed') ? "A Woodcutter's Hut would make room for another." : ''}`.trim();
      }
      const startsNow = routinePhase(state.time.dayTime, npc.schedule) === 'day';
      return `${npc.name} is now a woodcutter. ${startsNow ? 'Off to the trees.' : 'Work starts in the morning.'}`;
    },
  };
}

/** Builds every interactable in the village. Each one reads live state when used. */
export function createVillageInteractables(state: GameState): Interactable[] {
  const items: Interactable[] = state.npcs.map((npc) => villager(npc, state));
  items.push(...createSiteInteractables(state));

  const fire = WORLD.campfire;
  items.push({
    id: 'campfire',
    x: fire.x,
    z: fire.z,
    range: INTERACTION.campfireRange,
    markerRadius: INTERACTION.campfireMarker,
    isAvailable: () => true,
    prompt: () => 'Warm up at the campfire',
    interact() {
      const nearby = state.npcs.filter((npc) => !npc.indoors && Math.hypot(npc.x - fire.x, npc.z - fire.z) < NPC.fireRingMax + 2);
      return nearby.length > 0
        ? `You warm your hands. ${names(nearby)} ${nearby.length > 1 ? 'are' : 'is'} here too.`
        : 'You warm your hands. Nobody else is around.';
    },
  });

  const pile = WORLD.woodpile;
  items.push({
    id: 'woodpile',
    x: pile.x,
    z: pile.z,
    range: INTERACTION.woodpileRange,
    markerRadius: INTERACTION.woodpileMarker,
    isAvailable: () => true,
    prompt: () => 'Check the wood pile',
    interact: () => `The wood pile holds ${state.resources.wood} of ${state.resources.woodCapacity} wood.`,
  });

  WORLD.houses.forEach((house, index) => {
    const door = houseDoorPoint(house);
    items.push({
      id: `house-${index}`,
      x: door.standX,
      z: door.standZ,
      range: INTERACTION.houseRange,
      markerRadius: INTERACTION.houseMarker,
      isAvailable: () => true,
      prompt: () => `Knock at ${house.name}`,
      interact() {
        // Asked each time: a traveler who has settled here lives here from then on.
        const residents = state.npcs.filter((npc) => npc.home === index && npc.travelPhase === 'settled');
        const home = residents.filter((npc) => npc.indoors);
        const who = `${house.name} is home to ${names(residents)}.`;
        return home.length > 0 ? `${who} ${names(home)} ${home.length > 1 ? 'are' : 'is'} inside.` : `${who} Nobody answers.`;
      },
    });
  });
  return items;
}
