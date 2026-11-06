import { ECONOMY } from '../config';
import { postNotice, type GameState } from '../core/GameState';

/**
 * A small village tithe at each new day. Without any income the 5 starting coins
 * cover only one or two buildings. Set ECONOMY.dailyCoins to 0 to turn it off.
 */
export class DailyIncome {
  /** Highest day already paid, so scrubbing the debug clock back and forth pays once. */
  private paidThroughDay: number;

  constructor(private readonly state: GameState) {
    this.paidThroughDay = state.time.day;
  }

  update(): void {
    const { time, resources } = this.state;
    if (time.day <= this.paidThroughDay) return;
    this.paidThroughDay = time.day;
    if (ECONOMY.dailyCoins <= 0) return;
    resources.coins += ECONOMY.dailyCoins;
    postNotice(this.state, `Day ${time.day}: the village pays ${ECONOMY.dailyCoins} coins in tithes.`);
  }
}
