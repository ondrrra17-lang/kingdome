import { EXPLORATION, INTERACTION } from '../../config';
import { postNotice, type GameState } from '../../core/GameState';
import { discoverLandmarks, discoveredLandmarkCount } from './ExplorationState';

/** Announces special places as the player reaches them. Checked a few times a second. */
export class ExplorationSystem {
  private sinceCheck = 0;

  constructor(private readonly state: GameState) {}

  update(dt: number): void {
    this.sinceCheck += dt;
    if (this.sinceCheck < INTERACTION.discoveryCheckSeconds) return;
    this.sinceCheck = 0;
    const { exploration, player } = this.state;
    const found = discoverLandmarks(exploration, EXPLORATION.landmarks, player.x, player.z);
    if (!found) return;
    const count = discoveredLandmarkCount(exploration);
    postNotice(this.state, `${found.name} (${count} of ${exploration.landmarks.length} places). ${found.discoverText}`);
  }
}
