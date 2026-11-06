import { Group, Mesh, MeshLambertMaterial } from 'three';
import { BUILDINGS, CAMERA, KINGDOM, PALETTE } from '../config';
import type { GameState } from '../core/GameState';
import { LowPolyBuilder } from '../rendering/LowPolyBuilder';
import type { NpcState } from '../entities/Npc';
import type { BuildingSiteState } from '../systems/construction/ConstructionState';

/** Static merged props and one crop mesh; growth never drives simulation. */
export class KingdomView {
  readonly group = new Group();
  private readonly crops: Mesh;
  private readonly cache: Mesh;
  private readonly cart: Mesh;
  private readonly farmSite: BuildingSiteState;
  constructor(private readonly state: GameState, private readonly merchant: NpcState, private readonly height: (x: number, z: number) => number) {
    const material = new MeshLambertMaterial({ vertexColors: true });
    const crop = new LowPolyBuilder();
    for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
      const x = -2 + col * 0.55, z = -0.7 + row * 0.65;
      crop.box(0.045, 0.75, 0.045, { at: [x, 0.4, z], color: 0x748b35 });
      crop.box(0.16, 0.25, 0.11, { at: [x, 0.8, z], color: 0xd4b45b });
    }
    this.crops = new Mesh(crop.build(), material);
    const farm = BUILDINGS.find((b) => b.id === 'farm')!;
    this.farmSite = state.construction.find((s) => s.id === 'farm')!;
    this.crops.position.set(farm.x, height(farm.x, farm.z) + 0.15, farm.z);
    this.crops.receiveShadow = true;
    const cache = new LowPolyBuilder().box(0.9, 0.6, 0.7, { at: [0, 0.3, 0], color: PALETTE.plank })
      .box(1, 0.08, 0.8, { at: [0, 0.64, 0], color: PALETTE.timber })
      .box(0.55, 0.5, 0.5, { at: [0.4, 0.25, 0.65], color: 0xb59e6b });
    this.cache = new Mesh(cache.build(), material);
    const place = KINGDOM.events.cache;
    this.cache.position.set(place.x + 0.8, height(place.x, place.z), place.z);
    const cart = new LowPolyBuilder().box(1.1, 0.12, 1.35, { at: [0, 0.5, 0], color: PALETTE.plank });
    for (const x of [-0.6, 0.6]) {
      cart.box(0.1, 0.5, 1.4, { at: [x, 0.8, 0], color: PALETTE.timber });
      cart.cylinder(0.38, 0.38, 0.14, 8, { at: [x, 0.38, 0.1], rot: [0, 0, Math.PI / 2], color: PALETTE.plankDark });
    }
    cart.box(1.2, 0.5, 0.1, { at: [0, 0.8, -0.65], color: PALETTE.timber });
    cart.box(0.65, 0.55, 0.65, { at: [0, 0.83, 0], color: 0xa38e65 });
    this.cart = new Mesh(cart.build(), material);
    for (const mesh of [this.cart, this.cache]) { mesh.castShadow = true; mesh.receiveShadow = true; }
    this.group.add(this.crops, this.cache, this.cart);
    this.update();
  }
  update(horizon = -Infinity): void {
    const field = this.state.kingdom.field;
    this.crops.visible = this.farmSite.status === 'completed' && field.stage !== 'empty';
    this.crops.scale.y = field.stage === 'harvested' ? 0.13 : 0.2 + field.progress * 0.8;
    this.cache.visible = !this.state.kingdom.events.cacheCollected && KINGDOM.events.cache.z + 0.5 > horizon - CAMERA.horizon.band;
    const m = this.merchant;
    this.cart.visible = !m.dormant && m.z + 1 > horizon - CAMERA.horizon.band;
    if (!this.cart.visible) return;
    // The cart occupies the merchant's navigated footprint; decorative shafts extend backward.
    this.cart.position.set(m.x, this.height(m.x, m.z), m.z);
    this.cart.rotation.y = m.facing;
  }
}
