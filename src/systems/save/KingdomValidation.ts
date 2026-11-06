import { EXPLORATION } from '../../config';
import { createKingdomState, type FieldStage, type KingdomState, type MerchantPhase } from '../economy/KingdomState';

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** Repairs each new field independently; never lets scene objects or paths into state. */
export function checkKingdom(value: unknown, day: number, repairs: string[]): KingdomState {
  const out = createKingdomState(day);
  const raw = record(value);
  const field = record(raw.field), merchant = record(raw.merchant), events = record(raw.events);
  const num = (key: string, value: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) return value;
    if (value !== undefined) repairs.push(`${key} was invalid`);
    return fallback;
  };
  out.foodPaidThroughDay = Math.floor(num('food day', raw.foodPaidThroughDay, day, 1));
  const stages: FieldStage[] = ['empty', 'growing', 'mature', 'harvested'];
  out.field.stage = stages.includes(field.stage as FieldStage) ? field.stage as FieldStage : 'empty';
  out.field.progress = num('field progress', field.progress, 0, 0, 1);
  if (out.field.stage === 'harvested') out.field.progress = 1;
  const phases: MerchantPhase[] = ['away', 'arriving', 'visiting', 'leaving'];
  out.merchant.phase = phases.includes(merchant.phase as MerchantPhase) ? merchant.phase as MerchantPhase : 'away';
  out.merchant.nextVisitDay = Math.floor(num('merchant day', merchant.nextVisitDay, out.merchant.nextVisitDay, 1));
  out.merchant.departAt = num('merchant departure', merchant.departAt, day, 0);
  out.merchant.x = num('merchant x', merchant.x, out.merchant.x, -200, 200);
  out.merchant.z = num('merchant z', merchant.z, out.merchant.z, -100, 100);
  out.events.cacheCollected = events.cacheCollected === true;
  out.events.rumorHeard = events.rumorHeard === true;
  out.events.rumorTreasureId = typeof events.rumorTreasureId === 'string' && EXPLORATION.treasures.some((t) => t.id === events.rumorTreasureId) ? events.rumorTreasureId : null;
  out.events.request = events.request === 'active' || events.request === 'completed' ? events.request : 'available';
  return out;
}
