const SHOW_DELAY_SECONDS = 0.8;
const DISTANCE_BEFORE_HIDING = 18;

/** Shows the controls until the player has clearly found them. */
export class HintOverlay {
  private readonly element = document.getElementById('hint');
  private elapsed = 0;
  private state: 'waiting' | 'shown' | 'done' = 'waiting';

  update(frameDt: number, distanceTravelled: number): void {
    if (this.state === 'done' || !this.element) return;
    this.elapsed += frameDt;
    if (this.state === 'waiting' && this.elapsed > SHOW_DELAY_SECONDS) {
      this.element.classList.add('visible');
      this.state = 'shown';
    }
    if (this.state === 'shown' && distanceTravelled > DISTANCE_BEFORE_HIDING) {
      this.element.classList.remove('visible');
      this.state = 'done';
    }
  }

  dispose(): void {
    this.element?.classList.remove('visible');
  }
}
