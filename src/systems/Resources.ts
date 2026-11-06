/** The village's resources. Every change goes through these functions. */
export interface ResourceState {
  coins: number;
  wood: number;
  /** The most wood that can be stored. Raised by buildings. */
  woodCapacity: number;
}

/** A price in any mix of resources. */
export interface ResourceCost {
  readonly coins: number;
  readonly wood: number;
}

/** Spends coins only if there are enough. Returns whether the payment happened. */
export function trySpendCoins(resources: ResourceState, amount: number): boolean {
  if (resources.coins < amount) return false;
  resources.coins -= amount;
  return true;
}

export function hasResources(resources: ResourceState, cost: ResourceCost): boolean {
  return resources.coins >= cost.coins && resources.wood >= cost.wood;
}

/** Pays a whole cost or nothing at all. */
export function trySpend(resources: ResourceState, cost: ResourceCost): boolean {
  if (!hasResources(resources, cost)) return false;
  resources.coins -= cost.coins;
  resources.wood -= cost.wood;
  return true;
}

export function isStorageFull(resources: ResourceState): boolean {
  return resources.wood >= resources.woodCapacity;
}

/** Stores as much as fits. Returns the amount actually stored. */
export function addWood(resources: ResourceState, amount: number): number {
  const stored = Math.min(amount, Math.max(resources.woodCapacity - resources.wood, 0));
  resources.wood += stored;
  return stored;
}
