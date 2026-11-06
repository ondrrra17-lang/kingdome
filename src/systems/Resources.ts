/** The village's resources. Every change goes through these functions. */
export interface ResourceState {
  food: number;
  furs: number;
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

type WoodWallet = Pick<ResourceState, 'coins' | 'wood' | 'woodCapacity'>;
export type ResourceBundle = Partial<Pick<ResourceState, 'coins' | 'wood' | 'food' | 'furs'>>;
const KEYS = ['coins', 'wood', 'food', 'furs'] as const;

/** Atomic command: invalid input or insufficient funds never changes the wallet. */
export function exchange(resources: ResourceState, cost: ResourceBundle, reward: ResourceBundle): boolean {
  for (const key of KEYS) {
    const take = cost[key] ?? 0;
    const give = reward[key] ?? 0;
    if (!Number.isSafeInteger(take) || !Number.isSafeInteger(give) || take < 0 || give < 0
      || !Number.isSafeInteger(resources[key]) || resources[key] < take
      || !Number.isSafeInteger(resources[key] - take + give)) return false;
  }
  if (resources.wood - (cost.wood ?? 0) + (reward.wood ?? 0) > resources.woodCapacity) return false;
  for (const key of KEYS) resources[key] += (reward[key] ?? 0) - (cost[key] ?? 0);
  return true;
}

/** Spends coins only if there are enough. Returns whether the payment happened. */
export function trySpendCoins(resources: Pick<ResourceState, 'coins'>, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount < 0 || resources.coins < amount) return false;
  resources.coins -= amount;
  return true;
}

export function hasResources(resources: Pick<ResourceState, 'coins' | 'wood'>, cost: ResourceCost): boolean {
  return Number.isSafeInteger(cost.coins) && Number.isSafeInteger(cost.wood) && cost.coins >= 0 && cost.wood >= 0
    && resources.coins >= cost.coins && resources.wood >= cost.wood;
}

/** Pays a whole cost or nothing at all. */
export function trySpend(resources: Pick<ResourceState, 'coins' | 'wood'>, cost: ResourceCost): boolean {
  if (!hasResources(resources, cost)) return false;
  resources.coins -= cost.coins;
  resources.wood -= cost.wood;
  return true;
}

export function isStorageFull(resources: Pick<ResourceState, 'wood' | 'woodCapacity'>): boolean {
  return resources.wood >= resources.woodCapacity;
}

/** Stores as much as fits. Returns the amount actually stored. */
export function addWood(resources: Pick<WoodWallet, 'wood' | 'woodCapacity'>, amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) return 0;
  const stored = Math.min(amount, Math.max(resources.woodCapacity - resources.wood, 0));
  resources.wood += stored;
  return stored;
}
