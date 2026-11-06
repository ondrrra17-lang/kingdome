import { EXPLORATION, KINGDOM } from '../../config';
import { postNotice, type GameState } from '../../core/GameState';
import { addWood, exchange } from '../Resources';

export function collectSupplies(state: GameState): string {
  if (state.kingdom.events.cacheCollected) return 'The supply cache is empty.';
  state.kingdom.events.cacheCollected = true;
  state.resources.food += KINGDOM.events.cache.food;
  const wood = addWood(state.resources, KINGDOM.events.cache.wood);
  const message = `Lost supplies recovered: ${KINGDOM.events.cache.food} food and ${wood} wood${wood < KINGDOM.events.cache.wood ? ' (wood storage is full)' : ''}.`;
  // The cache disappears, so its interaction feedback loses focus on the next step.
  postNotice(state, message);
  return message;
}
export function hearRumor(state: GameState): string {
  const events = state.kingdom.events;
  const previous = EXPLORATION.treasures.find((t) => t.id === events.rumorTreasureId);
  if (events.rumorHeard && previous && !state.exploration.treasures.find((t) => t.id === previous.id)?.opened) return `Wren: "That chest is still near ${nearestLandmark(previous.x, previous.z)}."`;
  if (events.rumorHeard) return 'Wren: "You have already followed my lead. Safe travels."';
  const treasure = EXPLORATION.treasures.find((t) => !state.exploration.treasures.find((s) => s.id === t.id)?.opened);
  if (!treasure) return 'Wren: "You have found every chest I know about."';
  events.rumorHeard = true; events.rumorTreasureId = treasure.id;
  return `Wren: "I saw an unopened chest near ${nearestLandmark(treasure.x, treasure.z)}. Follow the paths and look around."`;
}
function nearestLandmark(x: number, z: number): string {
  let nearest = EXPLORATION.landmarks[0];
  for (const place of EXPLORATION.landmarks) if (Math.hypot(place.x - x, place.z - z) < Math.hypot(nearest.x - x, nearest.z - z)) nearest = place;
  return nearest.name;
}
export function villageRequest(state: GameState): string {
  const events = state.kingdom.events;
  const request = KINGDOM.events.request;
  if (events.request === 'completed') return 'Alda: "Thank you. Those supplies made a difference."';
  if (events.request === 'available') {
    events.request = 'active';
    return `Alda needs ${request.wood} wood for repairs. Bring it back for ${request.coins} coins.`;
  }
  if (!exchange(state.resources, { wood: request.wood }, { coins: request.coins })) return `Alda still needs ${request.wood} wood. Return when you have enough.`;
  events.request = 'completed';
  return `Village request completed: delivered ${request.wood} wood, earned ${request.coins} coins.`;
}
