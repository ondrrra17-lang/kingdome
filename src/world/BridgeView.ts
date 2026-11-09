import { Group, Mesh, MeshLambertMaterial } from 'three';
import { BUILDINGS, PALETTE, WORLD } from '../config';
import type { GameState } from '../core/GameState';
import { LowPolyBuilder } from '../rendering/LowPolyBuilder';
import { buildBridge } from './placeholders/props';
import type { WorldData } from './WorldData';

/** Static bank sections plus a gradually restored central deck. No geometry is rebuilt per frame. */
export class BridgeView {
  readonly group = new Group();
  private readonly repair: Mesh;
  private readonly sign: Mesh;
  private readonly timber: Mesh;
  private readonly site;
  private readonly repairVertices: number;

  constructor(world: WorldData, state: GameState) {
    this.site = state.construction.find((s) => s.id === 'bridge')!;
    const material = new MeshLambertMaterial({ vertexColors: true });
    const add = (mesh: Mesh): Mesh => {
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const height = (x: number): number => world.deckHeight(x + WORLD.bridge.x);
    add(new Mesh(buildBridge(height, 200, 'banks'), material)).position.set(WORLD.bridge.x, 0, WORLD.bridge.z);
    this.repair = add(new Mesh(buildBridge(height, 200, 'gap'), material));
    this.repair.position.set(WORLD.bridge.x, 0, WORLD.bridge.z);
    this.repairVertices = this.repair.geometry.getAttribute('position').count;

    const def = BUILDINGS.find((b) => b.id === 'bridge')!;
    const marker = new LowPolyBuilder();
    marker.box(0.14, 1.5, 0.14, { at: [0, 0.75, 0], color: PALETTE.timber });
    marker.box(1.35, 0.62, 0.12, { at: [0, 1.3, 0], color: PALETTE.plank });
    // Two crossed timbers make the closed route legible without floating text.
    for (const tilt of [-0.55, 0.55]) marker.box(0.85, 0.09, 0.035, { at: [0, 1.3, 0.08], rot: [0, 0, tilt], color: 0xf0d9a4 });
    this.sign = add(new Mesh(marker.build(), material));
    this.sign.position.set(def.anchor[0] + 0.1, world.surfaceHeight(def.anchor[0], 1.3), 1.3);
    const logs = new LowPolyBuilder();
    for (let i = 0; i < 4; i++) logs.box(1.9, 0.18, 0.18, { at: [0, 0.1 + (i % 2) * 0.2, Math.floor(i / 2) * 0.25], color: PALETTE.timberLight });
    this.timber = add(new Mesh(logs.build(), material));
    this.timber.position.set(24.5, world.surfaceHeight(24.5, -2.2), -2.2);
    this.update();
  }

  update(): void {
    const completed = this.site.status === 'completed';
    const progress = completed ? 1 : this.site.progress;
    this.repair.geometry.setDrawRange(0, completed ? this.repairVertices : Math.floor(progress * this.repairVertices / 36) * 36);
    this.sign.visible = !completed;
    this.timber.visible = !completed && this.site.status !== 'available';
  }
}
