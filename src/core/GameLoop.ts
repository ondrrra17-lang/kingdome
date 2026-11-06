import { SIM } from '../config';

export interface LoopCallbacks {
  /** Advances gameplay by exactly `dt` seconds. May run 0..n times per frame. */
  simulate(dt: number): void;
  /** Draws one frame. `alpha` in [0, 1) blends the previous and current sim states. */
  render(alpha: number, frameDt: number, simSteps: number): void;
}

/**
 * Fixed-timestep loop with an accumulator: simulation always advances in equal
 * steps, rendering runs at display rate and interpolates between sim states.
 */
export class GameLoop {
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;

  constructor(private readonly callbacks: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const frameDt = Math.min(Math.max((now - this.lastTime) / 1000, 0), SIM.maxFrameTime);
    this.lastTime = now;
    this.accumulator += frameDt;

    let steps = 0;
    while (this.accumulator >= SIM.fixedDt && steps < SIM.maxSubSteps) {
      this.callbacks.simulate(SIM.fixedDt);
      this.accumulator -= SIM.fixedDt;
      steps++;
    }
    // Could not catch up: drop the remaining time rather than spiral.
    if (steps === SIM.maxSubSteps) this.accumulator = 0;

    this.callbacks.render(this.accumulator / SIM.fixedDt, frameDt, steps);
  };
}
