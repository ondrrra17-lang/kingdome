/**
 * The save interface, in the DOM with the rest of the HUD: the start screen, a small in-game
 * bar, and a confirmation dialog. It reports what happened and passes on what was asked for.
 * It makes no decisions about saving.
 */

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

/** Asks a question that could lose progress. Cancelling is the default and Escape means cancel. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const backdrop = document.createElement('div');
    backdrop.className = 'save-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'save-dialog';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'save-dialog-title');
    dialog.setAttribute('aria-describedby', 'save-dialog-message');
    const title = document.createElement('h2');
    title.id = 'save-dialog-title';
    title.textContent = options.title;
    const message = document.createElement('p');
    message.id = 'save-dialog-message';
    message.textContent = options.message;
    const actions = document.createElement('div');
    actions.className = 'save-actions';
    const cancel = button(options.cancelLabel, 'save-button');
    const confirm = button(options.confirmLabel, 'save-button danger');
    actions.append(cancel, confirm);
    dialog.append(title, message, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    cancel.focus();

    const finish = (answer: boolean): void => {
      window.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      previousFocus?.blur();
      resolve(answer);
    };
    // Keys stay inside the dialog: the game behind it must not see them.
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === cancel ? confirm : cancel).focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
  });
}

function button(label: string, className: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  return element;
}

export interface StartScreenOptions {
  /** Summary of the existing save, or null if it cannot be continued. */
  summary: string | null;
  savedAt: number | null;
  /** Shown as a warning, such as when a save could not be read. */
  warning: string | null;
  onContinue: () => void;
  /** Whether going ahead would be all right, asking the player if need be. */
  confirmNewGame: () => Promise<boolean>;
  onNewGame: () => void;
}

function timeAgo(then: number, now: number): string {
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return 'saved just now';
  if (minutes < 60) return `saved ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `saved ${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `saved ${Math.round(hours / 24)} days ago`;
}

/** Shown on arrival when there is a save to decide about. Removes itself once a choice is made. */
export function showStartScreen(options: StartScreenOptions): void {
  const screen = document.createElement('div');
  screen.id = 'start-screen';
  const panel = document.createElement('div');
  panel.className = 'start-panel';
  const title = document.createElement('h1');
  title.textContent = 'Emberwick Vale';
  panel.append(title);

  if (options.summary) {
    const summary = document.createElement('p');
    summary.className = 'start-summary';
    summary.textContent = options.summary;
    panel.append(summary);
    if (options.savedAt) {
      const when = document.createElement('p');
      when.className = 'start-when';
      when.textContent = timeAgo(options.savedAt, Date.now());
      panel.append(when);
    }
  }
  if (options.warning) {
    const warning = document.createElement('p');
    warning.className = 'start-warning';
    warning.setAttribute('role', 'alert');
    warning.textContent = options.warning;
    panel.append(warning);
  }

  const actions = document.createElement('div');
  actions.className = 'start-actions';
  const leave = (next: () => void): void => {
    // Building the world takes a moment, and blocks the page: say so before it starts.
    panel.replaceChildren(title, Object.assign(document.createElement('p'), { className: 'start-summary', textContent: 'Loading…' }));
    setTimeout(() => {
      screen.remove();
      next();
    }, 30);
  };
  if (options.summary) {
    const resume = button('Continue Game', 'save-button primary');
    resume.addEventListener('click', () => leave(options.onContinue));
    actions.append(resume);
  }
  const fresh = button('New Game', options.summary ? 'save-button' : 'save-button primary');
  fresh.addEventListener('click', () => {
    void options.confirmNewGame().then((confirmed) => {
      if (confirmed) leave(options.onNewGame);
      else fresh.focus();
    });
  });
  actions.append(fresh);
  panel.append(actions);
  screen.append(panel);
  document.body.append(screen);
  (actions.firstElementChild as HTMLElement).focus();
}

const STATUS_SECONDS = 2.6;

/** The small in-game bar: Save, New Game, and how the last save went. */
export class SaveBar {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private statusTimer = 0;

  constructor(parent: HTMLElement, onSave: () => void, onNewGame: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud-save';
    this.status = document.createElement('span');
    this.status.className = 'hud-save-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    const save = button('Save', 'save-button small');
    save.title = 'Save the game (Ctrl+S)';
    const fresh = button('New Game', 'save-button small');
    save.addEventListener('click', () => {
      // Keyboard focus goes back to playing, so Space cannot press the button again.
      save.blur();
      onSave();
    });
    fresh.addEventListener('click', () => {
      fresh.blur();
      onNewGame();
    });
    this.root.append(this.status, save, fresh);
    parent.append(this.root);
  }

  showSaved(text: string): void {
    this.status.textContent = text;
    this.status.className = 'hud-save-status visible';
    this.statusTimer = STATUS_SECONDS;
  }

  /** A failure stays on screen until a save works, since progress is at risk until then. */
  showError(text: string): void {
    this.status.textContent = text;
    this.status.className = 'hud-save-status visible error';
    this.statusTimer = 0;
  }

  update(frameDt: number): void {
    if (this.statusTimer <= 0) return;
    this.statusTimer -= frameDt;
    if (this.statusTimer <= 0) this.status.classList.remove('visible');
  }
}
