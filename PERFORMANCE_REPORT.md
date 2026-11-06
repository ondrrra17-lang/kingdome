# Phase 4.5 performance report

## Scope and comparison status

Phase 4.5 keeps the existing world and simulation. The rendering changes already in
`128e5aa` use one skinned mesh per character, remove forest-bush shadow casting,
and restrict terrain and river indices to the visible depth range. Saving and the
permanent Playwright suite are documented in [SAVE_SYSTEM.md](SAVE_SYSTEM.md) and
[README.md](README.md).

**A final before/after comparison is unavailable.** The pre-4.5 build was stored outside
Git in a temporary directory on the previous computer. That directory is absent on this
computer. The repository starts with `61f9512`, which already includes the optimizations;
checking out that commit would not produce a baseline. No baseline was reconstructed
by guessing at earlier code.

The handoff described an earlier character A/B and an interim comparison against
`build-opt1`. Neither is a final-build comparison, and their raw artifacts are unavailable
here. They are not used as final measurements. Earlier README tables were from a different
machine and earlier milestones; they have been replaced rather than combined with this run.

## Method

The benchmark is [e2e/perf.spec.ts](e2e/perf.spec.ts), run against the production build
of `128e5aa` on 2026-11-06. Documentation changes do not change that build.
Hardware, run settings and the built asset's SHA-256 are also archived in
[environment.json](benchmarks/2026-11-06/environment.json).

- Windows, AMD Ryzen 5 3600, NVIDIA GeForce GTX 1660 (driver 32.0.15.9579),
  Node.js 22.13.1, installed Chrome 156.0.8078.81, headless, D3D11 requested.
- Viewport 1920 × 1080, device scale factor 1. These results say nothing about DPR 2.
- Each round opens a fresh browser context, so no previous save is loaded.
- Five fixed viewpoints cover village day/night, dense forest, Quiet Glade and Old Ruins.
  The day clock is paused, but NPCs, rendering and autosaving continue.
- Each fixed viewpoint settles for 2.5 seconds before sampling. Travel settles for
  1.5 seconds and uses the same three scripted sprint segments with teleports between
  them. Travel samples always last 15.5 seconds, independent of `PERF_SECONDS`.
- FPS and frame times come from a separate `requestAnimationFrame` probe. The 1% low
  is the reciprocal of the mean duration of the slowest 1% of frames.
- Each reported column is the median of that metric across rounds; columns need not
  come from the same round. Raw JSON includes FPS for every round.
- CPU time is the game's render/update submission interval, not total browser CPU time
  or GPU time. Its diagnostic window holds at most the last 600 frames.
- Simulation time is the smoothed step time at the end of a scenario, not a percentile
  or an average over the whole sample. Draws and triangles are renderer counters from
  the final frame, including shadow rendering, rather than scenario averages.
- GPU timer queries are used only when available. A missing timer is reported as null.
- The `?debug` diagnostics overlay and frame probes stay active. Their overhead is
  included; this is not a measurement with all instrumentation disabled.
- Builds and browser tests are run outside measurement windows. Other system activity
  is not controlled. Headless results can differ from a visible browser.

## Current build: uncapped

Five rounds, 15-second stationary windows. Raw results:
[perf-final-current.json](benchmarks/2026-11-06/perf-final-current.json).
Median navigation-to-game-ready time was 1,372 ms, including page navigation and startup;
this is not an isolated world-generation measurement.

| Scenario | Avg FPS | 1% low FPS | Mean frame ms | Median frame ms | Draws | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Village, day | 881.3 | 398.4 | 1.13 | 1.00 | 188 | 145,201 |
| Village, night | 1,019.7 | 414.9 | 0.98 | 0.90 | 179 | 143,033 |
| Dense forest | 1,105.8 | 305.6 | 0.90 | 0.80 | 167 | 154,199 |
| Quiet Glade | 1,072.6 | 287.9 | 0.93 | 0.80 | 171 | 201,650 |
| Old Ruins | 1,145.3 | 329.6 | 0.87 | 0.80 | 161 | 130,135 |
| Travel between regions | 992.9 | 387.3 | 1.01 | 0.90 | 217 | 180,865 |

Median reported GPU times were 0.84–0.90 ms, CPU submission times 0.77–1.04 ms,
and simulation endpoint times 0.015–0.037 ms. These intervals overlap and must not
be added together as a total frame cost.

Timing varied even on this machine: village-day round averages ranged from 703.3 to
1,107.2 FPS and Old Ruins from 846.5 to 1,173.6 FPS. All per-round FPS values are in the
JSON. This supports reporting a range and repeated measurements, not a precise speedup.
The very high uncapped FPS is a headless benchmark result, not display refresh rate.

All five rounds completed and the harness wrote the JSON. The runner then hung while
cleaning up its managed preview server and was interrupted after measurement. No clean
runner wall-clock duration is claimed for this run. Subsequent runs use an independently
served production build to avoid that teardown path.

## Current build: normal browser pacing

Three rounds, 12-second stationary windows. The completed Playwright run took **4.7 minutes**
against the separately served build, excluding its earlier compilation. This also matches
the default benchmark's round count and sampling windows; default uncapped timing has
not been measured as a separate clean run here.
Raw results: [perf-final-current-capped.json](benchmarks/2026-11-06/perf-final-current-capped.json).
Median navigation-to-game-ready time was 1,311 ms.

| Scenario | Avg FPS | 1% low FPS | Mean frame ms | Draws | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Village, day | 120.0 | 117.9 | 8.33 | 188 | 145,201 |
| Village, night | 120.0 | 117.9 | 8.33 | 176 | 142,297 |
| Dense forest | 120.0 | 117.8 | 8.33 | 167 | 154,199 |
| Quiet Glade | 120.0 | 117.6 | 8.33 | 171 | 201,650 |
| Old Ruins | 120.0 | 117.7 | 8.33 | 161 | 130,135 |
| Travel between regions | 120.0 | 117.7 | 8.33 | 216 | 180,505 |

This environment paced at approximately 120 Hz, not 60 Hz. `PERF_CAPPED=1` removes the
uncapping flags; it does not force a particular refresh rate. Every rounded per-round
scenario average was 120.0 FPS. There were no 5–30 FPS 1% lows in these measurements;
the earlier machine's reported lows remain unexplained, not fixed by this result.

Median GPU timer values were 4.28–4.49 ms, CPU submission values 1.04–1.28 ms, and simulation
endpoint values 0.020–0.034 ms. The GPU timer difference from the uncapped run does not
isolate a game-code change: the build is identical. GPU scheduling and power behavior
were not profiled. Nighttime and travel draw counts can differ because NPC visibility
and the final sampled frame vary.

## Streaming decision

No world-loading/unloading system was added. Vegetation already uses instanced batches
split into 36-unit X chunks, 12-unit forest depth bands and shadow-casting groups.
Frustum culling skips batches outside the camera; horizon culling also skips batches
that would project into the sky. Terrain and river draw only their visible index rows.
Off-screen and indoor NPC views skip animation and drawing.

This is visibility culling, with world data and geometry objects kept resident. It reduces
submitted work without unloading already uploaded GPU buffers. True streaming would require ownership,
unloading and reload rules without a measured memory or loading bottleneck to justify
that complexity for this map. No memory saving or streaming speedup is claimed.

## Simulation review

The fixed 60 Hz simulation and its game rules remain intact. NPC decisions run at
0.25-second intervals and pathfinding is limited to one search per simulation step.
Waiting travelers farther than 48 units from the player are dormant. Settled villagers
continue to simulate when off-screen, so work and construction remain consistent.

The handoff's earlier simulation timings are not substituted for final measurements.
The current endpoint measurements are reported with the rendering results. They do not
isolate pathfinding peaks or prove that no long task can occur. There is no evidence here
to justify changing simulation frequency or behavior for Phase 4.5.

## Limits and attribution

The final comparison cannot quantify how much each rendering change helped. Draw counts
alone do not establish an FPS gain. Changes to skinning, shadows and draw ranges were
already combined before this checkout; attributing a percentage to any one of them
would require controlled A/B builds.

The cause of poor 1% lows is unknown. No long-task trace, garbage-collection trace or
GPU stall capture was collected, so stalls, autosaves, shader compilation and background
load are possible explanations, not findings. The suite reports performance rather than
failing on a machine-dependent FPS threshold.

Daily income remains the temporary 2 coins per day. Assigning a basic job is free and
inviting a traveler costs 2 coins. A replacement economy is outside Phase 4.5.

## Validation

Checks on 2026-11-06:

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed for the game and e2e TypeScript projects |
| `npm.cmd test` | 110 tests passed, 13.70 seconds |
| `npm.cmd run build` | Passed; production assets built successfully |
| `npm.cmd run test:e2e -- --reporter=line` | 44 tests passed, 8.2 minutes |
| Normal-pacing benchmark | Passed, 3 complete rounds, 4.7 minutes |
| Uncapped benchmark | 5 complete rounds archived; runner interrupted during server teardown as described above |

Browser tests used `PERF_BASE_URL=http://localhost:5198` against the freshly built `dist`
served independently with Vite preview. This skips Playwright's managed-server build and
teardown, but tests the same production assets. No game or test source changed during
these checks. Documentation links, benchmark structure and `git diff --check` were
also checked. The full save/reload regression now passes as part of the complete suite.

## Reproducing a comparison

Keep the genuine pre-4.5 build in durable storage before claiming before/after results.
Build the current version first, then serve both production directories on unused ports:

```powershell
npm.cmd run build
npx.cmd vite preview --outDir dist --port 5198 --strictPort
# In another terminal, with the real baseline directory:
npx.cmd vite preview --outDir <baseline-directory> --port 5199 --strictPort
```

Run measurements sequentially, with no builds or tests running alongside them:

```powershell
$env:PERF_BASE_URL = 'http://localhost:5198'
$env:PERF_COMPARE_URL = 'http://localhost:5199'
$env:PERF_ROUNDS = '5'
$env:PERF_SECONDS = '15'
$env:PERF_LABEL = 'final'
Remove-Item Env:PERF_CAPPED -ErrorAction SilentlyContinue
npm.cmd run perf -- --reporter=line
# Copy test-results/perf-final.json somewhere durable before another Playwright run.

$env:PERF_CAPPED = '1'
$env:PERF_ROUNDS = '3'
$env:PERF_SECONDS = '12'
$env:PERF_LABEL = 'final-capped'
npm.cmd run perf -- --reporter=line
```

The harness alternates baseline and current builds each round. `PERF_BASE_URL` is the
current build and `PERF_COMPARE_URL` is the baseline. Remove `PERF_COMPARE_URL` for a
current-only measurement. Results are written only after a complete run; interruption
leaves no final JSON. Playwright clears `test-results` at the next run, so archive results
first. `PERF_ONLY` filters scenario names for investigation.
