import { AdditiveBlending, type BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, type Quaternion, Sprite, SpriteMaterial, type Texture } from 'three';
import { BUILDINGS, type BuildingDefinition } from '../config';
import type { BuildingSiteState } from '../systems/construction/ConstructionState';
import { buildFoundation, buildScaffold, buildSiteMarker, buildStructure, buildTimberPile, type StructureGeometry } from './placeholders/buildings';

const FINISH_SECONDS = 0.9;
const BAR_WIDTH = 2.2;
const BAR_HEIGHT = 0.2;

/** Reveals the first `count` whole pieces of a staged geometry, without allocating. */
function revealPieces(geometry: BufferGeometry, pieceEnds: readonly number[], count: number): void {
  geometry.setDrawRange(0, count <= 0 ? 0 : pieceEnds[Math.min(count, pieceEnds.length) - 1]);
}

class SiteView {
  readonly group = new Group();
  private readonly marker: Mesh;
  private readonly timber: Mesh;
  private readonly scaffold: Mesh;
  private readonly structure: Mesh;
  private readonly structureData: StructureGeometry;
  private readonly timberData: StructureGeometry;
  private readonly barBack: Mesh;
  private readonly barFill: Mesh;
  private readonly glow: Sprite;
  private readonly glowMaterial: SpriteMaterial;
  private shownPieces = -1;
  private shownLogs = -1;
  private wasCompleted = false;
  private finishTimer = 0;

  constructor(
    private readonly def: BuildingDefinition,
    private readonly site: BuildingSiteState,
    seed: number,
    groundY: number,
    material: MeshLambertMaterial,
    barBackMaterial: MeshBasicMaterial,
    barFillMaterial: MeshBasicMaterial,
    cameraRotation: Quaternion,
    glowTexture: Texture,
  ) {
    this.group.position.set(def.x, groundY, def.z);
    this.group.rotation.y = def.rotY;

    const solidMesh = (geometry: BufferGeometry, castShadow = true): Mesh => {
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    solidMesh(buildFoundation(def, seed), false);
    this.marker = solidMesh(buildSiteMarker(def));
    this.timberData = buildTimberPile(seed + 1);
    this.timber = solidMesh(this.timberData.geometry);
    this.timber.position.set(def.timberSide * (def.halfX + 0.75), 0, 0.25);
    this.timber.rotation.y = Math.PI / 2;
    this.scaffold = solidMesh(buildScaffold(def));
    this.structureData = buildStructure(def, seed + 2);
    this.structure = solidMesh(this.structureData.geometry);

    // A plane copying the camera's fixed rotation always faces it, so only this one write is needed.
    const barGeometry = new PlaneGeometry(1, 1);
    this.barBack = new Mesh(barGeometry, barBackMaterial);
    this.barBack.scale.set(BAR_WIDTH + 0.14, BAR_HEIGHT + 0.14, 1);
    this.barFill = new Mesh(barGeometry, barFillMaterial);
    this.barBack.renderOrder = 10;
    this.barFill.renderOrder = 11;
    for (const bar of [this.barBack, this.barFill]) {
      bar.frustumCulled = false;
      bar.position.y = def.height + 0.8;
      bar.quaternion.copy(cameraRotation).premultiply(this.group.quaternion.clone().invert());
      this.group.add(bar);
    }

    this.glowMaterial = new SpriteMaterial({
      map: glowTexture,
      color: new Color(0xffd98a),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.glow = new Sprite(this.glowMaterial);
    this.glow.position.y = def.height * 0.5;
    this.glow.visible = false;
    this.group.add(this.glow);

    this.wasCompleted = site.status === 'completed';
  }

  update(frameDt: number): void {
    const { site, def } = this;
    const isCompleted = site.status === 'completed';
    const paidFor = site.status !== 'available';

    this.marker.visible = !paidFor;
    this.scaffold.visible = paidFor && !isCompleted;
    this.timber.visible = paidFor && !isCompleted;
    this.structure.visible = site.progress > 0;

    const pieces = Math.floor(site.progress * this.structureData.pieceEnds.length);
    if (pieces !== this.shownPieces) {
      this.shownPieces = pieces;
      revealPieces(this.structure.geometry, this.structureData.pieceEnds, pieces);
    }
    const logs = Math.ceil((1 - site.progress) * this.timberData.pieceEnds.length);
    if (logs !== this.shownLogs) {
      this.shownLogs = logs;
      revealPieces(this.timber.geometry, this.timberData.pieceEnds, logs);
    }

    const building = site.status === 'building';
    this.barBack.visible = building;
    this.barFill.visible = building;
    if (building) {
      const width = BAR_WIDTH * Math.max(site.progress, 0.001);
      this.barFill.scale.set(width, BAR_HEIGHT, 1);
      // Left-aligned in the bar's own screen-facing frame.
      this.barFill.position.set(0, def.height + 0.8, 0.001);
      this.barFill.translateX((width - BAR_WIDTH) / 2);
    }

    if (isCompleted && !this.wasCompleted) {
      this.wasCompleted = true;
      this.finishTimer = FINISH_SECONDS;
      this.glow.visible = true;
    }
    if (this.finishTimer > 0) {
      this.finishTimer = Math.max(this.finishTimer - frameDt, 0);
      const t = 1 - this.finishTimer / FINISH_SECONDS;
      this.glowMaterial.opacity = (1 - t) * 0.85;
      const size = def.height * (1.6 + t * 1.4);
      this.glow.scale.set(size, size, 1);
      // A little settle: the finished building drops gently into place.
      this.structure.scale.y = 1 + (1 - t) * (1 - t) * 0.05;
      if (this.finishTimer === 0) {
        this.glow.visible = false;
        this.structure.scale.y = 1;
      }
    }
  }
}

/** Draws every construction site from its state. The simulation never touches this. */
export class ConstructionView {
  readonly group = new Group();
  private readonly views: SiteView[] = [];

  constructor(
    sites: readonly BuildingSiteState[],
    heightAt: (x: number, z: number) => number,
    cameraRotation: Quaternion,
    glowTexture: Texture,
  ) {
    const material = new MeshLambertMaterial({ vertexColors: true });
    const common = { transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false };
    const barBack = new MeshBasicMaterial({ color: 0x20160e, opacity: 0.85, ...common });
    const barFill = new MeshBasicMaterial({ color: 0xffc95c, opacity: 1, ...common });
    BUILDINGS.forEach((def, index) => {
      const view = new SiteView(def, sites[index], 900 + index * 10, heightAt(def.x, def.z), material, barBack, barFill, cameraRotation, glowTexture);
      this.views.push(view);
      this.group.add(view.group);
    });
  }

  update(frameDt: number): void {
    for (let i = 0; i < this.views.length; i++) this.views[i].update(frameDt);
  }
}
