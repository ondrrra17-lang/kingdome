import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, type Scene, type WebGLRenderer } from 'three';
import { advanceClock, type GameState } from '../core/GameState';
import type { Collider, WorldData } from '../world/WorldData';

const SAMPLE_COUNT = 600;
const REFRESH_INTERVAL = 0.25;

export interface PerformanceSummary {
  samples: number;
  avgFps: number;
  avgFrameMs: number;
  /** Mean frame time of the slowest 1% of frames, as FPS. */
  low1PercentFps: number;
  worstFrameMs: number;
  avgCpuMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

/**
 * Development overlay. Measures real frame timing in a ring buffer and reports
 * renderer counters. `avg CPU` is JS update + draw submission only: GPU work runs
 * asynchronously, and shows up in frame time, not here.
 *
 * F3 toggles the overlay, F4 draws colliders, [ and ] scrub the time of day, P pauses it.
 */
export class Diagnostics {
  private readonly frameMs = new Float32Array(SAMPLE_COUNT);
  private readonly cpuMs = new Float32Array(SAMPLE_COUNT);
  private readonly sorted = new Float32Array(SAMPLE_COUNT);
  private cursor = 0;
  private filled = 0;
  private sinceRefresh = 0;
  private cpuStart = 0;
  private simSteps = 0;
  private visible = true;
  private colliderLines: LineSegments | null = null;
  private drawnColliders = 0;
  private readonly panel: HTMLElement;
  private simMs = 0;
  private simStart = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly state: GameState,
    private readonly world: WorldData,
    private readonly pathSearches: () => number,
  ) {
    this.panel = document.createElement('div');
    this.panel.id = 'diagnostics';
    document.body.appendChild(this.panel);
    window.addEventListener('keydown', this.onKeyDown);
  }

  beginSim(): void {
    this.simStart = performance.now();
  }

  endSim(): void {
    // Smoothed: individual steps are too short and uneven to read directly.
    this.simMs += (performance.now() - this.simStart - this.simMs) * 0.05;
  }

  /** Average milliseconds per simulation step, including villagers. */
  get simStepMs(): number {
    return this.simMs;
  }

  beginFrame(): void {
    this.cpuStart = performance.now();
  }

  endFrame(frameDt: number, simSteps: number): void {
    this.frameMs[this.cursor] = frameDt * 1000;
    this.cpuMs[this.cursor] = performance.now() - this.cpuStart;
    this.cursor = (this.cursor + 1) % SAMPLE_COUNT;
    this.filled = Math.min(this.filled + 1, SAMPLE_COUNT);
    this.simSteps = simSteps;
    if (this.colliderLines && this.world.colliders.length !== this.drawnColliders) {
      this.hideColliders();
      this.showColliders();
    }

    this.sinceRefresh += frameDt;
    if (this.visible && this.sinceRefresh >= REFRESH_INTERVAL) {
      this.sinceRefresh = 0;
      this.refreshPanel();
    }
  }

  /** Clears the timing window, e.g. to begin a clean measurement. */
  resetTiming(): void {
    this.cursor = 0;
    this.filled = 0;
  }

  summary(): PerformanceSummary {
    const n = this.filled;
    let frameTotal = 0;
    let cpuTotal = 0;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      frameTotal += this.frameMs[i];
      cpuTotal += this.cpuMs[i];
      if (this.frameMs[i] > worst) worst = this.frameMs[i];
      this.sorted[i] = this.frameMs[i];
    }
    const sorted = this.sorted.subarray(0, n).sort();
    const lowCount = Math.max(Math.floor(n * 0.01), 1);
    let lowTotal = 0;
    for (let i = n - lowCount; i < n; i++) lowTotal += sorted[i];
    const avgFrame = n ? frameTotal / n : 0;
    const info = this.renderer.info;
    return {
      samples: n,
      avgFps: avgFrame ? 1000 / avgFrame : 0,
      avgFrameMs: avgFrame,
      low1PercentFps: n && lowTotal ? 1000 / (lowTotal / lowCount) : 0,
      worstFrameMs: worst,
      avgCpuMs: n ? cpuTotal / n : 0,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.panel.remove();
    this.hideColliders();
  }

  private refreshPanel(): void {
    const s = this.summary();
    const p = this.state.player;
    const day = this.state.time.dayTime * 24;
    const hours = Math.floor(day);
    const minutes = Math.floor((day - hours) * 60);
    this.panel.textContent = [
      `fps      ${s.avgFps.toFixed(1)}  (1% low ${s.low1PercentFps.toFixed(1)})`,
      `frame    ${s.avgFrameMs.toFixed(2)} ms  worst ${s.worstFrameMs.toFixed(1)}`,
      `cpu      ${s.avgCpuMs.toFixed(2)} ms  sim steps ${this.simSteps}`,
      `sim      ${this.simMs.toFixed(3)} ms/step  paths ${this.pathSearches()}`,
      `npcs     ${this.npcSummary()}`,
      `draws    ${s.drawCalls}`,
      `tris     ${s.triangles.toLocaleString('en-US')}`,
      `gpu mem  ${s.geometries} geo  ${s.textures} tex  ${s.programs} prog`,
      `dpr      ${this.renderer.getPixelRatio().toFixed(2)}`,
      `pos      ${p.x.toFixed(1)}, ${p.z.toFixed(1)}  speed ${p.speed.toFixed(1)}`,
      `time     ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}${this.state.time.paused ? ' (paused)' : ''}`,
      `F3 panel  F4 colliders  [ ] time  P pause`,
    ].join('\n');
  }

  private npcSummary(): string {
    let idle = 0;
    let walk = 0;
    let work = 0;
    let rest = 0;
    for (const npc of this.state.npcs) {
      if (npc.state === 'idle') idle++;
      else if (npc.state === 'walk') walk++;
      else if (npc.state === 'work') work++;
      else rest++;
    }
    return `idle ${idle} walk ${walk} work ${work} rest ${rest}`;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const time = this.state.time;
    switch (e.code) {
      case 'F3':
        e.preventDefault();
        this.visible = !this.visible;
        this.panel.style.display = this.visible ? '' : 'none';
        break;
      case 'F4':
        e.preventDefault();
        if (this.colliderLines) this.hideColliders();
        else this.showColliders();
        break;
      case 'BracketLeft':
        advanceClock(time, -0.01);
        break;
      case 'BracketRight':
        advanceClock(time, 0.01);
        break;
      case 'KeyP':
        time.paused = !time.paused;
        break;
    }
  };

  private showColliders(): void {
    this.drawnColliders = this.world.colliders.length;
    const verts: number[] = [];
    for (const collider of this.world.colliders) pushColliderOutline(collider, this.world, verts);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(verts, 3));
    this.colliderLines = new LineSegments(geometry, new LineBasicMaterial({ color: 0xff3df0, depthTest: false, fog: false }));
    this.colliderLines.renderOrder = 1000;
    this.colliderLines.frustumCulled = false;
    this.scene.add(this.colliderLines);
  }

  private hideColliders(): void {
    if (!this.colliderLines) return;
    this.scene.remove(this.colliderLines);
    this.colliderLines.geometry.dispose();
    (this.colliderLines.material as LineBasicMaterial).dispose();
    this.colliderLines = null;
  }
}

function pushColliderOutline(collider: Collider, world: WorldData, out: number[]): void {
  const y = world.surfaceHeight(collider.x, collider.z) + 0.15;
  const corners: [number, number][] = [];
  if (collider.kind === 'circle') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      corners.push([collider.x + Math.cos(a) * collider.radius, collider.z + Math.sin(a) * collider.radius]);
    }
  } else {
    const cos = Math.cos(collider.rotY);
    const sin = Math.sin(collider.rotY);
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = lx * collider.halfX;
      const z = lz * collider.halfZ;
      corners.push([collider.x + x * cos + z * sin, collider.z - x * sin + z * cos]);
    }
  }
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    out.push(a[0], y, a[1], b[0], y, b[1]);
  }
}
