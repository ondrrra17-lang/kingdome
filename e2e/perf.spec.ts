import { mkdirSync, writeFileSync } from 'node:fs';
import { test, type Browser, type Page } from '@playwright/test';
import { BUILDINGS } from '../src/config';

/**
 * Reproducible frame-rate benchmark. It reports numbers and never fails on them, because
 * they depend on the machine. Run with `npm run perf`, or see PERFORMANCE_REPORT.md for
 * comparing two builds.
 *
 * The frame rate is uncapped by default, so a change is visible even when both versions
 * would reach 60 on a real display. Set PERF_CAPPED=1 to measure at normal vsync, which is
 * closer to what a player sees. No screenshots are taken: they would stall the frames.
 *
 * PERF_ROUNDS   rounds per build (default 3)
 * PERF_SECONDS  sampling window per scenario (default 12)
 * PERF_LABEL    name for the results file in test-results/ (default "current")
 * PERF_ONLY     only scenarios whose name contains this
 *               use | between alternatives, e.g. "Village, day|Dense forest"
 * PERF_ECONOMY  set to 1 for a built, staffed Phase 5 village (current build only)
 */

const ROUNDS = Number(process.env.PERF_ROUNDS ?? 3);
const SECONDS = Number(process.env.PERF_SECONDS ?? 12);
const LABEL = process.env.PERF_LABEL ?? 'current';

interface Sample {
  frames: number;
  avgFps: number;
  low1Fps: number;
  avgFrameMs: number;
  medianFrameMs: number;
  worstFrameMs: number;
  cpuMs: number;
  simMs: number;
  gpuMs: number | null;
  drawCalls: number;
  triangles: number;
}

interface Scenario {
  name: string;
  dayTime: number;
  /** Where to stand, or a scripted walk with real keys. */
  at?: readonly [number, number];
  route?: readonly (readonly [x: number, z: number, key: string, ms: number])[];
}

const ALL_SCENARIOS: readonly Scenario[] = [
  { name: 'Village, day', dayTime: 0.45, at: [-8, 2] },
  { name: 'Village, night', dayTime: 0.95, at: [-8, 2] },
  { name: 'Dense forest', dayTime: 0.45, at: [-13, -35] },
  { name: 'Quiet Glade', dayTime: 0.45, at: [-50, -31] },
  { name: 'Old Ruins', dayTime: 0.45, at: [3, -34] },
  { name: 'Travel between regions', dayTime: 0.45, route: [[-60, 1, 'KeyD', 7000], [5.6, 0, 'KeyW', 5000], [-25, 6, 'KeyS', 3500]] },
];

const FILTERS = (process.env.PERF_ONLY ?? '').split('|');
const SCENARIOS = ALL_SCENARIOS.filter((s) => FILTERS.some((filter) => s.name.includes(filter)));

/** Starts timing every frame in the page. GPU time is measured if the browser allows it. */
async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = window.__game;
    const renderer = game.rendererHost.renderer;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    const probe = { frames: [] as number[], gpu: [] as number[], last: 0, on: false, hasTimer: ext !== null };
    (window as unknown as { __probe: typeof probe }).__probe = probe;

    const pending: WebGLQuery[] = [];
    const originalRender = renderer.render.bind(renderer);
    renderer.render = (scene: unknown, camera: unknown): void => {
      if (!ext) {
        originalRender(scene, camera);
        return;
      }
      const query = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      originalRender(scene, camera);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(query);
      while (pending.length > 0 && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const done = pending.shift()!;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        if (!disjoint && probe.on) probe.gpu.push(gl.getQueryParameter(done, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(done);
      }
    };

    const tick = (now: number): void => {
      if (probe.on && probe.last > 0) probe.frames.push(now - probe.last);
      probe.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function begin(page: Page): Promise<void> {
  return page.evaluate(() => {
    const { __probe: probe } = window as unknown as { __probe: { frames: number[]; gpu: number[]; on: boolean } };
    probe.frames.length = 0;
    probe.gpu.length = 0;
    probe.on = true;
    window.__game.diagnostics.resetTiming();
  });
}

function end(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const { __probe: probe } = window as unknown as { __probe: { frames: number[]; gpu: number[]; on: boolean } };
    probe.on = false;
    const frames = [...probe.frames].sort((a, b) => a - b);
    const total = frames.reduce((sum, v) => sum + v, 0);
    const worstCount = Math.max(Math.floor(frames.length * 0.01), 1);
    const worst = frames.slice(frames.length - worstCount);
    const worstAvg = worst.reduce((sum, v) => sum + v, 0) / worstCount;
    const diagnostics = window.__game.diagnostics;
    const summary = diagnostics.summary();
    const gpu = probe.gpu;
    return {
      frames: frames.length,
      avgFps: 1000 / (total / frames.length),
      low1Fps: 1000 / worstAvg,
      avgFrameMs: total / frames.length,
      medianFrameMs: frames[Math.floor(frames.length / 2)],
      worstFrameMs: frames[frames.length - 1],
      cpuMs: summary.avgCpuMs,
      simMs: diagnostics.simStepMs,
      gpuMs: gpu.length > 0 ? gpu.reduce((sum, v) => sum + v, 0) / gpu.length : null,
      drawCalls: summary.drawCalls,
      triangles: summary.triangles,
    };
  });
}

function teleport(page: Page, x: number, z: number): Promise<void> {
  return page.evaluate(([px, pz]) => {
    const g = window.__game;
    const s = g.state.player;
    s.x = s.prevX = px;
    s.z = s.prevZ = pz;
    s.y = s.prevY = g.world.surfaceHeight(px, pz);
    s.vx = s.vz = 0;
  }, [x, z]);
}

async function runScenario(page: Page, scenario: Scenario): Promise<Sample> {
  await page.evaluate((dayTime) => {
    const { time } = window.__game.state;
    time.dayTime = dayTime;
    time.paused = true;
  }, scenario.dayTime);

  if (scenario.at) {
    await teleport(page, scenario.at[0], scenario.at[1]);
    await page.waitForTimeout(2500); // Camera settles, and villagers react to the set time.
    await begin(page);
    await page.waitForTimeout(SECONDS * 1000);
    return end(page);
  }

  const route = scenario.route ?? [];
  await teleport(page, route[0][0], route[0][1]);
  await page.waitForTimeout(1500);
  await begin(page);
  for (const [x, z, key, ms] of route) {
    await teleport(page, x, z);
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    await page.keyboard.up('ShiftLeft');
  }
  return end(page);
}

async function runRound(browser: Browser, baseURL: string): Promise<{ loadMs: number; samples: Sample[] }> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const started = Date.now();
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__game, undefined, { timeout: 90_000 });
  const loadMs = Date.now() - started;
  if (process.env.PERF_ECONOMY === '1') {
    await page.evaluate((effects) => {
      const g = window.__game, s = g.state;
      if (!s.kingdom) throw new Error('PERF_ECONOMY requires the Phase 5 build.');
      for (const site of s.construction) { site.status = 'completed'; site.progress = 1; }
      for (const effect of effects) {
        if (effect.kind === 'woodStorage') s.resources.woodCapacity += effect.amount;
        if (effect.kind === 'woodcutterSlot') s.village.maxWoodcutters += effect.amount;
        if (effect.kind === 'watchPost') s.village.watchPosts += effect.amount;
      }
      const jobs = [['bren', 'farmer', 'farm'], ['cora', 'hunter', 'lodge'], ['dunn', 'woodcutter', null]];
      for (const [id, job, workplace] of jobs) {
        const n = s.npcs.find((n: { id: string }) => n.id === id);
        n.job = job; n.workplace = workplace; n.state = 'idle'; n.task = 'none'; n.stateTimer = 0;
        n.pathStatus = 'none'; n.pathLength = 0; n.arrived = false;
      }
      const merchant = g.merchantSystem.npc;
      merchant.x = merchant.prevX = -12; merchant.z = merchant.prevZ = 1.5;
      merchant.y = merchant.prevY = g.world.surfaceHeight(merchant.x, merchant.z);
      merchant.dormant = false; merchant.arrived = true;
      s.kingdom.merchant.phase = 'arriving';
      s.kingdom.merchant.nextVisitDay = 6;
      s.kingdom.field = { stage: 'growing', progress: 0.4 };
    }, BUILDINGS.map((def) => def.effect));
  }
  await installProbe(page);
  await page.waitForTimeout(1500);
  const samples: Sample[] = [];
  for (const scenario of SCENARIOS) samples.push(await runScenario(page, scenario));
  await context.close();
  return { loadMs, samples };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

test('frame rate benchmark', async ({ browser, baseURL }) => {
  test.setTimeout(0);
  const compare = process.env.PERF_COMPARE_URL;
  const builds: [string, string][] = [[LABEL, baseURL!]];
  if (compare) builds.unshift(['baseline', compare]);

  const results = new Map<string, { loadMs: number; samples: Sample[] }[]>();
  // Alternating builds round by round, so that background load hits both alike.
  for (let round = 0; round < ROUNDS; round++) {
    for (const [label, url] of builds) {
      const result = await runRound(browser, url);
      results.set(label, [...(results.get(label) ?? []), result]);
      console.log(`round ${round + 1}/${ROUNDS} ${label} done`);
    }
  }

  const fmt = (v: number | null, digits = 1): string => (v === null ? 'n/a' : v.toFixed(digits));
  const output: Record<string, unknown> = {};
  for (const [label, runs] of results) {
    console.log(`\n=== ${label} (median of ${runs.length}, load ${fmt(median(runs.map((r) => r.loadMs)), 0)} ms) ===`);
    console.log('scenario                 | fps    | 1% low | frame ms | median | gpu ms | cpu ms | sim ms | draws | tris   | fps per round');
    const scenarios = SCENARIOS.map((scenario, i) => {
      const of = (pick: (s: Sample) => number): number => median(runs.map((r) => pick(r.samples[i])));
      const gpuRuns = runs.map((r) => r.samples[i].gpuMs).filter((v): v is number => v !== null);
      const row = {
        name: scenario.name,
        avgFps: of((s) => s.avgFps),
        low1Fps: of((s) => s.low1Fps),
        avgFrameMs: of((s) => s.avgFrameMs),
        medianFrameMs: of((s) => s.medianFrameMs),
        worstFrameMs: of((s) => s.worstFrameMs),
        gpuMs: gpuRuns.length > 0 ? median(gpuRuns) : null,
        cpuMs: of((s) => s.cpuMs),
        simMs: of((s) => s.simMs),
        drawCalls: of((s) => s.drawCalls),
        triangles: of((s) => s.triangles),
        fpsPerRound: runs.map((r) => Number(r.samples[i].avgFps.toFixed(1))),
      };
      console.log(`${row.name.padEnd(24)} | ${fmt(row.avgFps).padStart(6)} | ${fmt(row.low1Fps).padStart(6)} | ${fmt(row.avgFrameMs, 2).padStart(8)} | ${fmt(row.medianFrameMs, 2).padStart(6)} | ${fmt(row.gpuMs, 2).padStart(6)} | ${fmt(row.cpuMs, 2).padStart(6)} | ${fmt(row.simMs, 3).padStart(6)} | ${String(row.drawCalls).padStart(5)} | ${String(row.triangles).padStart(6)} | ${row.fpsPerRound.join(' ')}`);
      return row;
    });
    output[label] = { rounds: runs.length, loadMs: median(runs.map((r) => r.loadMs)), scenarios };
  }
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/perf-${LABEL}.json`, JSON.stringify(output, null, 2));
});
