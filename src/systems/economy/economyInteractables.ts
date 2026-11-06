import { KINGDOM } from '../../config';
import type { GameState } from '../../core/GameState';
import type { Interactable } from '../interaction/InteractionSystem';
import { collectSupplies } from './WorldEvents';

export function createEconomyInteractables(state: GameState, openTrade: () => void): Interactable[] {
  return [
    {
      id: 'merchant-market',
      get x() { return state.kingdom.merchant.x; }, get z() { return state.kingdom.merchant.z; },
      range: 2.6, markerRadius: 1.1,
      isAvailable: () => state.kingdom.merchant.phase === 'visiting',
      prompt: () => 'Trade with Rowan',
      interact: () => { openTrade(); return 'The merchant opens the cart. Choose a trade.'; },
    },
    {
      id: KINGDOM.events.cache.id, x: KINGDOM.events.cache.x + 0.8, z: KINGDOM.events.cache.z,
      range: 2.1, markerRadius: 0.8,
      isAvailable: () => !state.kingdom.events.cacheCollected,
      prompt: () => 'Recover the lost supplies', interact: () => collectSupplies(state),
    },
  ];
}
