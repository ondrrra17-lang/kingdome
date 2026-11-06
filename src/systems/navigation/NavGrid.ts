export interface NavBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Walkability grid over the playable strip, built once from the collision data.
 * Each cell is a graph node connected to its neighbors, so river, bridge and
 * buildings need no separate nav authoring: they are blocked because they collide.
 */
export class NavGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cellCount: number;
  private readonly blocked: Uint8Array;
  /** Connected-region id per cell, -1 when blocked. */
  private readonly region: Int32Array;
  private mainRegion = -1;
  private mainX = 0;
  private mainZ = 0;

  constructor(
    private readonly bounds: NavBounds,
    readonly cellSize: number,
    private readonly isBlocked: (x: number, z: number) => boolean,
  ) {
    this.columns = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);
    this.cellCount = this.columns * this.rows;
    this.blocked = new Uint8Array(this.cellCount);
    this.region = new Int32Array(this.cellCount).fill(-1);
    for (let i = 0; i < this.cellCount; i++) {
      this.blocked[i] = isBlocked(this.centerX(i), this.centerZ(i)) ? 1 : 0;
    }
    this.labelRegions();
  }

  cellAt(x: number, z: number): number {
    const col = Math.floor((x - this.bounds.minX) / this.cellSize);
    const row = Math.floor((z - this.bounds.minZ) / this.cellSize);
    if (col < 0 || row < 0 || col >= this.columns || row >= this.rows) return -1;
    return row * this.columns + col;
  }

  centerX(cell: number): number {
    return this.bounds.minX + ((cell % this.columns) + 0.5) * this.cellSize;
  }

  centerZ(cell: number): number {
    return this.bounds.minZ + (Math.floor(cell / this.columns) + 0.5) * this.cellSize;
  }

  isWalkable(cell: number): boolean {
    return cell >= 0 && this.blocked[cell] === 0;
  }

  /**
   * Re-tests the cells in an area after the world changes there, such as a new
   * building, and works out again what is connected to what.
   */
  refreshArea(minX: number, minZ: number, maxX: number, maxZ: number): void {
    const { bounds, cellSize, columns, rows } = this;
    const firstCol = Math.max(Math.floor((minX - bounds.minX) / cellSize), 0);
    const lastCol = Math.min(Math.floor((maxX - bounds.minX) / cellSize), columns - 1);
    const firstRow = Math.max(Math.floor((minZ - bounds.minZ) / cellSize), 0);
    const lastRow = Math.min(Math.floor((maxZ - bounds.minZ) / cellSize), rows - 1);
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const cell = row * columns + col;
        this.blocked[cell] = this.isBlocked(this.centerX(cell), this.centerZ(cell)) ? 1 : 0;
      }
    }
    this.region.fill(-1);
    this.labelRegions();
    this.setMainRegion(this.mainX, this.mainZ);
  }

  /** Limits destination queries to the region containing this point. */
  setMainRegion(x: number, z: number): void {
    this.mainX = x;
    this.mainZ = z;
    const cell = this.nearestWalkable(x, z, 16, false);
    this.mainRegion = cell >= 0 ? this.region[cell] : -1;
  }

  isReachable(cell: number): boolean {
    return cell >= 0 && this.blocked[cell] === 0 && (this.mainRegion < 0 || this.region[cell] === this.mainRegion);
  }

  /** Closest walkable cell within `maxRadius` cells, or -1. Does not allocate. */
  nearestWalkable(x: number, z: number, maxRadius: number, mainRegionOnly = true): number {
    const col = Math.floor((x - this.bounds.minX) / this.cellSize);
    const row = Math.floor((z - this.bounds.minZ) / this.cellSize);
    let best = -1;
    let bestDist = Infinity;
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let r = row - radius; r <= row + radius; r++) {
        if (r < 0 || r >= this.rows) continue;
        const onEdgeRow = r === row - radius || r === row + radius;
        const step = onEdgeRow || radius === 0 ? 1 : radius * 2;
        for (let c = col - radius; c <= col + radius; c += step) {
          if (c < 0 || c >= this.columns) continue;
          const cell = r * this.columns + c;
          if (mainRegionOnly ? !this.isReachable(cell) : this.blocked[cell] !== 0) continue;
          const dx = this.centerX(cell) - x;
          const dz = this.centerZ(cell) - z;
          const dist = dx * dx + dz * dz;
          if (dist < bestDist) {
            bestDist = dist;
            best = cell;
          }
        }
      }
      // A further ring could still beat a corner of this one, but only by a little:
      // one extra ring would settle it, and the difference is under a cell.
      if (best >= 0) return best;
    }
    return best;
  }

  /** True if a straight walk between two points stays on walkable cells. */
  hasLineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(length / (this.cellSize * 0.25));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      if (!this.isWalkable(this.cellAt(ax + dx * t, az + dz * t))) return false;
    }
    return true;
  }

  private labelRegions(): void {
    const stack = new Int32Array(this.cellCount);
    let next = 0;
    for (let start = 0; start < this.cellCount; start++) {
      if (this.blocked[start] !== 0 || this.region[start] !== -1) continue;
      let top = 0;
      stack[top++] = start;
      this.region[start] = next;
      while (top > 0) {
        const cell = stack[--top];
        const col = cell % this.columns;
        const visit = (other: number): void => {
          if (this.blocked[other] === 0 && this.region[other] === -1) {
            this.region[other] = next;
            stack[top++] = other;
          }
        };
        if (col > 0) visit(cell - 1);
        if (col < this.columns - 1) visit(cell + 1);
        if (cell >= this.columns) visit(cell - this.columns);
        if (cell < this.cellCount - this.columns) visit(cell + this.columns);
      }
      next++;
    }
  }
}
