import { KINGDOM, NPC, WORLD } from '../../config';
import { postNotice, type GameState } from '../../core/GameState';
import { createNpc, type NpcState } from '../../entities/Npc';
import { walkTo } from '../npc/NpcBrain';
import type { SiteQueries } from '../npc/VillageSites';
import { exchange } from '../Resources';

/** A visitor using the same NPC path queue, locomotion and view as the village population. */
export class MerchantSystem {
  readonly npc: NpcState;
  constructor(private readonly state: GameState, private readonly sites: SiteQueries, height: (x: number, z: number) => number) {
    const saved = state.kingdom.merchant;
    if (sites.nearestPoint(saved.x, saved.z)) { saved.x = sites.pointX; saved.z = sites.pointZ; }
    this.npc = createNpc({ ...NPC.travelers[0], id: 'merchant', name: 'Rowan the merchant', walkSpeed: KINGDOM.merchant.walkSpeed }, saved.x, height(saved.x, saved.z), saved.z, WORLD.seed, 9);
    this.npc.dormant = saved.phase === 'away';
  }
  update(): void {
    const m = this.state.kingdom.merchant;
    const now = this.state.time.day + this.state.time.dayTime;
    if (m.phase === 'away' && this.state.time.day >= m.nextVisitDay) {
      m.phase = 'arriving';
      // Skip missed visits rather than replaying a caravan for every skipped day.
      m.nextVisitDay = this.state.time.day + KINGDOM.merchant.intervalDays;
      this.npc.dormant = false;
      this.npc.stateTimer = 0;
    }
    if (m.phase === 'visiting' && now >= m.departAt) {
      m.phase = 'leaving'; this.npc.stateTimer = 0;
    }
    m.x = this.npc.x; m.z = this.npc.z;
  }
  decide(): void {
    const m = this.state.kingdom.merchant;
    const npc = this.npc;
    if (m.phase === 'away') return;
    if (m.phase === 'visiting') {
      npc.state = 'idle'; npc.task = 'none'; npc.pathStatus = 'none';
      return;
    }
    if (npc.arrived) {
      npc.arrived = false; npc.pathStatus = 'none'; npc.state = 'idle'; npc.task = 'none';
      if (m.phase === 'arriving') {
        m.phase = 'visiting';
        m.departAt = this.state.time.day + this.state.time.dayTime + KINGDOM.merchant.visitDays;
        postNotice(this.state, 'Rowan has arrived at the village market. Trade surplus wood or furs for coins.');
      } else {
        m.phase = 'away'; npc.dormant = true;
        m.nextVisitDay = Math.max(m.nextVisitDay, this.state.time.day + 1);
      }
      return;
    }
    if (npc.state === 'walk' && npc.pathStatus !== 'failed') return;
    if (npc.pathStatus === 'failed') {
      npc.state = 'idle'; npc.pathStatus = 'none'; npc.stateTimer = KINGDOM.merchant.retrySeconds;
      return;
    }
    if (npc.stateTimer > 0) return;
    const target = m.phase === 'arriving' ? KINGDOM.merchant.market : KINGDOM.merchant.entrance;
    if (this.sites.nearestPoint(target[0], target[1])) walkTo(npc, 'journey', this.sites.pointX, this.sites.pointZ);
  }
}

export function trade(state: GameState, id: string): string {
  if (state.kingdom.merchant.phase !== 'visiting') return 'The merchant is not trading right now.';
  const offer = KINGDOM.trades.find((t) => t.id === id);
  if (!offer) return 'That trade is unavailable.';
  if (!exchange(state.resources, offer.cost, offer.reward)) return 'Not enough resources for that trade.';
  return `Trade completed: ${offer.label.toLowerCase()}.`;
}
