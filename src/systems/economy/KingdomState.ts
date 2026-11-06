import { KINGDOM } from '../../config';

export type FieldStage = 'empty' | 'growing' | 'mature' | 'harvested';
export type MerchantPhase = 'away' | 'arriving' | 'visiting' | 'leaving';
export interface KingdomState {
  foodPaidThroughDay: number;
  field: { stage: FieldStage; progress: number };
  merchant: { phase: MerchantPhase; nextVisitDay: number; departAt: number; x: number; z: number };
  events: { cacheCollected: boolean; rumorTreasureId: string | null; rumorHeard: boolean; request: 'available' | 'active' | 'completed' };
}
export function createKingdomState(day = 1): KingdomState {
  return {
    foodPaidThroughDay: day,
    field: { stage: 'empty', progress: 0 },
    merchant: { phase: 'away', nextVisitDay: Math.max(KINGDOM.merchant.firstDay, day + 1), departAt: 0, x: KINGDOM.merchant.entrance[0], z: KINGDOM.merchant.entrance[1] },
    events: { cacheCollected: false, rumorTreasureId: null, rumorHeard: false, request: 'available' },
  };
}
