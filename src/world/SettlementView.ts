import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Sprite, SpriteMaterial, type BufferGeometry, type Material, type Texture } from 'three';
import { PALETTE, WORLD } from '../config';
import { lerp } from '../core/math';
import type { AtmosphereSample } from '../systems/DayNightSystem';
import { CampfireView } from './CampfireView';
import { buildBarrier, buildBridge, buildFence, buildHouse, buildLanternPost, buildWoodpile } from './placeholders/props';
import type { WorldData } from './WorldData';

const windowDay = new Color(PALETTE.windowDay);
const windowNight = new Color(PALETTE.windowNight);
const lanternDay = new Color(PALETTE.lanternDay);
const lanternNight = new Color(PALETTE.lanternNight);

/**
 * All built structures: houses, bridge, fences, barriers, lanterns and campfire.
 * This is the swap point for GLB assets: replace a `buildX` call with a loaded
 * model placed at the same world-data transform.
 */
export class SettlementView {
  readonly group = new Group();
  private readonly windowMaterial = new MeshBasicMaterial({ color: PALETTE.windowDay });
  private readonly lanternMaterial = new MeshBasicMaterial({ color: PALETTE.lanternDay, fog: false });
  private readonly lanternGlowMaterial: SpriteMaterial;
  private readonly lanternGlows: Sprite[] = [];
  private readonly campfire: CampfireView;

  constructor(world: WorldData, glowTexture: Texture, pixelRatio: number) {
    const solid = new MeshLambertMaterial({ vertexColors: true });
    const addSolid = (geometry: BufferGeometry, material: Material = solid): Mesh => {
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    WORLD.houses.forEach((spec, i) => {
      const y = world.heightfield.sample(spec.x, spec.z);
      const { body, windows } = buildHouse(spec, 100 + i);
      const bodyMesh = addSolid(body);
      const windowMesh = new Mesh(windows, this.windowMaterial);
      this.group.add(windowMesh);
      for (const mesh of [bodyMesh, windowMesh]) {
        mesh.position.set(spec.x, y, spec.z);
        mesh.rotation.y = spec.rotY;
      }
    });

    const { x: bridgeX, z: bridgeZ } = WORLD.bridge;
    addSolid(buildBridge((localX) => world.deckHeight(localX + bridgeX), 200)).position.set(bridgeX, 0, bridgeZ);

    WORLD.fences.forEach((f, i) => {
      const dx = f.x2 - f.x1;
      const dz = f.z2 - f.z1;
      const x = (f.x1 + f.x2) / 2;
      const z = (f.z1 + f.z2) / 2;
      const fence = addSolid(buildFence(Math.hypot(dx, dz), 300 + i));
      fence.position.set(x, world.heightfield.sample(x, z), z);
      fence.rotation.y = Math.atan2(-dz, dx);
    });

    world.barriers.forEach((b, i) => {
      const barrier = addSolid(buildBarrier(400 + i));
      barrier.position.set(b.x, b.y, b.z);
      barrier.rotation.y = b.rotY;
    });

    const pile = WORLD.woodpile;
    const woodpile = addSolid(buildWoodpile(500));
    woodpile.position.set(pile.x, world.heightfield.sample(pile.x, pile.z), pile.z);
    woodpile.rotation.y = pile.rotY;

    this.lanternGlowMaterial = new SpriteMaterial({
      map: glowTexture,
      color: new Color(0xffa850),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const lantern = buildLanternPost();
    for (const [x, z] of WORLD.lanterns) {
      const y = world.heightfield.sample(x, z);
      addSolid(lantern.body).position.set(x, y, z);
      const glass = new Mesh(lantern.glass, this.lanternMaterial);
      glass.position.set(x, y, z);
      this.group.add(glass);
      const glow = new Sprite(this.lanternGlowMaterial);
      glow.position.set(x + 0.55, y + 1.73, z);
      glow.scale.set(3.4, 3.4, 1);
      this.group.add(glow);
      this.lanternGlows.push(glow);
    }

    const fire = WORLD.campfire;
    this.campfire = new CampfireView(world.heightfield.sample(fire.x, fire.z), glowTexture, solid, pixelRatio);
    this.group.add(this.campfire.group);
  }

  setPixelRatio(pixelRatio: number): void {
    this.campfire.setPixelRatio(pixelRatio);
  }

  update(sample: AtmosphereSample, time: number): void {
    const night = sample.night;
    this.windowMaterial.color.lerpColors(windowDay, windowNight, night);
    this.lanternMaterial.color.lerpColors(lanternDay, lanternNight, night);
    this.lanternGlowMaterial.opacity = lerp(0, 0.75, night);
    this.campfire.update(sample, time);
  }
}
