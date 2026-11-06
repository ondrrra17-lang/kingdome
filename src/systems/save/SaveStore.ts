import { readSave, type ReadResult, type SaveFile } from './SaveData';

const KEY = 'emberwick-vale:save';
/** The last save before the current one, in case the current one turns out damaged. */
const PREVIOUS_KEY = 'emberwick-vale:save:previous';
/** A damaged save is set aside rather than lost, so it can still be looked at. */
const DAMAGED_KEY = 'emberwick-vale:save:damaged';

export type LoadResult =
  | { status: 'none' }
  | { status: 'ok'; save: SaveFile; repairs: string[]; fromBackup: boolean }
  | { status: 'unreadable'; reason: string }
  | { status: 'newer'; version: number };

export type WriteResult = { ok: true } | { ok: false; reason: string };

/** The part of Storage this needs, so tests can pass their own. */
export type SaveBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage, or null where the browser blocks it, in which case reaching for it can throw. */
export function browserBackend(): SaveBackend | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Keeps the save in localStorage. A save is a few kilobytes, so nothing bigger is needed.
 * Nothing here may throw: storage can be full, blocked or wiped at any time.
 */
export class SaveStore {
  constructor(private readonly backend: SaveBackend | null) {}

  load(): LoadResult {
    const text = this.get(KEY);
    if (text === null) return { status: 'none' };
    const current = readSave(text);
    if (current.status === 'ok') return { status: 'ok', save: current.save, repairs: current.repairs, fromBackup: false };
    // Newer than this version of the game: not damaged, so nothing is set aside or replaced.
    if (current.status === 'newer') return current;

    this.set(DAMAGED_KEY, text);
    const previousText = this.get(PREVIOUS_KEY);
    const previous: ReadResult | null = previousText === null ? null : readSave(previousText);
    if (previous?.status === 'ok') return { status: 'ok', save: previous.save, repairs: previous.repairs, fromBackup: true };
    return current;
  }

  write(save: SaveFile): WriteResult {
    if (!this.backend) return { ok: false, reason: 'This browser is blocking saved data.' };
    try {
      const current = this.backend.getItem(KEY);
      // Only a good save becomes the backup, so a damaged one can never replace it.
      if (current !== null && readSave(current).status === 'ok') this.backend.setItem(PREVIOUS_KEY, current);
      this.backend.setItem(KEY, JSON.stringify(save));
      return { ok: true };
    } catch (error) {
      const full = error instanceof DOMException && error.name === 'QuotaExceededError';
      return { ok: false, reason: full ? 'Browser storage is full.' : 'The browser refused to store it.' };
    }
  }

  /** Erases progress, for a confirmed New Game. A damaged save that was set aside stays. */
  clear(): void {
    if (!this.backend) return;
    try {
      this.backend.removeItem(KEY);
      this.backend.removeItem(PREVIOUS_KEY);
    } catch {
      // Blocked storage has nothing to erase.
    }
  }

  private get(key: string): string | null {
    try {
      return this.backend?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private set(key: string, value: string): void {
    try {
      this.backend?.setItem(key, value);
    } catch {
      // Setting a damaged save aside is a courtesy, not a requirement.
    }
  }
}
