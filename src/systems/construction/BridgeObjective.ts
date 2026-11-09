import { BUILDINGS } from '../../config';
import type { GameState } from '../../core/GameState';

/** Derived from persisted game progress, so the journal never disagrees with the world. */
export function bridgeObjective(state: GameState): { title: string; detail: string; progress: number | null; done: boolean } {
  const site = state.construction.find((s) => s.id === 'bridge')!;
  const def = BUILDINGS.find((b) => b.id === 'bridge')!;
  if (site.status === 'completed') {
    const reached = state.exploration.landmarks.some((l) => l.id === 'traveler-camp' && l.discovered);
    return reached
      ? { title: 'A path through the valley', detail: 'Complete. The bridge is restored and the travelers\' camp is found.', progress: null, done: true }
      : { title: 'The east bank is open', detail: 'Cross the bridge. Follow the road east, then north to find the travelers\' camp and new villagers.', progress: null, done: false };
  }
  if (site.status === 'building') return {
    title: 'Restore the Old Bridge', detail: `Repairing: ${Math.floor(site.progress * 100)}%. Work pauses at dusk and resumes in the morning.`, progress: site.progress, done: false,
  };
  if (site.status === 'funded') return {
    title: 'Restore the Old Bridge', detail: 'Materials paid. Keep one villager unemployed to repair the crossing during daylight (R: Professions).', progress: site.progress, done: false,
  };
  const wood = Math.min(state.resources.wood, def.cost.wood);
  const coins = Math.min(state.resources.coins, def.cost.coins);
  const hasWoodcutter = state.npcs.some((n) => n.job === 'woodcutter');
  const next = wood < def.cost.wood
    ? hasWoodcutter ? 'Let your woodcutter deliver wood to storage.' : 'Press R near a villager and assign a woodcutter for free.'
    : coins < def.cost.coins ? 'Earn coins by trading or wait for the next daily allowance.' : 'Follow the main road east. Press E at the sign on the west bank.';
  return { title: 'Restore the Old Bridge', detail: `${wood}/${def.cost.wood} wood, ${coins}/${def.cost.coins} coins. ${next} Repair it to reach the eastern woods and new villagers.`, progress: null, done: false };
}
