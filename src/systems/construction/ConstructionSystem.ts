import { BUILDINGS, NPC, type BuildingDefinition } from '../../config';
import { postNotice, type GameState } from '../../core/GameState';
import type { Collider } from '../../world/WorldData';
import { circleOverlapsCollider, type CollisionWorld } from '../CollisionWorld';
import type { NavGrid } from '../navigation/NavGrid';
import { advanceSite, applyBuildingEffect, assignWorkers } from './ConstructionState';

const PLAYER_CLEARANCE = 0.5;

export function siteCollider(def: BuildingDefinition): Collider {
  return { kind: 'box', x: def.x, z: def.z, halfX: def.halfX, halfZ: def.halfZ, rotY: def.rotY };
}

/**
 * Runs construction inside the fixed simulation step: hands out workers, counts
 * progress, applies finished buildings, and turns structures solid.
 */
export class ConstructionSystem {
  private readonly colliders: Collider[] = BUILDINGS.map(siteCollider);

  constructor(
    private readonly state: GameState,
    private readonly collision: CollisionWorld,
    private readonly nav: NavGrid,
  ) {}

  update(dt: number): void {
    const { construction: sites, npcs, resources, village } = this.state;
    assignWorkers(sites, BUILDINGS, npcs);

    for (let s = 0; s < sites.length; s++) {
      const site = sites[s];
      const def = BUILDINGS[s];
      if (site.workerId !== null) {
        for (let n = 0; n < npcs.length; n++) {
          if (npcs[n].id !== site.workerId) continue;
          if (advanceSite(site, npcs[n], def.buildSeconds, dt)) {
            applyBuildingEffect(def, resources, village);
            postNotice(this.state, `${def.name} is finished. ${def.completedText}`);
          }
          break;
        }
      }
      if (!site.solid && (site.status === 'building' || site.status === 'completed')) this.trySolidify(s);
    }
  }

  /**
   * Adds the structure to collision and navigation once nobody is standing where it
   * goes, so nobody gets shoved out of it. Paths in progress are searched again,
   * since they may run through the new obstacle.
   */
  private trySolidify(index: number): void {
    const { player, npcs, construction } = this.state;
    const collider = this.colliders[index];
    if (circleOverlapsCollider(collider, player.x, player.z, PLAYER_CLEARANCE)) return;
    for (let n = 0; n < npcs.length; n++) {
      const npc = npcs[n];
      if (!npc.indoors && circleOverlapsCollider(collider, npc.x, npc.z, NPC.radius)) return;
    }
    construction[index].solid = true;
    this.collision.add(collider);
    const def = BUILDINGS[index];
    const reach = Math.hypot(def.halfX, def.halfZ) + NPC.navClearance + this.nav.cellSize;
    this.nav.refreshArea(def.x - reach, def.z - reach, def.x + reach, def.z + reach);
    for (let n = 0; n < npcs.length; n++) {
      const npc = npcs[n];
      if (npc.state === 'walk' && npc.pathStatus === 'ready') npc.pathStatus = 'pending';
    }
  }
}
