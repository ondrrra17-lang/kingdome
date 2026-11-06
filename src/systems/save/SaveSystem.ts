import { SAVE } from '../../config';
import type { GameState } from '../../core/GameState';
import { createSave } from './SaveData';
import type { SaveStore, WriteResult } from './SaveStore';

export type SaveReason = 'manual' | 'auto';

/** Runs a job when the browser has a moment to spare, outside the frame being drawn. */
type Schedule = (job: () => void) => void;

const defaultSchedule: Schedule = (job) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(job, { timeout: 1000 });
  else setTimeout(job, 0);
};

/**
 * Decides when to save: on a timer, and soon after anything significant happens, which it
 * notices by comparing a short summary of the game's progress. Nothing else in the game has
 * to remember to ask for a save. Automatic saves never run inside a frame.
 */
export class SaveSystem {
  /** Told after each attempt, so the interface can report it. */
  onResult: ((result: WriteResult, reason: SaveReason) => void) | null = null;
  private sinceCheck = 0;
  private sinceSave = 0;
  private shownProgress: string;
  private scheduled = false;
  private stopped = false;

  constructor(
    private readonly state: GameState,
    private readonly store: SaveStore,
    private readonly schedule: Schedule = defaultSchedule,
    private readonly now: () => number = Date.now,
  ) {
    this.shownProgress = this.progress();
  }

  /** Call once per rendered frame with real elapsed time. */
  update(frameDt: number): void {
    if (this.stopped) return;
    this.sinceCheck += frameDt;
    this.sinceSave += frameDt;
    if (this.sinceCheck < SAVE.progressCheckSeconds) return;
    this.sinceCheck = 0;

    const progress = this.progress();
    const changed = progress !== this.shownProgress;
    if (this.sinceSave >= SAVE.autoSaveSeconds || (changed && this.sinceSave >= SAVE.minSecondsBetweenSaves)) {
      this.shownProgress = progress;
      this.sinceSave = 0;
      this.saveLater();
    }
  }

  /** Saves right now. For the player's own save, and for leaving the page. */
  saveNow(reason: SaveReason): WriteResult {
    if (this.stopped) return { ok: true };
    this.sinceSave = 0;
    this.shownProgress = this.progress();
    const result = this.store.write(createSave(this.state, this.now()));
    this.onResult?.(result, reason);
    return result;
  }

  /** No more saves from this game, even on leaving the page. Used before erasing progress. */
  stop(): void {
    this.stopped = true;
  }

  private saveLater(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      this.saveNow('auto');
    });
  }

  /** What changing is worth saving soon for. Checked rarely, so a string is cheap enough. */
  private progress(): string {
    const { resources, exploration, construction, npcs, time } = this.state;
    let summary = `${time.day}|${resources.coins}|${resources.wood}|`;
    for (const t of exploration.treasures) summary += t.opened ? '1' : '0';
    for (const l of exploration.landmarks) summary += l.discovered ? '1' : '0';
    for (const s of construction) summary += s.status[0];
    for (const n of npcs) summary += n.job[0] + n.travelPhase[0];
    return summary;
  }
}
