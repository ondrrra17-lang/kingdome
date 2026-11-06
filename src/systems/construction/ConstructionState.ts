import { BUILDINGS, type BuildingCost, type BuildingDefinition } from '../../config';
import type { NpcState } from '../../entities/Npc';
import { hasResources, trySpend, type ResourceState } from '../Resources';

/** AVAILABLE -> FUNDED -> BUILDING -> COMPLETED. Plain data, no scene objects. */
export type SiteStatus = 'available' | 'funded' | 'building' | 'completed';

export interface BuildingSiteState {
  readonly id: string;
  status: SiteStatus;
  /** 0..1 */
  progress: number;
  /** The one villager assigned to this site, or null. */
  workerId: string | null;
  /** Whether the structure has been added to collision and navigation. */
  solid: boolean;
}

/** What buildings have unlocked so far. */
export interface VillageLimits {
  maxWoodcutters: number;
  /** Defensive posts built. Nothing uses this until combat exists. */
  watchPosts: number;
}

export function createSiteStates(): BuildingSiteState[] {
  return BUILDINGS.map((def) => ({ id: def.id, status: 'available', progress: 0, workerId: null, solid: false }));
}

export type FundResult = 'funded' | 'already-funded' | 'insufficient';

/** Pays for a site. Resources are deducted only here, and only on the AVAILABLE -> FUNDED step. */
export function fundSite(site: BuildingSiteState, cost: BuildingCost, resources: ResourceState): FundResult {
  if (site.status !== 'available') return 'already-funded';
  if (!trySpend(resources, cost)) return 'insufficient';
  site.status = 'funded';
  return 'funded';
}

export function canAfford(cost: BuildingCost, resources: ResourceState): boolean {
  return hasResources(resources, cost);
}

/** Who can be pulled off to build: unemployed, and not already on a site. */
export function canBuild(npc: NpcState): boolean {
  return npc.job === 'villager' && npc.assignedSite < 0;
}

/**
 * Gives each funded site without a worker the nearest free villager. A villager
 * only ever holds one site, and a site one villager. A site with nobody free
 * simply stays FUNDED and is picked up on a later pass.
 */
export function assignWorkers(sites: readonly BuildingSiteState[], defs: readonly BuildingDefinition[], npcs: readonly NpcState[]): void {
  for (let s = 0; s < sites.length; s++) {
    const site = sites[s];
    if (site.status !== 'funded' || site.workerId !== null) continue;
    const def = defs[s];
    let best: NpcState | null = null;
    let bestDist = Infinity;
    for (let n = 0; n < npcs.length; n++) {
      const npc = npcs[n];
      if (!canBuild(npc)) continue;
      const dist = Math.hypot(npc.x - def.x, npc.z - def.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = npc;
      }
    }
    if (best) {
      site.workerId = best.id;
      best.assignedSite = s;
    }
  }
}

/**
 * Advances a site by one step. Work only counts while the worker is physically at
 * the site doing it, and not stopped to talk. Returns true on the step it completes.
 */
export function advanceSite(site: BuildingSiteState, worker: NpcState, buildSeconds: number, dt: number): boolean {
  if (site.status === 'completed' || site.status === 'available') return false;
  if (worker.task !== 'build' || worker.attentionTimer > 0) return false;
  site.status = 'building';
  site.progress = Math.min(site.progress + dt / buildSeconds, 1);
  if (site.progress < 1) return false;
  site.status = 'completed';
  site.workerId = null;
  worker.assignedSite = -1;
  return true;
}

/** Applies what a finished building does. Driven entirely by its data. */
export function applyBuildingEffect(def: BuildingDefinition, resources: ResourceState, limits: VillageLimits): void {
  const effect = def.effect;
  switch (effect.kind) {
    case 'woodcutterSlot':
      limits.maxWoodcutters += effect.amount;
      break;
    case 'woodStorage':
      resources.woodCapacity += effect.amount;
      break;
    case 'watchPost':
      limits.watchPosts += effect.amount;
      break;
  }
}
