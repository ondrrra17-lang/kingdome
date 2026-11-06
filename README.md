# Emberwick Vale

A playable 2.5D medieval fantasy prototype: a small living village in a forest valley,
seen under an orthographic camera through a full day/night cycle. Five villagers follow
their own routines. Hire them to bring in wood, pay for new buildings and watch them get
built, or leave the valley to look for treasure, old places and new villagers.
Built with Three.js, TypeScript (strict) and Vite. No backend or paid services.

There is no combat or advanced economy yet, by design.

## Install and run

Requires Node.js 22 or newer (developed on 24).

```bash
npm install
npm run dev        # dev server with hot reload, diagnostics on
npm run build      # type-check, then production build into dist/
npm run preview    # serve the production build
npm run typecheck  # type-check the game and the browser tests
npm test           # unit and simulation tests, about 20 s
npm run test:e2e   # browser tests with real key presses, about 6 minutes
npm run perf       # prints frame rates around the map
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

Development builds, or a production build opened with `?debug`, add:

| Input | Action |
| --- | --- |
| `F3` | Toggle the diagnostics panel |
| `F4` | Draw collider outlines |
| `[` / `]` | Scrub the time of day |
| `P` | Pause the day clock |

## How to play

You start with 5 coins. Walk up to a villager and press `E` to hire them as a woodcutter
for 2 coins. They find a tree, chop it, and carry the logs to the wood pile beside Alder
Cottage. Each trip adds 3 wood, up to the pile's limit. Coins, stored wood and the day
number are shown at the top right. The campfire, the wood pile and the house doors can
also be used with `E`.

Three marked building sites stand around the village. Walk up to one and press `E` to pay.
The nearest free villager then walks over and builds it during daylight:

| Building | Cost | Effect |
| --- | --- | --- |
| Woodcutter's Hut | 4 wood, 2 coins | Allows one more woodcutter (one is allowed at first) |
| Wooden Watchtower | 6 wood, 3 coins | Records a watch post for future defense; no combat yet |
| Storage Shed | 5 wood, 2 coins | Raises the wood limit from 10 to 25 |

The village pays 2 coins at the start of each new day, because the 5 starting coins alone
cover only one hire and one building, and chests only pay once. This is a stopgap until there
is a real economy. Set `ECONOMY.dailyCoins` to 0 to turn it off.
Alda already has a job gathering firewood for the campfire, and that does not go into storage.

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
can build or be hired as woodcutters, which is a separate 2 coins.

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
- **Exploration:** chests and discovered places are plain state keyed by stable ids, with
  `saveExploration` and `loadExploration` ready for a future save system.
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
- Save and load functions exist for exploration only. There is no save system yet.
- Forest thinner than the edge's own width, between two nearby openings, can be stepped through.

## Project layout

```
e2e/          Browser tests (Playwright), one spec per area, and perf.spec.ts
src/
  config.ts   Every tunable constant: feel, camera, layout, atmosphere, palette
  main.ts     Boot, WebGL failure message, hot-reload disposal
  core/       Game (composition root), GameLoop, GameState, Input, math, disposal
  systems/    PlayerMovementSystem, CollisionWorld, DayNightSystem, Resources, Recruitment
    npc/          NpcSystem, NpcBrain (state machine), NpcLocomotion, schedule, VillageSites
    navigation/   NavGrid, Pathfinder (A*)
    interaction/  InteractionSystem, villageInteractables
    construction/ ConstructionState (rules), ConstructionSystem, siteInteractables
    exploration/  ExplorationState (rules, save data), ExplorationSystem, explorationInteractables
  entities/   Npc (state), NpcView, ActorView, CharacterVisual interface, PlaceholderCharacter
  world/      WorldData (pure layout), OpenField, Heightfield, Paths, ExplorationView and other views
    placeholders/   Procedural prop, location and vegetation geometry
  rendering/  RendererHost, CameraRig, AtmosphereView, SkyView, HudView, Diagnostics, helpers
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

The diagnostics panel measures frame time, 1% lows, CPU submission time, simulation time,
draw calls, triangles and live GPU resources.

Measured on the production build in Chrome 156 (headless, 60 Hz frame pacing) on an
**Intel integrated GPU** (D3D11), the only hardware tested so far:

| Scenario | Avg FPS | 1% low | Draw calls | Triangles |
| --- | --- | --- | --- | --- |
| 1920×1080, pixel ratio 1, in the village | 60.0 | 58.5 | 192 | 123k |
| 1920×1080, pixel ratio 1, sprinting | 60.0 | 58.6 | 94 | 115k |
| 1920×1080, pixel ratio 1, day sweep (6 times of day) | 59.3–60.0 | 29.9–58.5 | 128–212 | 109–143k |
| 1920×1080, pixel ratio 2, in the village (4 runs) | 37–44 | 9–22 | 192 | 123k |
| 1920×1080, pixel ratio 2, sprinting (4 runs) | 41–44 | 10–18 | 92 | 115k |

- The 60 FPS results are capped by frame pacing, so the headroom above 60 is unknown.
- In the day sweep, one time of day (noon) had a 1% low of 29.9; the other five stayed at
  57.8 or above. The cause was not investigated.
- At pixel ratio 2 (3840×2160 rendered) this integrated GPU misses the 60 FPS target, with
  visible dips. Hiding all construction visuals made no measurable difference in a side-by-side
  run, so these are not the cause. To trade sharpness for speed, lower
  `RENDER.maxPixelRatio` in `src/config.ts`. A discrete GPU has not been measured.
- JS submission time was about 1.5–2.1 ms per frame at pixel ratio 1.
- A five-day simulated run with one woodcutter stayed under one path search per second.

### After the forest expansion

Measured by alternating the previous build and this one in the same browser session, so that
background load affects both. The machine was busy for most of this, so results vary a lot:

| 1920×1080, pixel ratio 1 | Avg FPS | 1% low | Draw calls | Triangles |
| --- | --- | --- | --- | --- |
| Previous build, in the village (3 runs) | 37.3–59.3 | 8.5–27.9 | 186 | 118k |
| This build, in the village (3 runs) | 38.6–60.0 | 13.3–58.7 | 277 | 218k |
| Previous build, sprinting (3 runs) | 26.4–56.7 | 9.7–27.2 | 86 | 109k |
| This build, sprinting (3 runs) | 41.3–60.0 | 13.7–58.5 | 161 | 174k |

On a quiet machine, this build (one `npm run perf` run, 6 seconds per place unless noted):

| 1920×1080, pixel ratio 1 | Avg FPS | 1% low | Draw calls | Triangles |
| --- | --- | --- | --- | --- |
| Village | 60.0 | 58.1 | 277 | 218k |
| Sprinting along the road, 9 s | 60.0 | 58.3 | 161 | 174k |
| Six of the seven new-area spots | 60.0 | 57.7–58.7 | 173–295 | 170–268k |
| Abandoned Camp | 60.0 | 53.9 | 208 | 228k |
| First sprint north to the ruins, 5 s | 59.2 | 29.9 | 198 | 196k |

The 60 FPS results are capped by frame pacing, so the headroom above 60 is unknown. The previous
build was not measured on this quiet run, so the comparison rests on the busy runs above.

- No slowdown showed up against the previous build, but the machine's load was too uneven to
  show a small one. Draw calls and triangles did go up, by about half and about 80% in the village.
- The new areas, one 6-second run each: 55.8–60.0 FPS, 1% lows 25.5–57.7, 170–268k triangles,
  173–295 draw calls. The lowest were the woods trail and the glade, the two densest views.
  Sprinting from the village to the ruins for the first time: 60.0 FPS, 1% low 54.9.
- The longest path searches, across the whole map and the bridge, took at most 2.5 ms, and at
  most one runs per simulation step. Building the world at startup takes about 0.3 s under Node.
- At pixel ratio 2 this build ran at 37–46 FPS with 1% lows of 15–23, against 25–46 and 8–20
  for the previous build. Still under the 60 FPS target on this GPU.
- Instanced forest is split into chunks by X and depth. Batches past the horizon are skipped,
  all forest buffers go to the GPU at startup, and travelers waiting more than 48 units from
  the player are neither simulated nor drawn. Off-screen villagers are simulated but not drawn.

To measure on your own machine, run `npm run perf`, or open a dev build (or a production
build with `?debug`) and read the panel. Headless numbers may differ from a normal browser window.
