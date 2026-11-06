# Phase 5 — Living Kingdom

Phase 5 extends the existing game rather than replacing its simulation, navigation,
construction or rendering. Food, furs, farming, hunting, merchant trade and three authored
events now connect exploration to village progression.

## Playing

- Build a Small Farm (5 wood, 2 coins) or Hunter's Lodge (6 wood, 3 coins), then use
  **R / Professions** near a settled villager. Assignments are free and each workplace
  has one slot. Builders still come from unemployed villagers automatically.
- Farmers visibly tend a field through growth stages and carry 5 food to storage.
  Hunters travel to existing forest clearings, bring 5 food and earn one fur every third
  successful hunt. Partial progress persists through sleep and loading. Cargo only pays
  when delivered; workers must deliver before changing jobs.
- Food costs one per three settled villagers each completed day, rounded up. A new game
  starts with 9. Zero food slows work to 60%; it never kills or removes villagers and
  food producers can recover. The persisted day ledger prevents repeat charges after
  loading or moving the clock backward. Forward skips use the current population for
  the elapsed days; they do not retroactively simulate production or population history.
- Rowan walks in from the west starting on day 3, trades near the village fire and leaves
  after 0.65 game days. Visits are scheduled roughly three days apart. The merchant uses
  the existing NPC path queue, collision, locomotion and character view, and is excluded
  from population and food consumption.
- Trades are 5 wood → 2 coins, 2 furs → 4 coins, and 2 coins → 3 food. Validated atomic
  exchanges refuse invalid quantities and insufficient resources. The daily 2-coin
  allowance remains enabled.
- Lost Supplies rewards one cache near the north road; Wren gives one unopened-chest
  rumor; Alda offers one request for 3 wood, paying 2 coins. Stable authored IDs and
  saved completion flags prevent repeated rewards.

## State and architecture

`Resources`, `FoodSystem`, `ProductionSystem`, `Professions`, `MerchantSystem` and
`WorldEvents` keep their responsibilities separate. `Game` wires them into the original
fixed step. No pathfinding runs in rendering. Work happens regardless of camera position;
the field, tools, sacks and cart only read state. Crops and props use merged low-poly
geometry, and the existing single skinned mesh per character remains in use.

Save version 2 adds resources, workplaces, crop/hunt progress and cargo, the food ledger,
merchant phase/position/schedule, and event/request state. Version 1 migrates without
resetting existing progress or charging historical food. A genuine save written by the
preserved pre-Phase-5 build is committed as a migration fixture. Malformed values and
impossible or duplicate workplace assignments are repaired. See [SAVE_SYSTEM.md](SAVE_SYSTEM.md).

Adding more sites exposed an existing builder handoff problem: a worker completing one
site could reuse the old `build` task at a new site. Assigning a new construction task now
clears the previous action and route before the worker walks over. The real-world
construction test covers all five buildings and verifies physical work positions.

## Validation

TypeScript checks for game and browser tests and the production build passed. All **128
unit/integration tests** passed (19.73 seconds in the final full run). The tests cover
commands and negative inputs, costs, capacity, cargo and reward uniqueness, hunger and
recovery, real-world navigation, day/night work, merchant scheduling and save migration.
All **49 browser tests** passed in one complete run (**14.6 minutes**, no retries), including
the original 44 tests. They build and assign both new workplaces, observe actual work and
delivery, save and resume field growth, recover from zero food, trade with an arriving
merchant, check its departure, collect and reload event outcomes, and continue the genuine
version 1 save. The game fixture rejects browser console warnings and errors.
After that run, the cache reward message was moved to a lasting notice because removing
the collected cache also removes its interaction focus. Its full event/save browser
scenario was repeated successfully on the final build (11.3 seconds), along with all
128 unit tests. The final benchmark uses this build; both build hashes are archived.

Browser tests used the fresh production build served separately on port 5198. A prior
unit-test baseline was 110 passing tests. The old save-version assertion and construction
tests were extended for the new schema and five sites; original gameplay checks remain.
Desktop and 390-pixel-wide UI captures were inspected; the profession panel stayed within
the viewport with no horizontal document overflow. This does not add touch controls.

Two independent ten-day runs used the actual 60 Hz simulation step, with one prebuilt
workplace, five villagers and the player away from production. Neither run used trading,
cache rewards or request rewards; the daily allowance stayed enabled.

| Sole food worker | Final day | Food | Furs | Coins | Path searches | Next merchant day |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Farmer | 11 | 84 | 0 | 25 | 500 | 12 |
| Hunter | 11 | 39 | 3 | 25 | 483 | 12 |

The archived [ten-day results](benchmarks/phase5-2026-11-06/economy-ten-days.json) come from
the final unit-test output. The hunter completed ten hunts. Both runs kept balances nonnegative and left untriggered
events unchanged. These are steady-state checks with a workplace already built; browser
tests separately cover paying for and constructing the workplaces before assigning jobs.

## Performance method

Measurements use the preserved pre-Phase-5 production build from `d7b0f36` and the final
Phase 5 build. [environment.json](benchmarks/phase5-2026-11-06/environment.json) records
their asset hashes, hardware and run settings. Chrome's WebGL renderer confirmed **NVIDIA
GeForce GTX 1660 via ANGLE / D3D11**, with a Ryzen 5 3600 and Chrome 156.0.8078.81.

Each result is a median of three rounds, at 1920 × 1080, DPR 1, using 12-second stationary
samples after camera settling. Before/after runs alternate builds in the same browser;
each starts a fresh game. The day clock is paused while NPCs and autosaving continue.
The debug panel and timer probes stay enabled. No builds or other game tests run alongside
measurement, but unrelated system activity is not controlled.

FPS comes from frame intervals; 1% low is the reciprocal of the mean slowest 1% of intervals.
Draws and triangles are counters from the final sampled frame, not scenario averages.
Simulation timing is a smoothed endpoint measurement, not a measured worst-case bound.
Columns are independently medianed across rounds; individual FPS values remain in the JSON.

The additional active workload starts all five buildings completed, with their effects,
one farmer, one hunter, one woodcutter and a visiting merchant. It tests a more developed
world, so it is reported separately from the like-for-like fresh-game comparison.
The short samples do not replace the ten-day production simulations or browser gameplay.

To reproduce, serve the two built directories on unused ports 5198 (current) and 5199
(baseline), then run:

```powershell
Remove-Item Env:PERF_CAPPED,Env:PERF_ECONOMY -ErrorAction SilentlyContinue
$env:PERF_BASE_URL = 'http://localhost:5198'
$env:PERF_COMPARE_URL = 'http://localhost:5199'
$env:PERF_ONLY = 'Village, day|Dense forest'
$env:PERF_ROUNDS = '3'
$env:PERF_SECONDS = '12'
$env:PERF_LABEL = 'phase5-compare'
npm.cmd run perf
```

For the active workload, remove `PERF_COMPARE_URL` and set `PERF_ECONOMY=1`. Also set
`PERF_CAPPED=1` for ordinary browser pacing; this removes the uncapping flags rather than
forcing 60 Hz. Archive `test-results/perf-<label>.json` before another Playwright run clears it.

## Measured before/after results

The completed uncapped comparison took 3.3 minutes, excluding prior compilation.
Raw data: [perf-phase5-compare.json](benchmarks/phase5-2026-11-06/perf-phase5-compare.json).

| Scene | Build | Avg FPS | 1% low FPS | Mean frame ms | Draws | Triangles |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Village, day | Before | 1,039.0 | 496.8 | 0.96 | 188 | 145,201 |
| Village, day | Phase 5 | 968.5 | 480.9 | 1.03 | 194 | 148,226 |
| Dense forest | Before | 1,167.0 | 336.0 | 0.86 | 167 | 154,199 |
| Dense forest | Phase 5 | 1,160.5 | 359.5 | 0.86 | 170 | 157,158 |

Village average FPS fell 6.8% in this run; the forest median fell 0.6%. This is measured
overhead, not an improvement. The additional rendering work was six village draws and
three forest draws. Village CPU submission medians changed from 0.83 to 0.89 ms and GPU
timer medians stayed at 0.79 ms. These measurements do not isolate each feature's cost.
Uncapped village averages ranged from 1,032.1–1,092.2 FPS before and 895.8–984.7 after;
forest ranges were 1,137.5–1,172.1 before and 1,122.9–1,161.0 after.

### Active economy

Both additional runs completed in 1.6 minutes each. Raw data:
[uncapped](benchmarks/phase5-2026-11-06/perf-phase5-active.json) and
[ordinary pacing](benchmarks/phase5-2026-11-06/perf-phase5-active-capped.json).

| Scene | Pacing | Avg FPS | 1% low FPS | Draws | Triangles |
| --- | --- | ---: | ---: | ---: | ---: |
| Village, day | Uncapped | 939.6 | 457.5 | 192 | 150,666 |
| Dense forest | Uncapped | 1,171.7 | 480.6 | 174 | 159,720 |
| Village, day | Ordinary | 120.0 | 117.6 | 193 | 150,682 |
| Dense forest | Ordinary | 120.0 | 117.7 | 174 | 159,720 |

Ordinary browser pacing was approximately 120 Hz on this machine. All rounded per-round
averages were 120.0 FPS. The active workload's simulation endpoint medians were
0.019–0.041 ms per step across these runs, which does not bound individual pathfinding
peaks. Draw counters can differ with NPC visibility and the last sampled frame. The
results support this tested desktop configuration; they do not certify 60 FPS on integrated
graphics, DPR 2, all times of day or every possible village state.

## Known limits

- Hunting uses designated clearings and a bow activity; there is no wildlife simulation
  or combat. The cart is decorative and follows its merchant's navigated footprint.
- There is one farm and one lodge, each with one worker. The three events are authored
  one-time opportunities, not a procedural quest system.
- Production pauses outside daytime; harvests and cargo resume on load, while paths and
  animation poses are rebuilt. This does not simulate offline time.
- The allowance is still a progression safety net; the ten-day checks do not establish
  a complete market balance without it.
- Performance measurements on the available discrete GPU cannot certify the integrated
  graphics target. Browser timing is machine-dependent.
