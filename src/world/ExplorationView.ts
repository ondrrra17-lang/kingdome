import { AdditiveBlending, Color, ConeGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshLambertMaterial, Object3D, RGBADepthPacking, Sprite, SpriteMaterial, type BufferGeometry, type Texture } from 'three';
import { CAMERA, EXPLORATION, type ClearingDefinition, type PropDefinition } from '../config';
import { damp, lerp, smoothstep } from '../core/math';
import { LowPolyBuilder } from '../rendering/LowPolyBuilder';
import { applyHorizon } from '../rendering/materials';
import type { ExplorationState, TreasureState } from '../systems/exploration/ExplorationState';
import type { AtmosphereSample } from '../systems/DayNightSystem';
import { addMushroomCaps, addProp, buildChestBase, buildChestLid } from './placeholders/exploration';
import type { WorldData } from './WorldData';

const LID_OPEN_ANGLE = -1.95;
const LID_HALF_LIFE = 0.09;
const BURST_SECONDS = 0.7;
const capsDay = new Color(0xd9b98a);
const capsNight = new Color(0x8ff0d8);

/** A merged mesh, plus each vertex's prop base, so whole props can go at the horizon. */
class PropBatch {
  readonly builder = new LowPolyBuilder();
  private readonly bases: number[] = [];

  /** Call after adding a prop's parts: everything added since the last call belongs to it. */
  closeProp(x: number, y: number, z: number): void {
    while (this.bases.length / 3 < this.builder.vertexCount) this.bases.push(x, y, z);
  }

  build(): BufferGeometry {
    const geometry = this.builder.build();
    geometry.setAttribute('aBase', new Float32BufferAttribute(this.bases, 3));
    return geometry;
  }
}

function nearestClearing(x: number, z: number): number {
  const clearings: readonly ClearingDefinition[] = EXPLORATION.clearings;
  let best = 0;
  let bestDist = Infinity;
  clearings.forEach((c, i) => {
    const dist = Math.hypot(x - c.x, z - c.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

class ChestView {
  readonly group = new Group();
  private readonly lid: Mesh;
  private readonly glint: Sprite;
  private readonly glintMaterial: SpriteMaterial;
  private readonly phase: number;
  private angle: number;
  private burst = 0;
  private wasOpened: boolean;

  constructor(
    private readonly treasure: TreasureState,
    x: number, y: number, z: number, rotY: number,
    base: BufferGeometry, lid: BufferGeometry, material: MeshLambertMaterial, glow: Texture,
  ) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = rotY;
    const baseMesh = new Mesh(base, material);
    this.lid = new Mesh(lid, material);
    // The lid's origin is its hinge, along the top of the chest's back edge.
    this.lid.position.set(0, 0.5, -0.33);
    baseMesh.castShadow = baseMesh.receiveShadow = this.lid.castShadow = this.lid.receiveShadow = true;
    this.wasOpened = treasure.opened;
    this.angle = treasure.opened ? LID_OPEN_ANGLE : 0;
    this.lid.rotation.x = this.angle;
    this.glintMaterial = new SpriteMaterial({ map: glow, color: 0xffe0a0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
    this.glint = new Sprite(this.glintMaterial);
    this.glint.position.set(0, 0.9, 0);
    this.phase = x * 0.7 + z;
    this.group.add(baseMesh, this.lid, this.glint);
  }

  update(time: number, frameDt: number, night: number, horizon: number): void {
    const { treasure, group } = this;
    const scale = smoothstep(horizon - CAMERA.horizon.band, horizon, group.position.z);
    group.visible = scale > 0;
    if (!group.visible) return;
    group.scale.setScalar(scale);
    if (treasure.opened && !this.wasOpened) {
      this.wasOpened = true;
      this.burst = BURST_SECONDS;
    }
    if (treasure.opened) this.angle = damp(this.angle, LID_OPEN_ANGLE, LID_HALF_LIFE, frameDt);
    this.lid.rotation.x = this.angle;

    if (this.burst > 0) {
      // Coins catching the light as the lid comes up.
      this.burst = Math.max(this.burst - frameDt, 0);
      const t = this.burst / BURST_SECONDS;
      this.glintMaterial.opacity = t;
      const size = 3.2 - t * 1.6;
      this.glint.scale.set(size, size, 1);
      this.glint.visible = true;
    } else if (treasure.opened) {
      this.glint.visible = false;
    } else {
      // A slow glint, so a chest can be spotted from a distance without a marker.
      const pulse = Math.max(Math.sin(time * 1.6 + this.phase), 0);
      this.glintMaterial.opacity = pulse * pulse * lerp(0.42, 0.7, night);
      const size = 0.9 + pulse * 0.55;
      this.glint.scale.set(size, size, 1);
    }
  }
}

interface Fire {
  flames: Mesh[];
  glow: Sprite;
  phase: number;
  scale: number;
}

/**
 * Everything built out in the forest: one merged mesh per location, chests that open,
 * and small fires and glowing mushrooms. Only sprites stand in for light here: the
 * village's fire is the one real light in the scene, and it should stay that way for
 * the sake of integrated GPUs.
 */
export class ExplorationView {
  readonly group = new Group();
  private readonly chests: ChestView[] = [];
  private readonly fires: Fire[] = [];
  private readonly fireGlowMaterial: SpriteMaterial;
  private readonly mushroomGlowMaterial: SpriteMaterial;
  private readonly capMaterial = new MeshBasicMaterial({ color: capsDay.getHex() });
  /** Flames and glows, which are simply hidden past the horizon. */
  private readonly lights: Object3D[] = [];

  constructor(world: WorldData, exploration: ExplorationState, glow: Texture) {
    const solid = new MeshLambertMaterial({ vertexColors: true });
    const propMaterial = new MeshLambertMaterial({ vertexColors: true });
    applyHorizon(propMaterial, 'prop', 'attribute');
    applyHorizon(this.capMaterial, 'cap', 'attribute');
    const propDepth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    applyHorizon(propDepth, 'prop-depth', 'attribute');
    const ground = (x: number, z: number): number => world.heightfield.sample(x, z);
    const props: readonly PropDefinition[] = EXPLORATION.props;

    const batches = new Map<number, PropBatch>();
    const caps = new PropBatch();
    props.forEach((prop, index) => {
      const cluster = nearestClearing(prop.x, prop.z);
      let batch = batches.get(cluster);
      if (!batch) batches.set(cluster, (batch = new PropBatch()));
      const y = ground(prop.x, prop.z);
      addProp(batch.builder, prop, y, 7000 + index);
      batch.closeProp(prop.x, y, prop.z);
      if (prop.kind === 'mushrooms') {
        addMushroomCaps(caps.builder, prop, y, 7000 + index);
        caps.closeProp(prop.x, y, prop.z);
      }
    });
    for (const batch of batches.values()) {
      const mesh = new Mesh(batch.build(), propMaterial);
      mesh.customDepthMaterial = propDepth;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.group.add(new Mesh(caps.build(), this.capMaterial));

    this.fireGlowMaterial = new SpriteMaterial({ map: glow, color: 0xff8a3a, transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, fog: false });
    this.mushroomGlowMaterial = new SpriteMaterial({ map: glow, color: 0x7fe8d0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false });
    const flameMaterials = [0xff6a24, 0xffc25a].map((color) => new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, fog: false }));
    const flameGeometries = [[0.42, 1.2], [0.22, 0.75]].map(([radius, height]) => {
      const geometry = new ConeGeometry(radius, height, 7, 1, true);
      geometry.translate(0, height / 2, 0);
      return geometry;
    });

    props.forEach((prop, index) => {
      const y = ground(prop.x, prop.z);
      if (prop.kind === 'fire') {
        const scale = prop.scale ?? 1;
        const flames = flameGeometries.map((geometry, i) => {
          const flame = new Mesh(geometry, flameMaterials[i]);
          flame.position.set(prop.x, y + 0.14, prop.z);
          this.group.add(flame);
          this.lights.push(flame);
          return flame;
        });
        const sprite = new Sprite(this.fireGlowMaterial);
        sprite.position.set(prop.x, y + 0.9 * scale, prop.z);
        this.group.add(sprite);
        this.lights.push(sprite);
        this.fires.push({ flames, glow: sprite, phase: index * 1.7, scale });
      } else if (prop.kind === 'mushrooms') {
        const sprite = new Sprite(this.mushroomGlowMaterial);
        sprite.position.set(prop.x, y + 0.4, prop.z);
        sprite.scale.set(3.2, 3.2, 1);
        this.group.add(sprite);
        this.lights.push(sprite);
      }
    });

    const base = buildChestBase();
    const lid = buildChestLid();
    EXPLORATION.treasures.forEach((def, i) => {
      const chest = new ChestView(exploration.treasures[i], def.x, ground(def.x, def.z), def.z, def.rotY, base, lid, solid, glow);
      this.chests.push(chest);
      this.group.add(chest.group);
    });
  }

  update(sample: AtmosphereSample, time: number, frameDt: number, horizon: number): void {
    const { night } = sample;
    for (let i = 0; i < this.chests.length; i++) this.chests[i].update(time, frameDt, night, horizon);
    for (let i = 0; i < this.lights.length; i++) this.lights[i].visible = this.lights[i].position.z > horizon;

    this.capMaterial.color.lerpColors(capsDay, capsNight, night);
    this.mushroomGlowMaterial.opacity = lerp(0, 0.55, night);

    const flicker = 0.86 + 0.1 * Math.sin(time * 9.3) + 0.06 * Math.sin(time * 17.7 + 1.3);
    this.fireGlowMaterial.opacity = lerp(0.14, 0.6, night) * flicker;
    for (let f = 0; f < this.fires.length; f++) {
      const fire = this.fires[f];
      for (let i = 0; i < fire.flames.length; i++) {
        const wobble = Math.sin(time * (7.5 + i * 2.2) + fire.phase + i);
        const flame = fire.flames[i];
        flame.scale.set(fire.scale * (1 - 0.08 * wobble), fire.scale * (1 + 0.17 * wobble), fire.scale * (1 - 0.06 * wobble));
        flame.rotation.y = time * (0.5 + i * 0.4);
      }
      const size = lerp(3.2, 8, night) * fire.scale;
      fire.glow.scale.set(size, size, 1);
    }
  }
}
