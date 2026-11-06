const MOVEMENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
]);

/** Tracks held keys by physical position, so WASD works on any keyboard layout. */
export class Input {
  private readonly held = new Set<string>();
  private interactLatched = false;

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
  }

  /** -1 = A (toward -X), +1 = D (toward +X). */
  get moveX(): number {
    return this.axis('KeyD', 'ArrowRight') - this.axis('KeyA', 'ArrowLeft');
  }

  /** -1 = W (into the screen, -Z), +1 = S (toward the camera, +Z). */
  get moveZ(): number {
    return this.axis('KeyS', 'ArrowDown') - this.axis('KeyW', 'ArrowUp');
  }

  get sprint(): boolean {
    return this.held.has('ShiftLeft') || this.held.has('ShiftRight');
  }

  /**
   * True once per physical press of E. A held key's auto-repeat does not count, and
   * the press is kept until a simulation step reads it, so it cannot be missed.
   */
  consumeInteract(): boolean {
    const pressed = this.interactLatched;
    this.interactLatched = false;
    return pressed;
  }

  /** Forgets everything held or pressed, such as when a dialog takes over the keyboard. */
  releaseAll(): void {
    this.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.clear);
    this.held.clear();
  }

  private axis(a: string, b: string): number {
    return this.held.has(a) || this.held.has(b) ? 1 : 0;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Leave browser shortcuts such as Ctrl+W, Ctrl+S and Ctrl+D alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyE') {
      if (!e.repeat) this.interactLatched = true;
      return;
    }
    if (!MOVEMENT_CODES.has(e.code)) return;
    e.preventDefault();
    this.held.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  /** Released keys are never reported after focus loss, so forget them all. */
  private readonly clear = (): void => {
    this.held.clear();
    this.interactLatched = false;
  };
}
