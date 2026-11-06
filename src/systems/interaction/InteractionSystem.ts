import { INTERACTION } from '../../config';

/**
 * Anything the player can use with E. Implementations are plain objects, so new
 * kinds of interactable need no changes here.
 */
export interface Interactable {
  readonly id: string;
  /** X/Z anchor. May be a getter for things that move. */
  readonly x: number;
  readonly z: number;
  readonly range: number;
  /** Size of the highlight ring around the anchor. */
  readonly markerRadius: number;
  isAvailable(): boolean;
  /** The action shown in the prompt. */
  prompt(): string;
  /** False dims the prompt: the object can be used, but the action cannot happen yet. */
  isActionable?(): boolean;
  /** Performs the action and returns the feedback text to show. */
  interact(): string;
}

/**
 * Finds the nearest available interactable within its own range and runs it when
 * asked. Only `focus` is ever highlighted or triggered.
 */
export class InteractionSystem {
  focus: Interactable | null = null;
  feedback = '';
  private feedbackTimer = 0;

  constructor(private readonly items: readonly Interactable[]) {}

  update(playerX: number, playerZ: number, interactPressed: boolean, dt: number): void {
    const next = this.findNearest(playerX, playerZ);
    if (next !== this.focus) {
      // Feedback belongs to what it came from, so walking away clears it.
      this.feedback = '';
      this.feedbackTimer = 0;
      this.focus = next;
    }
    if (interactPressed && this.focus) {
      this.feedback = this.focus.interact();
      this.feedbackTimer = INTERACTION.feedbackSeconds;
    }
    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= dt;
      if (this.feedbackTimer <= 0) this.feedback = '';
    }
  }

  private findNearest(x: number, z: number): Interactable | null {
    let best: Interactable | null = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const dx = item.x - x;
      const dz = item.z - z;
      const distSq = dx * dx + dz * dz;
      if (distSq > item.range * item.range || distSq >= bestDistSq || !item.isAvailable()) continue;
      best = item;
      bestDistSq = distSq;
    }
    return best;
  }
}
