# Emberwick Vale

A playable 2.5D medieval fantasy prototype: a small living village in a forest valley,
seen under an orthographic camera through a full day/night cycle. Five villagers follow
their own routines. Set them to bringing in wood, pay for new buildings and watch them get
built, or leave the valley to look for treasure, old places and new villagers. Progress is
saved in the browser.
Built with Three.js, TypeScript (strict) and Vite. No backend or paid services.

The village now has a small food economy, farming, hunting and a visiting merchant.
There is no combat yet, by design.

## Install and run

Requires Node.js 22 or newer (developed on 24).

```bash
npm install
npm run dev        # dev server with hot reload, diagnostics on
npm run build      # type-check, then production build into dist/
npm run preview    # serve the production build
npm run typecheck  # type-check the game and the browser tests
npm test           # unit and simulation tests, about 20 s
npm run test:e2e   # browser tests with real key presses; timing in PHASE_5_REPORT.md
npm run perf       # frame-rate benchmark of six scenarios; timing in PERFORMANCE_REPORT.md
```

### Browser tests

`npm run test:e2e` builds the game, serves it, and plays it in Chrome with Playwright on the
real GPU, one test at a time. Each test starts with a fresh game, and also fails if the browser
logs an error or warning. Screenshots of failures go to `test-results/`.

They use your installed Chrome, so nothing extra is downloaded. Without Chrome, run
`npx playwright install chromium` and remove `channel: 'chrome'` from
[playwright.config.ts](playwright.config.ts).

Many tests depend on real time passing, so heavy load on the machine can make one fail.
`npm run perf` only reports numbers and never fails on them, because they depend on the machine.

## Controls

| Input | Action |
| --- | --- |
| `A` / `D` (or `←` / `→`) | Walk along X |
| `W` / `S` (or `↑` / `↓`) | Walk in depth along Z |
| `Shift` | Sprint |
| `E` | Interact with what the ring highlights |
| `R` | Choose a nearby settled villager's profession (or click **Professions**) |
| `Esc` | Close the profession or trading panel |
| `Ctrl+S` | Save (or the **Save** button at the top right) |

Development builds, or a production build opened with `?debug`, add:

| Input | Action |
| --- | --- |
| `F3` | Toggle the diagnostics panel |
| `F4` | Draw collider outlines |
| `[` / `]` | Scrub the time of day |
| `P` | Pause the day clock |

## How to play

You start with 5 coins. Walk up to a villager and press `E` to make them a woodcutter, which
is free. They find a tree, chop it, and carry the logs to the wood pile beside Alder
Cottage. Each trip adds 3 wood, up to the pile's limit. Coins, stored wood and the day
number are shown at the top right. The campfire, the wood pile and the house doors can
also be used with `E`.

Five marked building sites stand around the village. Walk up to one and press `E` to pay.
The nearest free villager then walks over and builds it during daylight:

| Building | Cost | Effect |
| --- | --- | --- |
| Woodcutter's Hut | 4 wood, 2 coins | Allows one more woodcutter (one is allowed at first) |
| Wooden Watchtower | 6 wood, 3 coins | Records a watch post for future defense; no combat yet |
| Storage Shed | 5 wood, 2 coins | Raises the wood limit from 10 to 25 |
| Small Farm | 5 wood, 2 coins | Workplace for one farmer |
| Hunter's Lodge | 6 wood, 3 coins | Workplace for one hunter |

The village still pays 2 coins at the start of each new day as a progression safety net.
Trading now also provides renewable income. Set `ECONOMY.dailyCoins` to 0 to turn the
allowance off; the default keeps it enabled for this phase.
Alda already has a job gathering firewood for the campfire, and that does not go into storage.

### Food, professions and trade

New games start with 9 food. Each midnight the village consumes one food per three settled
villagers, rounded up. The initial five villagers use 2 food per day. Waiting travelers and
the merchant do not count. At zero food, work runs at 60% speed; nobody dies or leaves,
and food production still works. A persistent warning explains the shortage.

Stand near a settled villager and press `R`, or click **Professions**, to choose Unemployed,
Woodcutter, Farmer or Hunter. Assignments are free. Farmers need a finished Small Farm;
hunters need a finished Hunter's Lodge. Each has one slot. Builders are selected automatically
from unemployed villagers. Finish a building assignment or deliver a carried load before
changing that worker's profession. Alda keeps her campfire job.

A farmer walks to the field, tends visibly growing crops, harvests 5 food and carries it to
storage. A hunter visits authored forest hunting spots, then returns with 5 food; every third
successful hunt also yields one fur. Work stops for evening routines and sleep. Partial crop
growth and hunting progress survive interruptions and loading. Resources only arrive on delivery.

Rowan enters from the west starting on day 3, walks to the market near the village fire,
and visits approximately every three days. A visit lasts 0.65 game days after arrival.
Stand nearby and press `E` to open the small trading panel:

| Trade | Exchange |
| --- | --- |
| Sell wood | 5 wood for 2 coins |
| Sell furs | 2 furs for 4 coins |
| Buy food | 2 coins for 3 food |

The world continues while the panel is open. Each click makes one validated exchange;
unaffordable trades are disabled. `Esc` closes it. Prices, yields, work durations and visit
timing live in `ECONOMY` and `KINGDOM` in `src/config.ts`.

### Small world events

- **Lost Supplies:** recover food and some wood from the abandoned cache beside the north
  road near the ruins. The cache pays once; wood is limited by storage space.
- **Traveler's Rumor:** talk to Wren before settling them to hear about an unopened chest
  near an existing landmark. The rumor never points to a chest already opened.
- **Village Request:** talk to Alda to accept a request for 3 wood, then talk again with the
  wood to receive 2 coins. This authored request pays once.

Event outcomes, current requests, merchant visits and all economic progress are saved.
See [PHASE_5_REPORT.md](PHASE_5_REPORT.md) for validation and measured performance.

### Beyond the valley

The roads north and south no longer end at barriers. Follow them, or look for the unmarked
gap in the trees, to reach six places:

| Place | Where | How to get there |
| --- | --- | --- |
| The Old Ruins | North | The road north from the village |
| The Quiet Glade | North-west | From the ruins, or a faint trail through the valley's north edge near x -48 |
| Travelers' Camp | North-east, across the river | The road north after the bridge |
| Wayside Shrine | South | The road south from the village |
| Abandoned Camp | South-west | The western road south, or the trail from the shrine |
| Charcoal Burners' Hollow | South-east, across the river | A trail south after the bridge |

Reaching a place announces it, and each has something to examine with `E`.

Eight chests hold 29 coins in all. Each pays a fixed 2 to 6 coins, once. Some stand beside
the paths and others are off them, and a slow glint helps to spot them.

Three travelers wait in the forest: Wren and Tobin at the Travelers' Camp, Maren at the
shrine. Inviting one costs 2 coins. They walk to the village on their own, day or night, and
only count as villagers when they get there. From then on they are ordinary villagers who
can build or be made woodcutters, at no further cost.

### Saving

The game saves by itself every 30 seconds, soon after anything significant, and when the page
is hidden or closed. On your next visit the start screen offers **Continue Game** and
**New Game**. New Game always asks first. Saves stay in this browser, so clearing its site data
deletes them. See [SAVE_SYSTEM.md](SAVE_SYSTEM.md) for what is saved and how damaged saves are
handled.

## What is implemented

- **Villagers:** five independent villagers with idle, walk, work and rest states. They
  stop to face you when you talk to them.
- **Routines:** by day they wander, stand by the fire or houses, or work. In the evening
  they return to the settlement. At night each goes inside their own house. Times vary a
  little per villager, the same way on every run.
- **Navigation:** A* on a walkability grid built from the collision data, so villagers
  use the bridge and go around obstacles, and recover if they get stuck.
- **Interaction:** one reusable system. The nearest available thing in range gets the
  ring and the prompt, and one key press triggers it once.
- **Resources and HUD:** coins and wood in central game state, shown with the day number.
- **Construction:** sites go AVAILABLE, FUNDED, BUILDING, COMPLETED. Costs are taken once.
  Each site has one builder and each builder one site, and a site waits if nobody is free.
  Builders stop at dusk and return in the morning. Buildings appear piece by piece with
  scaffolding and a shrinking timber pile, and become solid for collision and navigation.
- **World:** baked heightfield terrain, a main road along X with four branches in Z, a
  river with an arched wooden bridge, three houses, a campfire, fences, lanterns and a
  woodpile. Forest paths, clearings and six distinct places surround the valley, for 2.1
  times its walkable area. Everything is authored in `EXPLORATION` in `src/config.ts`.
- **Forest edge:** one signed-distance field (`OpenField`) says where the forest is open.
  Collision, scatter, terrain and ground color all read it. The valley's own scatter comes
  from its original random stream, so it stayed in place when the map grew.
- **Exploration:** chests and discovered places are plain state keyed by stable ids.
- **Saving:** one versioned JSON save in `localStorage`, with a backup of the save before it.
  Loading checks every value and applies the game's rules again.
- **Travelers:** the same NPC state, navigation and interaction as villagers. The river can
  still only be crossed on the bridge.
- **Scenery:** instanced trees, bushes, rocks, grass and flowers, plus three parallax
  silhouette layers (treeline, hills, mountains).
- **Collision:** buildings, trees, rocks, props, the forest edge, fences, barriers, river
  and bridge rails, and the world bounds, with sliding along surfaces.
- **Camera:** orthographic at 26° elevation and 8° yaw, with damped tracking, look-ahead
  in the direction of travel, partial depth follow and responsive resizing. Beyond the
  valley it follows the player in depth too.
- **Horizon:** the north limit of what is drawn moves ahead of a player walking north, which
  keeps sky and mountains in view. From the village it stays exactly where it was.
- **Player:** acceleration and deceleration, sprint, turning and a procedural walk/run
  animation on a jointed placeholder character.
- **Atmosphere:** keyframed day/night cycle (240 s by default), fog, sky with sun, moon,
  stars and clouds, one shadow-casting directional light that moves from sun to moon,
  campfire light, glowing windows and lanterns, embers, drifting motes and fireflies,
  wind sway. No postprocessing.

Known simplifications, all deliberate for this milestone:

- Foliage sway is not reflected in the shadow pass.
- Water does not receive real shadows; the shade under the bridge is painted in its shader.
- The sun's light direction is biased toward the camera and does not exactly match
  the disc in the sky, so that building fronts stay readable at sunset.
- There is no audio, gamepad or touch input.
- Villagers step aside for the player but do not block them, so they can never trap you.
- A structure turns solid once nobody is standing in its footprint. If you stay inside it,
  it stays walkable until you step out.
- A woodcutter's last delivery is cut short when the pile has too little room left.
- Trees are not used up by chopping, and villagers go in and out of doors without an animation.
- Far to the south the view looks down at the ground and the village rather than the sky.
- Trees and props grow out of the ground as they cross the horizon, instead of being cut in half.
- Forest thinner than the edge's own width, between two nearby openings, can be stepped through.

## Project layout

```
e2e/          Browser tests (Playwright), one spec per area, and perf.spec.ts
src/
  config.ts   Every tunable constant: feel, camera, layout, atmosphere, palette
  main.ts     Boot, start screen, WebGL failure message, hot-reload disposal
  core/       Game (composition root), GameLoop, GameState, Input, math, disposal
  systems/    PlayerMovementSystem, CollisionWorld, DayNightSystem, Resources, Recruitment
    npc/          NpcSystem, NpcBrain (state machine), NpcLocomotion, schedule, VillageSites
    navigation/   NavGrid, Pathfinder (A*)
    interaction/  InteractionSystem, villageInteractables
    construction/ ConstructionState (rules), ConstructionSystem, siteInteractables
    exploration/  ExplorationState (rules, save data), ExplorationSystem, explorationInteractables
    economy/      FoodSystem, ProductionSystem, Professions, MerchantSystem, WorldEvents
    save/         SaveData (format, checking, applying), SaveStore (storage), SaveSystem (when to save)
  entities/   Npc (state), NpcView, ActorView, CharacterVisual interface, PlaceholderCharacter
  world/      WorldData (pure layout), OpenField, Heightfield, Paths, ExplorationView and other views
    placeholders/   Procedural prop, location and vegetation geometry
  rendering/  RendererHost, CameraRig, AtmosphereView, SkyView, HudView, SaveView, Diagnostics, helpers
```

**State and visuals are separate.** `GameState` and `WorldData` contain plain data and
no scene objects, so villagers can be simulated and tested without a renderer. Systems update state on a fixed 60 Hz step, and views read it each
rendered frame, interpolating between the last two simulation steps.

**Replacing placeholders with GLB assets.** No GLB loader is included yet. These are
the seams for adding one:

- *Character:* implement the `CharacterVisual` interface
  ([src/entities/CharacterVisual.ts](src/entities/CharacterVisual.ts)) and pass it to
  `ActorView` in `Game` or `NpcView`. It receives stride, speed, turn and pose data every frame.
- *Props:* replace the `buildX` calls in
  [src/world/SettlementView.ts](src/world/SettlementView.ts). Position and collision come
  from world data, so they do not change. Construction visuals are in
  [src/world/placeholders/buildings.ts](src/world/placeholders/buildings.ts), and a
  replacement has to be revealable in stages.
- *Vegetation:* return different geometries from `buildVegetationPrototypes`
  ([src/world/placeholders/vegetation.ts](src/world/placeholders/vegetation.ts)). Models
  need merging into one geometry per kind to stay instanced.

## Performance

Phase 4.5 uses skinned characters, visible terrain and river draw ranges, and existing
instanced vegetation culling. World data stays resident and the simulation keeps running
for off-screen villagers.

See [PHASE_5_REPORT.md](PHASE_5_REPORT.md) for the Phase 5 before/after comparison, active
economy measurements, validation and limitations. Earlier Phase 4.5 measurements and
methodology are archived in [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md).

Run `npm run perf` to measure six scenarios on your machine. It uses a production build,
1920 × 1080 at DPR 1, three rounds and uncapped frame pacing by default. Set `PERF_CAPPED=1`
for normal browser pacing. Results are written to `test-results/perf-current.json` only
when the run completes. Archive that file before another Playwright run clears the directory.
Use `PERF_ONLY='Village, day|Dense forest'` to measure just those two scenarios.
`PERF_ECONOMY=1` starts a built and staffed Phase 5 village with a visiting merchant for
an additional workload check; use it with the current build only. Runtime depends on the
selected scenarios, rounds and machine.
Open a development build, or a production build with `?debug`, for the diagnostics panel.
Headless results can differ from a visible browser.
