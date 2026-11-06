import { BUILDINGS, NPC, WORLD } from '../../config';
import type { NavGrid } from '../navigation/NavGrid';
import { houseDoorPoint, type WorldData } from '../../world/WorldData';

/** A tree someone can reach, with the spot to work from. */
export interface TreeSite {
  x: number;
  z: number;
  standX: number;
  standZ: number;
}

export interface DoorSite {
  /** Where a villager stands before going in. */
  x: number;
  z: number;
  /** The door itself, to face. */
  faceX: number;
  faceZ: number;
}

/** A construction site, as a place to go and work. */
export interface BuildSite {
  x: number;
  z: number;
  standX: number;
  standZ: number;
}

/** The places villagers need, as seen by behavior code. Interface so tests can supply their own. */
export interface SiteQueries {
  readonly trees: readonly TreeSite[];
  readonly doors: readonly DoorSite[];
  readonly buildSites: readonly BuildSite[];
  readonly storageX: number;
  readonly storageZ: number;
  readonly storageStandX: number;
  readonly storageStandZ: number;
  readonly fireX: number;
  readonly fireZ: number;
  /** Result of the last successful nearestPoint call. */
  pointX: number;
  pointZ: number;
  nearestPoint(x: number, z: number): boolean;
}

/** Resolves world layout into reachable villager destinations, once at startup. */
export class VillageSites implements SiteQueries {
  readonly trees: TreeSite[] = [];
  readonly doors: DoorSite[] = [];
  readonly buildSites: BuildSite[] = [];
  readonly storageX: number = WORLD.woodpile.x;
  readonly storageZ: number = WORLD.woodpile.z;
  readonly storageStandX: number;
  readonly storageStandZ: number;
  readonly fireX: number = WORLD.campfire.x;
  readonly fireZ: number = WORLD.campfire.z;
  pointX = 0;
  pointZ = 0;

  constructor(private readonly nav: NavGrid, world: WorldData) {
    const storage = this.requirePoint(this.storageX, this.storageZ);
    this.storageStandX = storage[0];
    this.storageStandZ = storage[1];

    for (const house of WORLD.houses) {
      const door = houseDoorPoint(house);
      const stand = this.requirePoint(door.standX, door.standZ);
      this.doors.push({ x: stand[0], z: stand[1], faceX: door.doorX, faceZ: door.doorZ });
    }

    for (const building of BUILDINGS) {
      const stand = this.requirePoint(building.stand[0], building.stand[1]);
      this.buildSites.push({ x: building.x, z: building.z, standX: stand[0], standZ: stand[1] });
    }

    // Only the valley's trees: nobody walks into the forest to chop firewood.
    const { minX, maxX, minZ, maxZ } = WORLD.strip;
    for (const p of world.placements) {
      if (p.kind !== 'pine' && p.kind !== 'pineSlim' && p.kind !== 'oak' && p.kind !== 'oakAmber') continue;
      if (p.x < minX || p.x > maxX || p.z < minZ - NPC.treeStandDistance || p.z > maxZ + NPC.treeStandDistance) continue;
      // Prefer the camera side of the trunk, so the tree does not hide the person working.
      const cell = nav.nearestWalkable(p.x, p.z + NPC.treeStandFrontBias, Math.ceil(NPC.treeStandDistance / nav.cellSize));
      if (cell < 0) continue;
      const standX = nav.centerX(cell);
      const standZ = nav.centerZ(cell);
      if (Math.hypot(standX - p.x, standZ - p.z) > NPC.treeStandDistance) continue;
      this.trees.push({ x: p.x, z: p.z, standX, standZ });
    }
    // Nearest to storage first: woodcutters pick from the front of the list.
    const distance = (t: TreeSite): number => Math.hypot(t.x - this.storageX, t.z - this.storageZ);
    this.trees.sort((a, b) => distance(a) - distance(b));
  }

  nearestPoint(x: number, z: number): boolean {
    const cell = this.nav.nearestWalkable(x, z, NPC.pointSearchRadius);
    if (cell < 0) return false;
    this.pointX = this.nav.centerX(cell);
    this.pointZ = this.nav.centerZ(cell);
    return true;
  }

  private requirePoint(x: number, z: number): [number, number] {
    if (!this.nearestPoint(x, z)) throw new Error(`No walkable point near ${x}, ${z}`);
    return [this.pointX, this.pointZ];
  }
}
