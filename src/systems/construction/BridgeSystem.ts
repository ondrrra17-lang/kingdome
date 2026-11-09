import { NPC, WORLD } from '../../config';
import type { GameState } from '../../core/GameState';
import type { BoxCollider } from '../../world/WorldData';
import type { CollisionWorld } from '../CollisionWorld';
import type { NavGrid } from '../navigation/NavGrid';

export function bridgeIsOpen(state: GameState): boolean {
  return state.construction.some((s) => s.id === 'bridge' && s.status === 'completed');
}

/** The closed crossing separates the two banks, including any route around the stream. */
export class BridgeSystem {
  private readonly barrier: BoxCollider = {
    kind: 'box', x: WORLD.bridge.x, z: (WORLD.bounds.minZ + WORLD.bounds.maxZ) / 2,
    halfX: WORLD.bridge.repairGapHalfLength, halfZ: (WORLD.bounds.maxZ - WORLD.bounds.minZ) / 2 + 2, rotY: 0,
  };
  private closed = false;

  constructor(private readonly state: GameState, private readonly collision: CollisionWorld, private readonly nav: NavGrid) {
    if (!bridgeIsOpen(state)) {
      collision.add(this.barrier);
      this.closed = true;
      this.refresh();
    }
  }

  update(): void {
    if (!this.closed || !bridgeIsOpen(this.state)) return;
    this.collision.remove(this.barrier);
    this.closed = false;
    this.refresh();
    for (const npc of this.state.npcs) {
      if (npc.state === 'walk') npc.pathStatus = 'pending';
      npc.decisionTimer = 0;
    }
  }

  private refresh(): void {
    const margin = NPC.navClearance + this.nav.cellSize;
    this.nav.refreshArea(this.barrier.x - this.barrier.halfX - margin, WORLD.bounds.minZ,
      this.barrier.x + this.barrier.halfX + margin, WORLD.bounds.maxZ);
  }
}
