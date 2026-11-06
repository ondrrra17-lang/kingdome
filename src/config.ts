/**
 * Every tunable constant in the prototype lives in this file: simulation, feel,
 * camera, world layout, atmosphere and palette. Modules read from here and hold
 * no magic numbers of their own beyond local geometry proportions.
 */

export const SIM = {
  /** Gameplay simulation rate, independent from the display refresh. */
  fixedDt: 1 / 60,
  /** Longest frame the loop will try to catch up on (tab switches, hitches). */
  maxFrameTime: 0.25,
  maxSubSteps: 6,
} as const;

export const RENDER = {
  maxPixelRatio: 2,
  antialias: true,
  maxAnisotropy: 8,
  shadowMapSize: 2048,
  /** World units of shadow coverage beyond the visible half-width. */
  shadowMargin: 20,
  shadowDepthRange: 280,
  shadowLightDistance: 130,
  shadowBias: -0.0005,
  shadowNormalBias: 0.04,
} as const;

export const CAMERA = {
  elevationDeg: 26,
  yawDeg: 8,
  /** Vertical world units visible on screen. */
  viewHeight: 24,
  /** Narrow windows zoom out to keep at least this much width in view. */
  minViewWidth: 30,
  distance: 150,
  near: 1,
  far: 480,
  /** Extra ground drawn beyond what the view strictly needs, for hills and the edge of the screen. */
  groundMargin: 5,
  /**
   * How far north the world is drawn, which is what keeps sky and mountains in view. From
   * the valley it stays at the valley's old horizon. Walking north it moves ahead of the
   * player at the catch-up rate until it is northReach beyond them.
   */
  horizon: { valleyZ: -22, catchUp: 1.33, northReach: 25, band: 3, valleyTreelineZ: -21.1 },
  /** Where the tracked point sits on screen, 0 = bottom edge, 1 = top edge. */
  anchorScreenY: 0.22,
  /** Time for the camera to close half the distance to its target (seconds). */
  xHalfLife: 0.16,
  depthHalfLife: 0.5,
  heightHalfLife: 0.4,
  /** Fraction of player depth (Z) the camera follows; the rest plays on screen. */
  depthFollow: 0.3,
  /** Outside the valley the camera catches up with the player at these rates, then tracks them. */
  northCatchUp: 1.3,
  southCatchUp: 1.6,
  /** South of the valley the view leads the player, so what lies ahead is on screen. */
  southLead: 5,
  heightFollow: 0.35,
  /** World units of framing shifted toward the direction of travel at full sprint. */
  lookAhead: 3.2,
  lookAheadHalfLife: 0.7,
  /** Camera focus stays inside +/- this X, so the world's end is never exposed. */
  xClamp: 88,
} as const;

export const PLAYER = {
  radius: 0.42,
  walkSpeed: 4.6,
  sprintSpeed: 8.2,
  /** Units/s^2 while speeding up toward the input direction. */
  acceleration: 30,
  /** Units/s^2 while coasting to a stop without input. */
  deceleration: 22,
  /** Units/s^2 while pushing against current velocity; snappy reversals. */
  reverseAcceleration: 46,
  turnHalfLife: 0.055,
  /** Stride distance of one leg; sets how fast the walk cycle plays. */
  strideLength: 1.55,
  heightHalfLife: 0.045,
  spawnX: -16,
  spawnZ: 1.2,
  spawnFacing: Math.PI / 2,
} as const;

export const WORLD = {
  seed: 20417,
  /** The original valley: the village, the river crossing and the main road. */
  strip: { minX: -98, maxX: 98, minZ: -9, maxZ: 8 },
  /** Hard limits of the whole map. Forest thicket decides what is walkable inside them. */
  bounds: { minX: -98, maxX: 98, minZ: -48, maxZ: 40 },
  /** Keep minZ on the same 1.25 grid as -22, so the valley's terrain vertices do not move. */
  terrain: { minX: -150, maxX: 150, minZ: -77, maxZ: 59.5, cellSize: 1.25 },
  /** Where the terrain ended before the map grew. The stream's end trees are still placed from it. */
  valleyTerrainMinZ: -22,
  groundMaskWidth: 1024,
  groundMaskHeight: 704,
  collisionCellSize: 4,
  /** Rise of the forested ridge behind the playable strip. */
  ridgeRise: 1.0,
  frontFall: 1.0,
  endRise: 2.6,

  roads: {
    main: {
      halfWidth: 1.35,
      points: [
        [-112, 1.2], [-90, -0.8], [-62, 1.6], [-38, 0.5], [-16, 0.7], [6, 0.2],
        [22, 0], [26, 0], [42, 0], [46, 0], [66, -1.2], [92, 0.9], [112, -0.4],
      ],
    },
    branches: [
      { halfWidth: 0.95, points: [[5, 0.2], [6, -4], [4.4, -9], [6.5, -14], [5.5, -18]] },
      { halfWidth: 0.95, points: [[-25, 0.6], [-26.5, 4], [-23.5, 9], [-27, 18], [-25, 42]] },
      { halfWidth: 0.95, points: [[64, -1], [62, -5], [66, -10], [64, -14], [65, -18]] },
      { halfWidth: 0.95, points: [[-72, 0.8], [-70, 5], [-74, 12], [-71, 26], [-73, 42]] },
    ],
  },

  river: {
    x: 34,
    meanderAmplitude: 5,
    meanderFrequency: 0.085,
    /** River stays straight inside this |z| and meanders beyond it. */
    straightZone: 4,
    meanderBlend: 16,
    /** Terrain starts to fall toward the river at this distance from its centre. */
    bankOuter: 7.5,
    bankInner: 2.5,
    bedHeight: -2.2,
    waterHeight: -0.9,
    /** Half-width of the water strip mesh; its edges sit under the terrain. */
    waterHalfWidth: 6.6,
    /** Toward the back the river narrows to a stream between these depths, then enters the forest. */
    taperFarZ: -20.5,
    taperNearZ: -11,
    taperMinWidth: 0.2,
    /** Past this depth the forest may close over the stream. */
    forestClosesZ: -18,
    /** Half-width the player cannot enter. */
    blockHalfWidth: 5.6,
  },

  bridge: { x: 34, z: 0, halfLength: 8.5, halfWidth: 1.6, arch: 1.05 },

  settlementFlatten: { x: -4, z: -3, radius: 28 },
  campfire: {
    x: -10.3,
    z: -2.2,
    colliderRadius: 1.15,
    /** Log benches, relative to the fire. */
    seats: [
      { x: -2.35, z: 0.55, rotY: 0.5 },
      { x: 2.1, z: 1.05, rotY: -0.65 },
    ],
    seatHalfLength: 0.9,
    seatHalfWidth: 0.27,
  },

  houses: [
    { name: 'Alder Cottage', x: -17.5, z: -5.3, rotY: 0.1, width: 7.2, depth: 4.8, wallHeight: 3, roofHeight: 2.1, wall: 0xd9c49c, roof: 0x9d8146 },
    { name: 'Hearth House', x: -3.2, z: -5.8, rotY: -0.05, width: 8, depth: 5, wallHeight: 3.3, roofHeight: 2.3, wall: 0xcdb48c, roof: 0x8a6e3c },
    { name: 'Fernside', x: 13.2, z: -5.1, rotY: -0.12, width: 6.6, depth: 4.6, wallHeight: 2.9, roofHeight: 2, wall: 0xe0cfaa, roof: 0xa58a4e },
  ],

  /** Door position along a house's width, as a fraction of it. */
  houseDoorOffset: -0.12,
  /** Where people stand in front of a door, beyond the front wall. */
  houseDoorStandOff: 1.05,

  fences: [
    { x1: 9.5, z1: -1.9, x2: 19.5, z2: -2.5 },
    { x1: -42, z1: 3.6, x2: -33, z2: 3.2 },
    { x1: 50, z1: -3.4, x2: 58, z2: -3.8 },
  ],
  lanterns: [
    [1.6, -1.3], [-22.2, -1.3], [24.6, 2.3], [43.4, -2.3],
  ],
  woodpile: { x: -22.8, z: -4.2, rotY: 1.45, halfX: 1.2, halfZ: 0.55 },
  barrierHalfWidth: 1.9,
  /** Trees close to the wood pile, in walkable land, where woodcutters do most of their work. */
  woodlot: [
    [-29.5, -7], [-33, -5], [-36.5, -7.4], [-31, -3], [-35.5, -2.8], [-39.5, -5], [-28, -3.6], [-42.5, -7.2],
  ],

  /** Instanced scenery is grouped into X-aligned chunks so whole chunks can be culled. */
  vegetationChunkSize: 36,
  vegetationDepth: { valleyBand: { minZ: -20.5, maxZ: 9 }, bandDepth: 12 },
  /** Trees further back than this do not render into the shadow map. */
  shadowCasterMinZ: -16,
  scatter: {
    backForest: { minZ: -20, maxZ: -10.6, spacing: 2.5 },
    worldEnds: { innerX: 101, outerX: 146, minZ: -10, maxZ: 32, spacing: 3 },
    groves: { spacing: 5.5, maxTreeZ: 3.2, threshold: 0.5, roadMargin: 2.2 },
    frontBushes: { minZ: 9.2, maxZ: 26, spacing: 6 },
    frontTrees: { minZ: 18, maxZ: 30, spacing: 13 },
    grass: { minZ: -11, maxZ: 24, spacing: 0.95, threshold: 0.4 },
    flowers: { minZ: -8.5, maxZ: 16, spacing: 3, threshold: 0.56 },
    rocks: { minZ: -9, maxZ: 22, spacing: 9 },
  },
  /** Collision radius as a multiple of instance scale. */
  colliderRadius: { pine: 0.42, pineSlim: 0.34, oak: 0.5, oakAmber: 0.5, rock: 0.62 },
} as const;

/** Parallax layers behind the world. See world/DistantScenery.ts. */
export const DISTANT = {
  halfWidth: 200,
  bottomNdc: -0.3,
  layers: [
    { z: -150, parallax: 0.93, baseNdc: 0.44, amplitude: 0.36, frequency: 0.05, step: 3.5, teeth: 0.028, haze: 0.42, mist: 0.85, facet: 0.3, snow: 0.8, seed: 11 },
    { z: -100, parallax: 0.84, baseNdc: 0.42, amplitude: 0.09, frequency: 0.04, step: 2.4, teeth: 0.008, haze: 0.3, mist: 0.85, facet: 0.06, snow: 0, seed: 23 },
    { z: -56, parallax: 0.66, baseNdc: 0.37, amplitude: 0.06, frequency: 0.05, step: 0.9, teeth: 0.035, haze: 0.16, mist: 0.6, facet: 0, snow: 0, seed: 37 },
  ],
} as const;

export const ATMOSPHERE = {
  /** Real seconds for one full day. */
  dayLengthSeconds: 240,
  /** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  startTime: 0.34,
  /** Lowest sun elevation factor; keeps low-sun shadows a sane length. */
  minLightElevation: 0.31,
  /** Sky-space placement of the sun/moon discs, in normalized device coords. */
  horizonNdc: 0.5,
  sunArcX: 0.6,
  sunArcY: 1.2,
  /** Times of day where the single shadow light swaps between sun and moon (its intensity is 0 at these keys). */
  moonriseTime: 0.815,
  moonsetTime: 0.205,
  keyframes: [
    { t: 0.0, skyTop: 0x050a1f, horizon: 0x16214a, fog: 0x1a2648, light: 0x9db4ea, lightI: 0.8, hemiSky: 0x3c5294, hemiGround: 0x141a2e, hemiI: 1.05, silhouette: 0x0b1230, fogNear: 2, fogFar: 72, night: 1, clouds: 0x1b2748, shadow: 0.55 },
    { t: 0.17, skyTop: 0x0a1230, horizon: 0x232c5a, fog: 0x253058, light: 0x9db4ea, lightI: 0.65, hemiSky: 0x3c5294, hemiGround: 0x141a2e, hemiI: 1.05, silhouette: 0x111838, fogNear: 2, fogFar: 72, night: 1, clouds: 0x242e52, shadow: 0.5 },
    { t: 0.205, skyTop: 0x1c2c5c, horizon: 0x8a6078, fog: 0x6a5470, light: 0xffc9a0, lightI: 0, hemiSky: 0x5a6ca0, hemiGround: 0x2a2630, hemiI: 1.0, silhouette: 0x2c2c50, fogNear: 2, fogFar: 72, night: 0.75, clouds: 0x584c70, shadow: 0 },
    { t: 0.26, skyTop: 0x4470a8, horizon: 0xf6b68c, fog: 0xdfae96, light: 0xffc79c, lightI: 1.8, hemiSky: 0x9cb0d0, hemiGround: 0x5e4e3e, hemiI: 1.05, silhouette: 0x5e6684, fogNear: 4, fogFar: 88, night: 0.1, clouds: 0xf3c4a8, shadow: 0.75 },
    { t: 0.36, skyTop: 0x5c9ed8, horizon: 0xcfe6ee, fog: 0xc8dfe4, light: 0xfff0d6, lightI: 2.5, hemiSky: 0xbcd8ec, hemiGround: 0x6a6a48, hemiI: 1.2, silhouette: 0x7b96ac, fogNear: 8, fogFar: 110, night: 0, clouds: 0xfbfcfa, shadow: 0.85 },
    { t: 0.5, skyTop: 0x5b9fdc, horizon: 0xd2e8f0, fog: 0xcce2e8, light: 0xfff6e6, lightI: 2.6, hemiSky: 0xc2dcf0, hemiGround: 0x70704c, hemiI: 1.2, silhouette: 0x7f9ab0, fogNear: 10, fogFar: 118, night: 0, clouds: 0xffffff, shadow: 0.85 },
    { t: 0.66, skyTop: 0x5a8cc0, horizon: 0xf7d9a8, fog: 0xecd0a2, light: 0xffd392, lightI: 2.65, hemiSky: 0xbcc6cc, hemiGround: 0x6f5c40, hemiI: 1.12, silhouette: 0x75809c, fogNear: 6, fogFar: 100, night: 0, clouds: 0xfdeccc, shadow: 0.85 },
    { t: 0.745, skyTop: 0x3a4e88, horizon: 0xffa266, fog: 0xec9a70, light: 0xff9550, lightI: 2.2, hemiSky: 0x9488b4, hemiGround: 0x5e4238, hemiI: 1.0, silhouette: 0x4f4068, fogNear: 2, fogFar: 84, night: 0.2, clouds: 0xffb48a, shadow: 0.8 },
    { t: 0.79, skyTop: 0x1a2454, horizon: 0x7c4e7c, fog: 0x5a4470, light: 0xff6e40, lightI: 0.45, hemiSky: 0x5660a0, hemiGround: 0x2a2432, hemiI: 1.0, silhouette: 0x282348, fogNear: 2, fogFar: 74, night: 0.7, clouds: 0x8a5a84, shadow: 0.35 },
    { t: 0.815, skyTop: 0x101a42, horizon: 0x3e3a68, fog: 0x363a62, light: 0x9db4ea, lightI: 0, hemiSky: 0x445a98, hemiGround: 0x1a1e30, hemiI: 1.05, silhouette: 0x181c3c, fogNear: 2, fogFar: 72, night: 0.9, clouds: 0x3a3a62, shadow: 0 },
    { t: 0.87, skyTop: 0x070d26, horizon: 0x1a2650, fog: 0x1d2a4e, light: 0x9db4ea, lightI: 0.75, hemiSky: 0x3c5294, hemiGround: 0x141a2e, hemiI: 1.05, silhouette: 0x0d1432, fogNear: 2, fogFar: 72, night: 1, clouds: 0x1f2a4c, shadow: 0.55 },
  ],
} as const;

export const EFFECTS = {
  windSpeed: 1.25,
  moteCount: 56,
  moteBox: { x: 64, y: 3.4, z: 20, centerZ: -1 },
  emberCount: 14,
  fireLight: { color: 0xff9a4a, intensityDay: 6, intensityNight: 46, distance: 18, decay: 1.7, height: 1.3 },
} as const;

/** When the game saves by itself. See systems/save/SaveSystem.ts. */
export const SAVE = {
  autoSaveSeconds: 30,
  /** How often to look for progress worth saving soon. */
  progressCheckSeconds: 1,
  /** Busy moments, such as several deliveries, do not save more often than this. */
  minSecondsBetweenSaves: 4,
} as const;

export const ECONOMY = {
  startCoins: 5,
  /** Paid once, to invite a traveler to the village. Giving a villager a job is free. */
  travelerInviteCost: 2,
  /** Wood added to storage per woodcutter trip. */
  woodPerDelivery: 3,
  /** Most wood the pile can hold before any Storage Shed. */
  baseWoodCapacity: 10,
  /** Woodcutters allowed before any Woodcutter's Hut. */
  baseMaxWoodcutters: 1,
  /** Coins the village pays at the start of each new day. 0 turns this off. */
  dailyCoins: 2,
} as const;

export const INTERACTION = {
  feedbackSeconds: 4.5,
  villagerRange: 2.1,
  villagerMarker: 0.75,
  campfireRange: 2.9,
  campfireMarker: 1.75,
  woodpileRange: 2.8,
  woodpileMarker: 1.7,
  houseRange: 1.8,
  houseMarker: 1,
  siteRange: 2.3,
  siteMarker: 1.25,
  treasureRange: 2.2,
  treasureMarker: 0.95,
  landmarkRange: 2.7,
  landmarkMarker: 1.1,
  noticeSeconds: 5,
  /** Discovery only needs checking a few times a second. */
  discoveryCheckSeconds: 0.25,
} as const;

export const PALETTE = {
  grassA: 0x6f9a48,
  grassB: 0x8bae52,
  grassC: 0xa8b85c,
  dirtA: 0xb09468,
  dirtB: 0x96784f,
  worn: 0x9c9860,
  bank: 0x8d7c58,
  waterDeep: 0x174a60,
  waterShallow: 0x3a8a8c,
  foam: 0xdcecdc,
  windowDay: 0x31404e,
  windowNight: 0xffb35c,
  lanternDay: 0x8a7a54,
  lanternNight: 0xffc070,

  pine: { low: 0x2f5b3e, high: 0x568a50 },
  oak: { low: 0x48743a, high: 0x8cab4c },
  amber: { low: 0xb5702a, high: 0xe5a83e },
  bush: { low: 0x3f6e38, high: 0x7fa548 },
  trunk: { low: 0x4a3626, high: 0x6a4e36 },
  rock: { low: 0x6d6a66, high: 0xa09c90 },
  grassBlade: { low: 0x5a8a3e, high: 0xb4c864 },
  flowers: [0xf2e2a0, 0xd77a8e, 0x8fa0e0],

  timber: 0x50392a,
  timberLight: 0x7a5a3e,
  stone: 0x8a857a,
  stoneDark: 0x66625a,
  door: 0x5e3e28,
  plank: 0x8c6a48,
  plankDark: 0x6e5238,
  iron: 0x34343a,
  ash: 0x38302a,

  character: {
    skin: 0xe6b98c,
    tunic: 0x2f6a78,
    tunicDark: 0x24525e,
    hood: 0xc9852e,
    cape: 0xa83a30,
    leg: 0x4a3a30,
    boot: 0x2e241e,
    belt: 0x6a4426,
    metal: 0xc2c6cc,
    eye: 0x1c1612,
  },
} as const;

export type VillagerPersonality = 'wanderer' | 'fireside' | 'homebody';

export interface CharacterPalette {
  skin: number;
  tunic: number;
  tunicDark: number;
  hood: number;
  cape: number;
  leg: number;
  boot: number;
  belt: number;
  metal: number;
  eye: number;
}

function villagerPalette(skin: number, tunic: number, tunicDark: number, hood: number, leg: number): CharacterPalette {
  return { ...PALETTE.character, skin, tunic, tunicDark, hood, leg };
}

export const NPC = {
  radius: 0.36,
  /** Nav cells are blocked within this distance of a collider. */
  navClearance: 0.55,
  navCellSize: 1,
  maxWaypoints: 64,
  /** Maximum A* searches per simulation step. */
  maxPathsPerStep: 1,
  /** Seconds between each villager's high-level decisions. */
  decisionInterval: 0.25,
  pointSearchRadius: 6,

  acceleration: 9,
  turnHalfLife: 0.11,
  strideLength: 1.05,
  /** Speed at which the walk animation plays at full amplitude. */
  fullGaitSpeed: 2.2,
  heightHalfLife: 0.05,
  arriveRadius: 0.3,
  waypointRadius: 0.5,
  closeEnough: 1.3,
  separationRadius: 1.05,
  separationStrength: 1.8,
  playerSpaceRadius: 0.95,
  stuckSeconds: 1.1,
  maxStuckRepaths: 2,

  idleMin: 3,
  idleMax: 9,
  sitMin: 10,
  sitMax: 22,
  morningPauseMin: 0.8,
  morningPauseMax: 3,
  attentionSeconds: 3.5,
  enterHouseSeconds: 0.6,

  chopSeconds: 7,
  gatherSeconds: 5,
  dropSeconds: 1.3,
  treeStandDistance: 2.6,
  treeStandFrontBias: 1.3,
  /** Workers choose among this many of the trees closest to storage. */
  treeChoiceCount: 8,

  fireRingMin: 2.6,
  fireRingMax: 3.7,
  houseLoiterRange: 2.5,
  wanderArea: { minX: -28, maxX: 22, minZ: -3, maxZ: 6 },

  /** Waiting travelers further than this from the player are not simulated or drawn. */
  travelerActiveRadius: 48,
  travelerFireRingMin: 2.3,
  travelerFireRingMax: 3.6,
  /** Seconds a journey waits before trying again after a failed search. */
  journeyRetrySeconds: 1.5,
  /** Margin around the view inside which villagers are still animated. */
  viewCullMargin: 7,

  /** Time-of-day fractions, each varied per villager by up to +/- variation. */
  schedule: { wake: 0.27, evening: 0.72, bed: 0.795, variation: 0.016 },

  /** Daytime chances of each activity. What is left over goes to sitting. */
  personalities: {
    wanderer: { wander: 0.65, fire: 0.15, house: 0.1 },
    fireside: { wander: 0.15, fire: 0.5, house: 0.1 },
    homebody: { wander: 0.2, fire: 0.1, house: 0.6 },
  } satisfies Record<VillagerPersonality, { wander: number; fire: number; house: number }>,

  villagers: [
    { id: 'alda', name: 'Alda', job: 'gatherer', home: 0, walkSpeed: 2.1, personality: 'fireside', spawn: [-20, -1], palette: villagerPalette(0xd8a87c, 0x7a6a3c, 0x5c5030, 0x8c5a34, 0x46382c) },
    { id: 'bren', name: 'Bren', job: 'villager', home: 0, walkSpeed: 2.45, personality: 'wanderer', spawn: [-6, 2], palette: villagerPalette(0xeac39a, 0x8f4a3c, 0x6e382e, 0x5a4a3a, 0x3e3a34) },
    { id: 'cora', name: 'Cora', job: 'villager', home: 1, walkSpeed: 2.2, personality: 'fireside', spawn: [-7, -3], palette: villagerPalette(0xc99872, 0x4e6e8a, 0x3c566c, 0xb9a678, 0x483c30) },
    { id: 'dunn', name: 'Dunn', job: 'villager', home: 1, walkSpeed: 1.95, personality: 'homebody', spawn: [-1, -2], palette: villagerPalette(0xe6b98c, 0x5f7a48, 0x4a6038, 0x7a4630, 0x3a3228) },
    { id: 'edda', name: 'Edda', job: 'villager', home: 2, walkSpeed: 2.3, personality: 'wanderer', spawn: [12, 1], palette: villagerPalette(0xb98860, 0x7c5a86, 0x60466a, 0xa8743c, 0x40382e) },
  ],

  /** Recruited out in the forest. `camp` is the fire each one stays around until invited. */
  travelers: [
    { id: 'wren', name: 'Wren', job: 'traveler', home: 2, walkSpeed: 2.4, personality: 'wanderer', spawn: [64.5, -35], camp: [68, -38], palette: villagerPalette(0xd8a87c, 0xa8552c, 0x84401f, 0x3e6a5a, 0x43382c) },
    { id: 'tobin', name: 'Tobin', job: 'traveler', home: 0, walkSpeed: 2.15, personality: 'fireside', spawn: [71.5, -35.5], camp: [68, -38], palette: villagerPalette(0xc99872, 0x3f7a70, 0x2f5c54, 0xc7a14a, 0x3a3228) },
    { id: 'maren', name: 'Maren', job: 'traveler', home: 1, walkSpeed: 2.3, personality: 'homebody', spawn: [-22, 29.5], camp: [-20.5, 27.5], palette: villagerPalette(0xeac39a, 0x6c5a9a, 0x54467a, 0x8a4a3c, 0x483c30) },
  ],
} as const;

export type PropKind =
  | 'column' | 'brokenColumn' | 'lintel' | 'ruinWall' | 'rubble' | 'altar'
  | 'tent' | 'collapsedTent' | 'wagon' | 'brokenCart' | 'crate' | 'barrel' | 'bedroll'
  | 'fire' | 'coldFire' | 'banner' | 'signpost' | 'shrine'
  | 'standingStone' | 'pond' | 'mushrooms' | 'ancientTree' | 'kiln' | 'logStack';

/** A placed piece of scenery. `solidRadius` or `solidBox` make it collide. */
export interface PropDefinition {
  readonly kind: PropKind;
  readonly x: number;
  readonly z: number;
  readonly rotY?: number;
  readonly scale?: number;
  /** Canvas or banner color, where the prop has one. */
  readonly color?: number;
  readonly solidRadius?: number;
  readonly solidBox?: readonly [halfX: number, halfZ: number];
}

/** How the forest around a clearing looks. Fractions of trees, the rest are oaks. */
export interface ForestTheme {
  readonly pine: number;
  readonly amber: number;
}

export interface ClearingDefinition {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** How trampled the ground is, 0 to 1. */
  readonly wear: number;
  readonly flowers?: number;
  readonly theme?: ForestTheme;
}

export interface TrailDefinition {
  /** Half-width of the painted path. 0 opens the way without painting anything. */
  readonly paint: number;
  /** Half-width of the walkable corridor through the forest. */
  readonly open: number;
  readonly points: readonly (readonly [number, number])[];
}

export interface LandmarkDefinition {
  readonly id: string;
  readonly name: string;
  /** Discovered when the player comes this close to the point. */
  readonly x: number;
  readonly z: number;
  readonly discoverRadius: number;
  readonly discoverText: string;
  /** What can be examined with E. */
  readonly anchor: readonly [number, number];
  readonly prompt: string;
  readonly inspectText: string;
}

export interface TreasureDefinition {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  /** Always this amount: rewards are authored, not rolled. */
  readonly coins: number;
  /** Purely for reasoning about the map: on a route, or off one. */
  readonly placement: 'visible' | 'hidden';
}

const CANVAS = { red: 0xa8452f, blue: 0x3f6f8c, ochre: 0xc69a45, grey: 0x8d8778 } as const;

/** Everything outside the village: where the forest opens up and what is out there. */
export const EXPLORATION = {
  /**
   * Invisible edge of the forest. Circles overlap, so nothing can squeeze between them.
   * The rows are spaced so that one row sits exactly one radius outside each long edge of
   * the valley (z -9 and z 8), which leaves those edges where they have always been.
   */
  thicket: { spacing: 0.96, radius: 1.1, band: 1.1, rowOffsetZ: -10.1 },
  forest: {
    /** Starts past the valley's horizon, so seen from the village its treeline has not changed. */
    north: { minZ: -77, maxZ: -22.6, spacing: 2.9 },
    south: { minZ: 9, maxZ: 59.5, spacing: 3.1 },
    halfWidth: 125,
    /** South of the valley only bushes grow this close, to leave the village's framing alone. */
    lowGrowthZ: 16,
    /** Fraction of that low growth kept, so the bottom of the village's view stays uncluttered. */
    lowGrowthDensity: 0.3,
    hedgeSpacing: 2.5,
    /** Trees this close to open ground cast shadows. Further in, they would only fall on other trees. */
    shadowReach: 6,
    /** Empty ground kept between a tree that stands in front of open ground and what it could hide. */
    viewMargin: 1,
    minTreeScale: 0.42,
  },
  defaultTheme: { pine: 0.5, amber: 0.05 } satisfies ForestTheme,

  trails: [
    // The four old roads, which used to end at barriers. Already painted.
    { paint: 0, open: 2.6, points: [[6, -4], [4.4, -9], [6.5, -14], [5.5, -18]] },
    { paint: 0, open: 2.6, points: [[62, -5], [66, -10], [64, -14], [65, -18]] },
    { paint: 0, open: 2.6, points: [[-26.5, 4], [-23.5, 9], [-27, 18], [-26.4, 26]] },
    { paint: 0, open: 2.6, points: [[-70, 5], [-74, 12], [-71, 22]] },
    // North road to the ruins, and on through the woods to the glade.
    { paint: 0.8, open: 2.6, points: [[5.5, -18], [3, -23], [7, -28], [4, -31]] },
    { paint: 0.55, open: 2.5, points: [[-5, -39], [-13, -35], [-22, -41], [-31, -37], [-43, -38]] },
    // A barely visible gap in the valley's north edge, also leading to the glade.
    { paint: 0.3, open: 1.7, points: [[-48, -8], [-50, -14], [-46, -20], [-50, -26], [-51, -29]] },
    // East of the river, north to the travelers' camp, then on to a hidden pocket.
    { paint: 0.8, open: 2.6, points: [[65, -18], [68, -23], [64, -27], [67, -30]] },
    { paint: 0.3, open: 1.8, points: [[77, -38], [84, -34], [89, -38], [91, -31]] },
    // South: between the shrine and the abandoned camp, with a side track.
    { paint: 0.55, open: 2.5, points: [[-34, 29], [-42, 24], [-51, 30], [-60, 27]] },
    { paint: 0, open: 1.6, points: [[-47.5, 27.5], [-45.5, 33]] },
    // East of the river, south to the charcoal burners' hollow.
    { paint: 0.45, open: 2, points: [[78, 7.5], [81, 14], [76, 20], [79, 25]] },
  ] satisfies readonly TrailDefinition[],

  clearings: [
    { x: 3, z: -37, radius: 12.5, wear: 0.55, flowers: 0.15, theme: { pine: 0.82, amber: 0 } }, // Ancient ruins
    { x: 10, z: -27.5, radius: 3.2, wear: 0.25 }, // Beside the north road
    { x: -52, z: -36, radius: 11.8, wear: 0, flowers: 0.8, theme: { pine: 0.12, amber: 0.42 } }, // Hidden glade
    { x: 68, z: -36, radius: 12.2, wear: 0.7, theme: { pine: 0.72, amber: 0.02 } }, // Travelers' camp
    { x: 91.5, z: -27.5, radius: 4.5, wear: 0.1, flowers: 0.4 }, // Pocket beyond the camp
    { x: -26, z: 30, radius: 10, wear: 0.45, flowers: 0.3, theme: { pine: 0.3, amber: 0.2 } }, // Wayside shrine
    { x: -20.3, z: 15, radius: 3.2, wear: 0.2 }, // Beside the south road
    { x: -70, z: 28, radius: 12.2, wear: 0.6, theme: { pine: 0.25, amber: 0.1 } }, // Abandoned camp
    { x: -45, z: 35.5, radius: 3.6, wear: 0.05, flowers: 0.5 }, // Pocket off the south link
    { x: 80, z: 30, radius: 8.2, wear: 0.65, theme: { pine: 0.6, amber: 0 } }, // Charcoal hollow
    // Small unnamed openings along the way, so the walk between places has some shape to it.
    { x: -22, z: -40.5, radius: 5.5, wear: 0, flowers: 0.45 },
    { x: -42, z: 23.5, radius: 5.5, wear: 0.05, flowers: 0.35 },
    { x: 84, z: -34, radius: 4.5, wear: 0, flowers: 0.25 },
    { x: 80.5, z: 14.5, radius: 4.8, wear: 0.05, flowers: 0.3 },
    { x: -73, z: 12.5, radius: 4.2, wear: 0.1, flowers: 0.2 },
  ] satisfies readonly ClearingDefinition[],

  landmarks: [
    {
      id: 'ruins', name: 'The Old Ruins', x: 3, z: -35, discoverRadius: 11,
      discoverText: 'Older than the village, and nobody remembers who built it.',
      anchor: [3, -37.4], prompt: 'Read the worn inscription',
      inspectText: 'Most of the letters are gone. "...kept the flame until the last of us..."',
    },
    {
      id: 'glade', name: 'The Quiet Glade', x: -52, z: -35, discoverRadius: 10,
      discoverText: 'The birds stop singing here. It does not feel unfriendly.',
      anchor: [-46.5, -39.5], prompt: 'Touch the old tree',
      inspectText: 'The bark is warm. Someone has tied faded ribbons around the lower branches.',
    },
    {
      id: 'traveler-camp', name: "Travelers' Camp", x: 68, z: -33, discoverRadius: 11,
      discoverText: 'Road folk stop here on the way through. Some may be looking for a place to stay.',
      anchor: [59.5, -34.8], prompt: 'Look over the wagon',
      inspectText: 'Tools, seed sacks and a good saw. These people could make themselves useful.',
    },
    {
      id: 'shrine', name: 'Wayside Shrine', x: -26, z: 27, discoverRadius: 9,
      discoverText: 'A small roof over a small saint. Coins and pebbles line the ledge.',
      anchor: [-19.5, 32.8], prompt: 'Look at the shrine',
      inspectText: 'A carved fox sits inside. Every pebble on the ledge is from a different river.',
    },
    {
      id: 'abandoned-camp', name: 'Abandoned Camp', x: -70, z: 26, discoverRadius: 10,
      discoverText: 'Whoever camped here left in a hurry, and did not come back for their things.',
      anchor: [-70, 24.4], prompt: 'Search the cold fire',
      inspectText: 'The ashes are years old. A pot still hangs over them, rusted through.',
    },
    {
      id: 'hollow', name: "Charcoal Burners' Hollow", x: 79, z: 28, discoverRadius: 8,
      discoverText: 'The kiln has been cold for a long time, but the smell of smoke lingers.',
      anchor: [76.5, 29.6], prompt: 'Look into the kiln',
      inspectText: 'Good charcoal, gone to dust. They stacked more wood than they ever burned.',
    },
  ] satisfies readonly LandmarkDefinition[],

  /** Eight caches, 29 coins in all. */
  treasures: [
    { id: 'chest-north-road', x: 10.6, z: -28, rotY: -0.5, coins: 2, placement: 'visible' },
    { id: 'chest-south-road', x: -19.8, z: 15.2, rotY: 0.4, coins: 2, placement: 'visible' },
    { id: 'chest-ruins', x: 3, z: -44.5, rotY: 0, coins: 5, placement: 'visible' },
    { id: 'chest-abandoned-camp', x: -63, z: 33.2, rotY: 0.5, coins: 4, placement: 'visible' },
    { id: 'chest-glade', x: -58.6, z: -41, rotY: 0.7, coins: 6, placement: 'hidden' },
    { id: 'chest-east-pocket', x: 92.2, z: -28.2, rotY: -0.3, coins: 3, placement: 'hidden' },
    { id: 'chest-south-pocket', x: -45, z: 36.4, rotY: 0.2, coins: 3, placement: 'hidden' },
    { id: 'chest-hollow', x: 83.5, z: 32.6, rotY: -0.6, coins: 4, placement: 'hidden' },
  ] satisfies readonly TreasureDefinition[],

  chestSolidRadius: 0.5,

  props: [
    // Ancient ruins: a gateway on the axis of the road, with an altar in front of it.
    { kind: 'column', x: 0.4, z: -41.5, scale: 1.05, solidRadius: 0.62 },
    { kind: 'column', x: 5.6, z: -41.5, scale: 1.05, solidRadius: 0.62 },
    { kind: 'lintel', x: 3, z: -41.5 },
    { kind: 'altar', x: 3, z: -38.6, solidBox: [1.05, 0.65] },
    { kind: 'brokenColumn', x: -6.2, z: -38.8, scale: 0.95, solidRadius: 0.62 },
    { kind: 'column', x: -5.4, z: -43.4, scale: 0.9, solidRadius: 0.6 },
    { kind: 'brokenColumn', x: 11.5, z: -39.6, scale: 1.1, solidRadius: 0.66 },
    { kind: 'column', x: 10.8, z: -44, scale: 0.85, solidRadius: 0.58 },
    { kind: 'ruinWall', x: -2.5, z: -45.2, rotY: 0.08, solidBox: [3, 0.42] },
    { kind: 'ruinWall', x: 8.4, z: -45.4, rotY: -0.12, scale: 0.8, solidBox: [2.4, 0.38] },
    { kind: 'rubble', x: -3, z: -34 },
    { kind: 'rubble', x: 9, z: -34.5, scale: 0.8 },
    { kind: 'rubble', x: -8.4, z: -41.5, scale: 1.2 },

    // Hidden glade: a pond, a ring of stones and one enormous tree.
    { kind: 'pond', x: -52, z: -36.5, solidRadius: 3.2 },
    { kind: 'ancientTree', x: -45.5, z: -41.5, solidRadius: 1.2 },
    { kind: 'standingStone', x: -59, z: -34.5, rotY: 0.4, solidRadius: 0.55 },
    { kind: 'standingStone', x: -57, z: -30.5, rotY: 1.2, scale: 0.85, solidRadius: 0.5 },
    { kind: 'standingStone', x: -46, z: -31, rotY: 2.1, scale: 1.1, solidRadius: 0.58 },
    { kind: 'standingStone', x: -51, z: -43, rotY: 0.2, scale: 1.2, solidRadius: 0.6 },
    { kind: 'mushrooms', x: -55.6, z: -40.6 },
    { kind: 'mushrooms', x: -43.8, z: -36.6, scale: 1.2 },
    { kind: 'mushrooms', x: -60.6, z: -38.4, scale: 0.9 },
    { kind: 'mushrooms', x: -48, z: -29.8, scale: 0.8 },

    // Travelers' camp: lively and colorful.
    { kind: 'fire', x: 68, z: -38, solidRadius: 0.95 },
    { kind: 'tent', x: 61.5, z: -43, rotY: 0.3, color: CANVAS.red, solidRadius: 2.1 },
    { kind: 'tent', x: 74.5, z: -43, rotY: -0.35, color: CANVAS.blue, solidRadius: 2.1 },
    { kind: 'wagon', x: 59, z: -36.6, rotY: 1.25, solidBox: [1.75, 0.95] },
    { kind: 'crate', x: 76.5, z: -37, rotY: 0.3, solidRadius: 0.55 },
    { kind: 'crate', x: 77.6, z: -38.4, rotY: 0.9, scale: 0.8, solidRadius: 0.48 },
    { kind: 'barrel', x: 75.6, z: -38.8, solidRadius: 0.42 },
    { kind: 'banner', x: 68, z: -44.5, color: CANVAS.ochre, solidRadius: 0.16 },
    { kind: 'signpost', x: 62.2, z: -22, rotY: 0.2, solidRadius: 0.16 },

    // Wayside shrine, with one traveler's fire beside the road.
    { kind: 'shrine', x: -19.5, z: 31, rotY: -0.5, solidBox: [1.05, 0.85] },
    { kind: 'fire', x: -20.5, z: 27.5, scale: 0.75, solidRadius: 0.8 },
    { kind: 'bedroll', x: -17.2, z: 27.2, rotY: 0.4 },
    { kind: 'signpost', x: -31.6, z: 24.8, rotY: -0.4, solidRadius: 0.16 },
    { kind: 'signpost', x: -22, z: 11.6, rotY: 0.1, solidRadius: 0.16 },

    // Abandoned camp: the same things as the travelers', but rotted and grey.
    { kind: 'collapsedTent', x: -76.5, z: 22.5, rotY: 0.5, color: CANVAS.grey, solidRadius: 1.8 },
    { kind: 'collapsedTent', x: -63.5, z: 22, rotY: -0.7, color: CANVAS.ochre, scale: 0.85, solidRadius: 1.55 },
    { kind: 'coldFire', x: -70, z: 26.6, solidRadius: 0.9 },
    { kind: 'brokenCart', x: -62.2, z: 30.4, rotY: 0.35, solidBox: [1.6, 0.85] },
    { kind: 'crate', x: -76, z: 31, rotY: 0.6, solidRadius: 0.55 },
    { kind: 'barrel', x: -77.2, z: 29.6, solidRadius: 0.42 },
    { kind: 'bedroll', x: -72.8, z: 22.6, rotY: -0.3 },
    { kind: 'signpost', x: -67.6, z: 11.5, rotY: 0.2, solidRadius: 0.16 },

    // Charcoal burners' hollow.
    { kind: 'kiln', x: 76, z: 31.4, solidRadius: 2 },
    { kind: 'logStack', x: 84.2, z: 28.2, rotY: 0.4, solidBox: [1.5, 0.75] },
    { kind: 'logStack', x: 80.6, z: 34.6, rotY: -0.2, scale: 0.85, solidBox: [1.3, 0.65] },
  ] satisfies readonly PropDefinition[],
} as const;

export interface BuildingCost {
  readonly wood: number;
  readonly coins: number;
}

export type BuildingEffect =
  | { readonly kind: 'woodcutterSlot'; readonly amount: number }
  | { readonly kind: 'woodStorage'; readonly amount: number }
  | { readonly kind: 'watchPost'; readonly amount: number };

export interface BuildingDefinition {
  readonly id: string;
  readonly name: string;
  readonly style: 'hut' | 'shed' | 'watchtower';
  readonly cost: BuildingCost;
  /** Seconds of a villager's work. */
  readonly buildSeconds: number;
  readonly effect: BuildingEffect;
  readonly completedText: string;
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  /** Footprint, which becomes solid once construction is under way. */
  readonly halfX: number;
  readonly halfZ: number;
  /** Rough height, for scaffolding and the progress bar. */
  readonly height: number;
  /** Where the player stands to use the site. Must stay outside the footprint. */
  readonly anchor: readonly [number, number];
  /** Where the builder works. Must stay outside the footprint. */
  readonly stand: readonly [number, number];
  /** Side of the footprint the timber pile sits on. */
  readonly timberSide: 1 | -1;
}

/** Every building's cost, position and effect. New buildings need only an entry here and a style. */
export const BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: 'hut',
    name: "Woodcutter's Hut",
    style: 'hut',
    cost: { wood: 4, coins: 2 },
    buildSeconds: 18,
    effect: { kind: 'woodcutterSlot', amount: 1 },
    completedText: 'You can now hire one more woodcutter.',
    x: -2.5, z: 6.6, rotY: 0.05,
    halfX: 2.5, halfZ: 1.55, height: 3.5,
    anchor: [-2.5, 3.9],
    stand: [-6, 5.6],
    timberSide: 1,
  },
  {
    id: 'watchtower',
    name: 'Wooden Watchtower',
    style: 'watchtower',
    cost: { wood: 6, coins: 3 },
    buildSeconds: 24,
    effect: { kind: 'watchPost', amount: 1 },
    completedText: 'A lookout over the valley, ready for when the village needs defending.',
    x: 21.5, z: -6, rotY: -0.08,
    halfX: 1.75, halfZ: 1.75, height: 7.6,
    anchor: [21.5, -3.2],
    stand: [24.5, -4.5],
    timberSide: -1,
  },
  {
    id: 'shed',
    name: 'Storage Shed',
    style: 'shed',
    cost: { wood: 5, coins: 2 },
    buildSeconds: 16,
    effect: { kind: 'woodStorage', amount: 15 },
    completedText: 'The village can now store more wood.',
    x: -15, z: 6.4, rotY: -0.04,
    halfX: 2.2, halfZ: 1.5, height: 3,
    anchor: [-15, 3.8],
    stand: [-11.6, 5.4],
    timberSide: -1,
  },
];
