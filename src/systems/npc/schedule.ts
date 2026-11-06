import { NPC } from '../../config';

export type DayPhase = 'day' | 'evening' | 'night';

/** One villager's daily times, as fractions of a day. */
export interface DaySchedule {
  wake: number;
  evening: number;
  bed: number;
}

/** Each villager gets slightly different times, so the village never moves in lockstep. */
export function createSchedule(random: () => number): DaySchedule {
  const { wake, evening, bed, variation } = NPC.schedule;
  const vary = (): number => (random() * 2 - 1) * variation;
  return { wake: wake + vary(), evening: evening + vary(), bed: bed + vary() };
}

export function routinePhase(dayTime: number, schedule: DaySchedule): DayPhase {
  if (dayTime < schedule.wake || dayTime >= schedule.bed) return 'night';
  return dayTime >= schedule.evening ? 'evening' : 'day';
}
