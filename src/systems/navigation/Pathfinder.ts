import type { NavGrid } from './NavGrid';

const SQRT2 = Math.SQRT2;
const NEIGHBOR_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NEIGHBOR_DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const START_SEARCH_RADIUS = 4;

/**
 * A* over a NavGrid. All working memory is preallocated, so a search allocates
 * nothing. The raw cell path is then string-pulled into a few straight legs.
 */
export class Pathfinder {
  /** Number of searches run, shown in diagnostics. */
  searches = 0;

  private readonly gScore: Float32Array;
  private readonly fScore: Float32Array;
  private readonly parent: Int32Array;
  private readonly visitStamp: Uint32Array;
  private readonly closedStamp: Uint32Array;
  private readonly heap: Int32Array;
  private readonly rawPath: Int32Array;
  private heapSize = 0;
  private stamp = 0;

  constructor(private readonly nav: NavGrid) {
    const n = nav.cellCount;
    this.gScore = new Float32Array(n);
    this.fScore = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.visitStamp = new Uint32Array(n);
    this.closedStamp = new Uint32Array(n);
    this.heap = new Int32Array(n * 8);
    this.rawPath = new Int32Array(n);
  }

  /**
   * Finds a path and writes waypoints into outX/outZ. Returns the waypoint count,
   * or -1 if there is no path. A long path is cut at the buffers' capacity; the
   * caller can search again from where it ends up.
   */
  find(startX: number, startZ: number, goalX: number, goalZ: number, outX: Float32Array, outZ: Float32Array): number {
    this.searches++;
    const nav = this.nav;
    // Separation or collision can leave someone just off the grid; start from the nearest valid cell.
    const start = nav.nearestWalkable(startX, startZ, START_SEARCH_RADIUS);
    const goal = nav.cellAt(goalX, goalZ);
    if (start < 0 || !nav.isReachable(goal)) return -1;

    const cellCount = this.search(start, goal);
    if (cellCount < 0) return -1;

    // String pulling: from each anchor, jump to the furthest cell in a straight line.
    const raw = this.rawPath;
    let written = 0;
    let anchorX = startX;
    let anchorZ = startZ;
    let index = 0;
    while (index < cellCount && written < outX.length) {
      let furthest = index;
      for (let j = index + 1; j < cellCount; j++) {
        if (!nav.hasLineOfSight(anchorX, anchorZ, nav.centerX(raw[j]), nav.centerZ(raw[j]))) break;
        furthest = j;
      }
      anchorX = nav.centerX(raw[furthest]);
      anchorZ = nav.centerZ(raw[furthest]);
      outX[written] = anchorX;
      outZ[written] = anchorZ;
      written++;
      index = furthest + 1;
    }
    if (index >= cellCount && nav.hasLineOfSight(anchorX, anchorZ, goalX, goalZ)) {
      outX[written - 1] = goalX;
      outZ[written - 1] = goalZ;
    }
    return written;
  }

  /** Runs A* and writes the cells start..goal into rawPath. Returns their count, or -1. */
  private search(start: number, goal: number): number {
    const nav = this.nav;
    const columns = nav.columns;
    const rows = nav.rows;
    const stamp = ++this.stamp;
    const goalCol = goal % columns;
    const goalRow = Math.floor(goal / columns);

    this.heapSize = 0;
    this.gScore[start] = 0;
    this.fScore[start] = octile(start % columns, Math.floor(start / columns), goalCol, goalRow);
    this.parent[start] = -1;
    this.visitStamp[start] = stamp;
    this.push(start);

    while (this.heapSize > 0) {
      const current = this.pop();
      if (this.closedStamp[current] === stamp) continue;
      this.closedStamp[current] = stamp;
      if (current === goal) return this.reconstruct(goal);

      const col = current % columns;
      const row = Math.floor(current / columns);
      for (let n = 0; n < 8; n++) {
        const dx = NEIGHBOR_DX[n];
        const dz = NEIGHBOR_DZ[n];
        const c = col + dx;
        const r = row + dz;
        if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
        const next = r * columns + c;
        if (!nav.isWalkable(next) || this.closedStamp[next] === stamp) continue;
        // Diagonals may not cut across a blocked corner.
        if (n >= 4 && (!nav.isWalkable(row * columns + c) || !nav.isWalkable(r * columns + col))) continue;
        const score = this.gScore[current] + (n >= 4 ? SQRT2 : 1);
        if (this.visitStamp[next] === stamp && score >= this.gScore[next]) continue;
        this.visitStamp[next] = stamp;
        this.gScore[next] = score;
        this.fScore[next] = score + octile(c, r, goalCol, goalRow);
        this.parent[next] = current;
        this.push(next);
      }
    }
    return -1;
  }

  private reconstruct(goal: number): number {
    let count = 0;
    for (let cell = goal; cell !== -1; cell = this.parent[cell]) count++;
    let write = count;
    for (let cell = goal; cell !== -1; cell = this.parent[cell]) this.rawPath[--write] = cell;
    return count;
  }

  private push(cell: number): void {
    if (this.heapSize >= this.heap.length) return;
    const heap = this.heap;
    const f = this.fScore;
    let i = this.heapSize++;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (f[heap[up]] <= f[cell]) break;
      heap[i] = heap[up];
      i = up;
    }
    heap[i] = cell;
  }

  private pop(): number {
    const heap = this.heap;
    const f = this.fScore;
    const top = heap[0];
    const last = heap[--this.heapSize];
    let i = 0;
    for (;;) {
      let child = i * 2 + 1;
      if (child >= this.heapSize) break;
      if (child + 1 < this.heapSize && f[heap[child + 1]] < f[heap[child]]) child++;
      if (f[heap[child]] >= f[last]) break;
      heap[i] = heap[child];
      i = child;
    }
    heap[i] = last;
    return top;
  }
}

function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
}
