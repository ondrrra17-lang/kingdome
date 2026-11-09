import { Scene, type Texture } from 'three';
import { createGameState, updateNotice, type GameState } from './GameState';
import { disposeObject3D } from './dispose';
import { GameLoop } from './GameLoop';
import { Input } from './Input';
import { NPC, PLAYER, WORLD } from '../config';
import { ActorView } from '../entities/ActorView';
import { createNpc } from '../entities/Npc';
import { NpcView } from '../entities/NpcView';
import { PlaceholderCharacter } from '../entities/PlaceholderCharacter';
import { AtmosphereView } from '../rendering/AtmosphereView';
import { CameraRig } from '../rendering/CameraRig';
import { Diagnostics } from '../rendering/Diagnostics';
import { HintOverlay } from '../rendering/HintOverlay';
import { HudView } from '../rendering/HudView';
import { InteractionMarkerView } from '../rendering/InteractionMarkerView';
import { createGlowTexture, sharedHorizonZ, sharedTime } from '../rendering/materials';
import { confirmDialog, SaveBar } from '../rendering/SaveView';
import { createNoiseTexture } from '../rendering/NoiseTexture';
import { RendererHost } from '../rendering/RendererHost';
import { SkyView } from '../rendering/SkyView';
import { CollisionWorld } from '../systems/CollisionWorld';
import { ConstructionSystem } from '../systems/construction/ConstructionSystem';
import { BridgeSystem } from '../systems/construction/BridgeSystem';
import { DailyIncome } from '../systems/DailyIncome';
import { DayNightSystem } from '../systems/DayNightSystem';
import { createExplorationInteractables } from '../systems/exploration/explorationInteractables';
import { ExplorationSystem } from '../systems/exploration/ExplorationSystem';
import { InteractionSystem } from '../systems/interaction/InteractionSystem';
import { createVillageInteractables } from '../systems/interaction/villageInteractables';
import { NavGrid } from '../systems/navigation/NavGrid';
import { Pathfinder } from '../systems/navigation/Pathfinder';
import { NpcSystem } from '../systems/npc/NpcSystem';
import { VillageSites } from '../systems/npc/VillageSites';
import { PlayerMovementSystem } from '../systems/PlayerMovementSystem';
import { applySave, describeSave, createSave, type SaveFile } from '../systems/save/SaveData';
import type { SaveStore } from '../systems/save/SaveStore';
import { SaveSystem } from '../systems/save/SaveSystem';
import { AmbientEffects } from '../world/AmbientEffects';
import { ConstructionView } from '../world/ConstructionView';
import { DistantScenery } from '../world/DistantScenery';
import { ExplorationView } from '../world/ExplorationView';
import { RiverView } from '../world/RiverView';
import { SettlementView } from '../world/SettlementView';
import { TerrainView } from '../world/TerrainView';
import { VegetationView } from '../world/VegetationView';
import { buildWorldData, type WorldData } from '../world/WorldData';
import { FoodSystem } from '../systems/economy/FoodSystem';
import { ProductionSystem } from '../systems/economy/ProductionSystem';
import { MerchantSystem } from '../systems/economy/MerchantSystem';
import { createEconomyInteractables } from '../systems/economy/economyInteractables';
import { EconomyPanel } from '../rendering/EconomyPanel';
import { KingdomView } from '../world/KingdomView';

/** Keeps shader time small enough to stay precise over long sessions. */
const SHADER_TIME_WRAP = 3600;

/** How this game begins. */
export type GameStart = { kind: 'new' } | { kind: 'load'; save: SaveFile };

/**
 * Composition root. The flow each frame is one-directional:
 * input -> systems -> game state (fixed step) -> views (once per rendered frame).
 */
export class Game {
  readonly state: GameState;
  readonly world: WorldData;
  readonly diagnostics: Diagnostics | null;
  readonly rendererHost: RendererHost;
  readonly collision: CollisionWorld;

  private readonly scene = new Scene();
  private readonly rig = new CameraRig();
  private readonly input = new Input();
  private readonly loop: GameLoop;
  private readonly dayNight = new DayNightSystem();
  private readonly movement: PlayerMovementSystem;
  private readonly atmosphere: AtmosphereView;
  private readonly sky: SkyView;
  private readonly terrain: TerrainView;
  private readonly river: RiverView;
  private readonly settlement: SettlementView;
  private readonly distant: DistantScenery;
  private readonly ambient: AmbientEffects;
  private readonly playerView: ActorView;
  private readonly npcViews: NpcView[];
  private readonly npcSystem: NpcSystem;
  private readonly constructionSystem: ConstructionSystem;
  private readonly bridgeSystem: BridgeSystem;
  private readonly constructionView: ConstructionView;
  private readonly dailyIncome: DailyIncome;
  private readonly foodSystem: FoodSystem;
  private readonly productionSystem: ProductionSystem;
  private readonly merchantSystem: MerchantSystem;
  private readonly merchantView: NpcView;
  private readonly kingdomView: KingdomView;
  private readonly economyPanel: EconomyPanel;
  readonly saveSystem: SaveSystem;
  private readonly saveBar: SaveBar;
  /** A dialog is open: nothing moves until it closes, though the world is still drawn. */
  private modalOpen = false;
  private readonly explorationSystem: ExplorationSystem;
  private readonly explorationView: ExplorationView;
  private readonly vegetation: VegetationView;
  readonly interaction: InteractionSystem;
  private readonly marker: InteractionMarkerView;
  private readonly hud: HudView;
  private readonly hint = new HintOverlay();
  private readonly sharedTextures: Texture[];
  private time = 0;

  constructor(
    container: HTMLElement,
    diagnosticsEnabled: boolean,
    begin: GameStart,
    private readonly store: SaveStore,
    private readonly startOver: () => void,
  ) {
    // Game state and rules first; none of this touches the GPU.
    this.world = buildWorldData();
    this.collision = new CollisionWorld(this.world.colliders);
    const { minX, maxX, minZ, maxZ } = WORLD.bounds;
    const inset = NPC.navClearance;
    const nav = new NavGrid(
      { minX: minX + inset, maxX: maxX - inset, minZ: minZ + inset, maxZ: maxZ - inset },
      NPC.navCellSize,
      (x, z) => this.collision.isBlocked(x, z, NPC.navClearance),
    );
    nav.setMainRegion(PLAYER.spawnX, PLAYER.spawnZ);
    const sites = new VillageSites(nav, this.world);
    const definitions = [...NPC.villagers, ...NPC.travelers];
    const npcs = definitions.map((def, index) => {
      if (!sites.nearestPoint(def.spawn[0], def.spawn[1])) throw new Error(`No spawn point for ${def.id}`);
      const { pointX: x, pointZ: z } = sites;
      return createNpc(def, x, this.world.surfaceHeight(x, z), z, WORLD.seed, index);
    });
    this.state = createGameState(this.world.surfaceHeight(PLAYER.spawnX, PLAYER.spawnZ), npcs);
    // Before any system or view reads the state, so they all come up as if it had always been so.
    if (begin.kind === 'load') {
      applySave(this.state, begin.save, {
        isPlayerPosition: (x, z) => x >= WORLD.bounds.minX && x <= WORLD.bounds.maxX && z >= WORLD.bounds.minZ && z <= WORLD.bounds.maxZ
          && this.world.open.distance(x, z) < 0.5 && !this.collision.isBlocked(x, z, PLAYER.radius * 0.5),
        nearestWalkable: (x, z) => (sites.nearestPoint(x, z) ? { x: sites.pointX, z: sites.pointZ } : null),
        surfaceHeight: this.world.surfaceHeight,
      });
    }
    // Resolve spawns and saves with both banks available before splitting navigation.
    this.bridgeSystem = new BridgeSystem(this.state, this.collision, nav);
    this.movement = new PlayerMovementSystem(this.input, this.collision, this.world);
    const pathfinder = new Pathfinder(nav);
    this.merchantSystem = new MerchantSystem(this.state, sites, this.world.surfaceHeight);
    this.npcSystem = new NpcSystem(this.state, sites, pathfinder, { collision: this.collision, surfaceHeight: this.world.surfaceHeight }, this.merchantSystem);
    this.foodSystem = new FoodSystem(this.state);
    this.productionSystem = new ProductionSystem(this.state);
    this.constructionSystem = new ConstructionSystem(this.state, this.collision, nav);
    this.dailyIncome = new DailyIncome(this.state);
    this.explorationSystem = new ExplorationSystem(this.state);
    this.economyPanel = new EconomyPanel(this.state, () => this.input.releaseAll());
    this.interaction = new InteractionSystem([...createVillageInteractables(this.state), ...createExplorationInteractables(this.state), ...createEconomyInteractables(this.state, () => this.economyPanel.showTrading())]);

    // Then the visual representation.
    this.rendererHost = new RendererHost(container, (width, height) => this.onResize(width, height));
    const pixelRatio = this.rendererHost.pixelRatio;
    const noise = createNoiseTexture();
    const glow = createGlowTexture();
    this.sharedTextures = [noise, glow];

    this.atmosphere = new AtmosphereView(this.scene);
    this.sky = new SkyView(noise);
    this.terrain = new TerrainView(this.world, noise);
    this.river = new RiverView(noise);
    this.settlement = new SettlementView(this.world, glow, pixelRatio, this.state);
    this.distant = new DistantScenery();
    this.ambient = new AmbientEffects(pixelRatio);
    this.vegetation = new VegetationView(this.world.placements);
    const vegetation = this.vegetation;
    this.playerView = new ActorView(new PlaceholderCharacter({ hero: true }), glow, PLAYER.walkSpeed);
    this.npcViews = npcs.map((npc, i) => new NpcView(npc, definitions[i].palette, glow));
    this.merchantView = new NpcView(this.merchantSystem.npc, NPC.travelers[0].palette, glow);
    this.kingdomView = new KingdomView(this.state, this.merchantSystem.npc, this.world.surfaceHeight);
    this.explorationView = new ExplorationView(this.world, this.state.exploration, glow);
    this.constructionView = new ConstructionView(this.state.construction, this.world.heightfield.sample.bind(this.world.heightfield), this.rig.camera.quaternion, glow);
    this.marker = new InteractionMarkerView(this.world.surfaceHeight);
    this.hud = new HudView(this.state, this.interaction, () => this.openProfessions());
    this.saveSystem = new SaveSystem(this.state, this.store);
    this.saveBar = new SaveBar(this.hud.element, () => this.saveByHand(), () => void this.askToStartOver());
    this.saveSystem.onResult = (result, reason) => {
      if (!result.ok) this.saveBar.showError(`Could not save. ${result.reason}`);
      else this.saveBar.showSaved(reason === 'manual' ? 'Game saved' : 'Autosaved');
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pagehide', this.onLeave);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.scene.add(
      this.sky.mesh,
      this.terrain.mesh,
      this.river.mesh,
      this.settlement.group,
      this.distant.group,
      this.ambient.points,
      vegetation.group,
      this.playerView.group,
      this.marker.mesh,
      this.constructionView.group,
      this.explorationView.group,
      this.rig.camera,
      this.merchantView.object,
      this.kingdomView.group,
    );
    for (const view of this.npcViews) this.scene.add(view.object);
    vegetation.group.updateMatrixWorld(true);
    this.terrain.mesh.updateMatrixWorld(true);
    this.river.mesh.updateMatrixWorld(true);

    const { player } = this.state;
    this.rig.snapTo(player.x, player.y, player.z);
    this.onResize(container.clientWidth, container.clientHeight);
    this.uploadScene();

    this.diagnostics = diagnosticsEnabled
      ? new Diagnostics(this.rendererHost.renderer, this.scene, this.state, this.world, () => pathfinder.searches)
      : null;

    this.loop = new GameLoop({
      simulate: (dt) => this.simulate(dt),
      render: (alpha, frameDt, steps) => this.renderFrame(alpha, frameDt, steps),
    });
  }

  start(): void {
    this.loop.start();
  }

  /** Stops the loop and releases every GPU resource and DOM/event hook the game owns. */
  dispose(): void {
    this.loop.stop();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pagehide', this.onLeave);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.saveSystem.saveNow('auto');
    this.saveSystem.stop();
    this.input.dispose();
    this.hint.dispose();
    this.hud.dispose();
    this.economyPanel.dispose();
    this.merchantView.dispose();
    this.diagnostics?.dispose();
    this.playerView.dispose();
    for (const view of this.npcViews) view.dispose();
    this.terrain.dispose();
    disposeObject3D(this.scene);
    for (const texture of this.sharedTextures) texture.dispose();
    this.scene.clear();
    this.rendererHost.dispose();
  }

  /**
   * Draws everything once before the first real frame. Buffers go to the GPU the first time
   * something is drawn, so otherwise each new part of the forest would stutter on arrival.
   */
  private uploadScene(): void {
    this.vegetation.setCullingEnabled(false);
    this.explorationView.group.traverse((object) => {
      object.frustumCulled = false;
    });
    this.rendererHost.renderer.render(this.scene, this.rig.camera);
    this.vegetation.setCullingEnabled(true);
    this.explorationView.group.traverse((object) => {
      object.frustumCulled = true;
    });
  }

  private saveByHand(): void {
    this.saveSystem.saveNow('manual');
  }

  private async askToStartOver(): Promise<void> {
    this.modalOpen = true;
    this.input.releaseAll();
    const confirmed = await confirmDialog({
      title: 'Start a new game?',
      message: `This erases your saved game and your current progress (${describeSave(createSave(this.state, 0))}). It cannot be undone.`,
      confirmLabel: 'Erase and start',
      cancelLabel: 'Keep playing',
    });
    this.input.releaseAll();
    this.modalOpen = false;
    if (!confirmed) return;
    this.saveSystem.stop();
    this.startOver();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyR' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !this.modalOpen) {
      e.preventDefault(); this.openProfessions();
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      if (!this.modalOpen) this.saveByHand();
    }
  };

  private openProfessions(): void {
    const npc = this.state.npcs.find((n) => n.id === this.interaction.focus?.id);
    if (npc && npc.travelPhase === 'settled' && npc.job !== 'gatherer' && !npc.indoors) {
      npc.attentionTimer = Math.max(npc.attentionTimer, NPC.attentionSeconds);
      this.economyPanel.showProfessions(npc);
    }
  }

  /** The last chance to save on leaving, and hidden tabs may be closed without further notice. */
  private readonly onLeave = (): void => {
    this.saveSystem.saveNow('auto');
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.saveSystem.saveNow('auto');
  };

  private simulate(dt: number): void {
    if (this.modalOpen) return;
    this.diagnostics?.beginSim();
    const { player } = this.state;
    this.movement.update(player, dt);
    this.dayNight.update(this.state.time, dt);
    this.dailyIncome.update();
    this.foodSystem.update();
    this.constructionSystem.update(dt);
    this.bridgeSystem.update();
    this.productionSystem.update(dt);
    this.merchantSystem.update();
    this.npcSystem.update(dt);
    this.explorationSystem.update(dt);
    updateNotice(this.state, dt);
    this.interaction.update(player.x, player.z, this.input.consumeInteract(), dt);
    this.diagnostics?.endSim();
  }

  private renderFrame(alpha: number, frameDt: number, simSteps: number): void {
    const diagnostics = this.diagnostics;
    diagnostics?.beginFrame();
    if (!this.rendererHost.isContextLost) {
      this.time = (this.time + frameDt) % SHADER_TIME_WRAP;
      const time = this.time;
      sharedTime.value = time;

      const { player } = this.state;
      this.playerView.sync(player, alpha, frameDt, time);
      const pos = this.playerView.position;
      this.rig.update(pos.x, pos.y, pos.z, player.vx, frameDt);
      for (let i = 0; i < this.npcViews.length; i++) {
        const view = this.npcViews[i];
        view.sync(alpha, frameDt, time, this.rig.isNearView(view.x, view.z, NPC.viewCullMargin));
      }

      const horizon = this.rig.horizonZ;
      const visitor = this.merchantSystem.npc;
      this.merchantView.sync(alpha, frameDt, time, this.rig.isNearView(visitor.x, visitor.z, NPC.viewCullMargin));
      this.kingdomView.update(horizon);
      this.economyPanel.update(frameDt);
      sharedHorizonZ.value = horizon;
      const northZ = this.rig.visibleNorthZ;
      const southZ = this.rig.visibleSouthZ;
      this.terrain.setVisibleRange(northZ, southZ);
      this.river.setVisibleRange(northZ, southZ);
      this.vegetation.setHorizon(horizon);

      const sample = this.dayNight.evaluate(this.state.time.dayTime);
      const focus = this.rig.focus;
      this.atmosphere.update(sample, focus);
      this.sky.update(sample, time, focus.x);
      this.distant.update(sample, focus);
      this.river.update(sample, time);
      this.settlement.update(sample, time);
      this.ambient.update(sample, time, focus);
      this.hint.update(frameDt, player.distanceTravelled);
      this.constructionView.update(frameDt);
      this.explorationView.update(sample, time, frameDt, horizon);
      this.marker.update(this.interaction.focus, frameDt, time);
      this.hud.update(frameDt);
      this.saveBar.update(frameDt);
      this.saveSystem.update(frameDt);

      this.rendererHost.renderer.render(this.scene, this.rig.camera);
    }
    diagnostics?.endFrame(frameDt, simSteps);
  }

  private onResize(width: number, height: number): void {
    // RendererHost fires this once during its own construction, before the views exist.
    this.rig.setViewport(width, height);
    if (!this.atmosphere) return;
    this.atmosphere.setCoverage(this.rig.halfViewWidth);
    this.sky.setAspect(width / height);
    const pixelRatio = this.rendererHost.pixelRatio;
    this.settlement.setPixelRatio(pixelRatio);
    this.ambient.setPixelRatio(pixelRatio);
  }
}
