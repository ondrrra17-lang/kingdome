import { ECONOMY } from '../../config';
import { postNotice, type GameState } from '../../core/GameState';
import { villagerCount } from '../Recruitment';

export function dailyFood(state: GameState): number {
  return Math.ceil(villagerCount(state.npcs) / ECONOMY.villagersPerFood);
}
export function workEfficiency(state: GameState): number {
  return state.resources.food > 0 ? 1 : ECONOMY.shortageEfficiency;
}
/** A persisted high-water mark makes midnight, forward/backward skips and reload idempotent. */
export class FoodSystem {
  constructor(private readonly state: GameState) {}
  update(): void {
    const s = this.state;
    const days = s.time.day - s.kingdom.foodPaidThroughDay;
    if (days <= 0) return;
    const eaten = Math.min(s.resources.food, dailyFood(s) * days);
    s.resources.food -= eaten;
    s.kingdom.foodPaidThroughDay = s.time.day;
    postNotice(s, eaten > 0 ? `The village used ${eaten} food. ${s.resources.food} remains.` : 'No food in storage. Work is slower; a farmer or hunter can restore supplies.', true);
  }
}
