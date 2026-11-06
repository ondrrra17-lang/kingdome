import { Game, type GameStart } from './core/Game';
import { describeSave } from './systems/save/SaveData';
import { browserBackend, SaveStore, type LoadResult } from './systems/save/SaveStore';
import { confirmDialog, showStartScreen } from './rendering/SaveView';

function showFatal(message: string): void {
  const element = document.createElement('div');
  element.id = 'fatal';
  element.textContent = message;
  document.body.appendChild(element);
}

// Diagnostics are on in dev. A production build can opt in with ?debug.
const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
const store = new SaveStore(browserBackend());

function start(begin: GameStart): void {
  const container = document.getElementById('game');
  if (!container) throw new Error('Missing #game container');

  let game: Game;
  try {
    game = new Game(container, debug, begin, store, startOver);
  } catch (error) {
    console.error(error);
    showFatal('Emberwick Vale needs WebGL 2, which could not be started in this browser.');
    return;
  }
  game.start();

  if (debug) (window as unknown as { __game: Game }).__game = game;
  // Hot reload replaces the whole game, so the old instance must release its GPU resources.
  // Its progress goes with it into the new one, without stopping at the start screen.
  import.meta.hot?.dispose((data: { resume?: boolean }) => {
    game.dispose();
    data.resume = true;
  });
  import.meta.hot?.accept();
}

/** Erases the save and begins again. Only reached after the player has confirmed it. */
function startOver(): void {
  store.clear();
  location.reload();
}

/** What the start screen says about a save it cannot simply continue. */
function warningFor(loaded: LoadResult): string | null {
  switch (loaded.status) {
    case 'unreadable':
      return 'Your saved game could not be read. A copy has been kept, but it cannot be continued.';
    case 'newer':
      return 'This save comes from a newer version of the game, so it cannot be continued here.';
    case 'ok':
      if (loaded.fromBackup) return 'Your latest save was damaged, so this is the one before it.';
      return loaded.repairs.length > 0 ? 'Part of this save was damaged and has been reset.' : null;
    default:
      return null;
  }
}

function boot(): void {
  const loaded = store.load();
  if (loaded.status === 'none') {
    start({ kind: 'new' });
    return;
  }
  if (loaded.status === 'ok' && import.meta.hot?.data.resume) {
    start({ kind: 'load', save: loaded.save });
    return;
  }

  const save = loaded.status === 'ok' ? loaded.save : null;
  if (loaded.status === 'ok' && loaded.repairs.length > 0) console.info('Save repaired:', loaded.repairs.join('; '));
  const confirmNewGame = (): Promise<boolean> => {
    // An unreadable save has been set aside already. Anything else would really be lost, and
    // replacing a save from a newer version is still replacing it, so those are asked about.
    if (save === null && loaded.status !== 'newer') return Promise.resolve(true);
    return confirmDialog({
      title: 'Start a new game?',
      message: save ? `This erases your saved game (${describeSave(save)}). It cannot be undone.` : 'This replaces the save from the newer version. It cannot be undone.',
      confirmLabel: 'Erase and start',
      cancelLabel: 'Keep my save',
    });
  };
  showStartScreen({
    summary: save ? describeSave(save) : null,
    savedAt: save?.savedAt || null,
    warning: warningFor(loaded),
    onContinue: () => {
      if (save) start({ kind: 'load', save });
    },
    confirmNewGame,
    onNewGame: () => {
      store.clear();
      start({ kind: 'new' });
    },
  });
}

boot();
