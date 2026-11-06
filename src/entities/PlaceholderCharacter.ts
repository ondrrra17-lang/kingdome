import { Bone, BufferGeometry, Float32BufferAttribute, Group, MeshLambertMaterial, Skeleton, SkinnedMesh, Sphere, Uint16BufferAttribute, Vector3 } from 'three';
import { PALETTE, type CharacterPalette } from '../config';
import { clamp, damp } from '../core/math';
import { LowPolyBuilder } from '../rendering/LowPolyBuilder';
import type { CharacterMotion, CharacterVisual } from './CharacterVisual';

const CHARACTER_SCALE = 1.22;
const STAND_HIP_HEIGHT = 0.78;
const SIT_HIP_HEIGHT = 0.3;

export interface CharacterOptions {
  palette?: CharacterPalette;
  /** Hero details: cape and sword. */
  hero?: boolean;
}

/** Generous bounds around a standing or working character, for view culling. */
const BOUNDS = new Sphere(new Vector3(0, 0.9, 0), 2.6);

/** All characters look the same to the GPU, so they can share one material. */
const sharedMaterial = new MeshLambertMaterial({ vertexColors: true });

/**
 * Jointed box character about 2 units tall, with procedural animation. Local forward is +Z.
 *
 * All parts live in one geometry, with each vertex tied to one joint. That makes one draw call
 * per pass instead of one per body part, which is most of what a crowded village costs to draw.
 */
export class PlaceholderCharacter implements CharacterVisual {
  readonly object = new Group();
  private readonly mesh: SkinnedMesh;
  private readonly hips = new Bone();
  private readonly torso: Bone;
  private readonly head: Bone;
  private readonly armL: Bone;
  private readonly armR: Bone;
  private readonly legL: Bone;
  private readonly legR: Bone;
  private readonly cape: Bone | null;
  private readonly axe: Bone | null;
  private readonly hammer: Bone | null;
  private readonly load: Bone | null;
  private readonly hoe: Bone | null;
  private readonly bow: Bone | null;
  private readonly sack: Bone | null;
  private readonly palette: CharacterPalette;
  /** Each joint's geometry, merged once they are all in place. */
  private readonly parts: { bone: Bone; geometry: BufferGeometry }[] = [];

  private gait = 0;
  private lean = 0;
  private roll = 0;
  private sit = 0;
  private work = 0;

  constructor(options: CharacterOptions = {}) {
    const C = options.palette ?? PALETTE.character;
    const hero = options.hero ?? false;
    this.palette = C;
    const b = (): LowPolyBuilder => new LowPolyBuilder();

    this.legL = this.joint(this.hips, -0.15, 0, 0, this.legGeometry());
    this.legR = this.joint(this.hips, 0.15, 0, 0, this.legGeometry());

    const torso = b()
      .box(0.56, 0.66, 0.34, { at: [0, 0.34, 0], color: C.tunicDark, colorTop: C.tunic })
      .box(0.62, 0.3, 0.4, { at: [0, 0.0, 0], color: C.tunicDark })
      .box(0.59, 0.08, 0.37, { at: [0, 0.14, 0], color: C.belt })
      .box(0.11, 0.09, 0.04, { at: [0, 0.14, 0.19], color: C.metal });
    if (hero) torso.box(0.09, 1.02, 0.05, { at: [0.08, 0.36, -0.2], rot: [0, 0, -0.5], color: C.metal, colorTop: C.belt });
    this.torso = this.joint(this.hips, 0, 0, 0, torso.build());

    this.armL = this.joint(this.torso, -0.36, 0.62, 0, this.armGeometry());
    this.armR = this.joint(this.torso, 0.36, 0.62, 0, this.armGeometry());

    const head = b()
      .box(0.38, 0.38, 0.36, { at: [0, 0.19, 0], color: C.skin })
      .box(0.44, 0.17, 0.42, { at: [0, 0.34, -0.015], color: C.hood })
      .box(0.44, 0.34, 0.1, { at: [0, 0.2, -0.17], color: C.hood })
      .box(0.05, 0.34, 0.24, { at: [-0.205, 0.2, -0.07], color: C.hood })
      .box(0.05, 0.34, 0.24, { at: [0.205, 0.2, -0.07], color: C.hood })
      .box(0.26, 0.2, 0.2, { at: [0, 0.48, -0.08], rot: [-0.45, 0, 0], color: C.hood })
      .box(0.05, 0.07, 0.02, { at: [-0.085, 0.2, 0.185], color: C.eye })
      .box(0.05, 0.07, 0.02, { at: [0.085, 0.2, 0.185], color: C.eye })
      .build();
    this.head = this.joint(this.torso, 0, 0.67, 0, head);

    if (hero) {
      const cape = b()
        .box(0.52, 0.95, 0.05, { at: [0, -0.46, 0], color: C.cape })
        .box(0.5, 0.1, 0.16, { at: [0, 0.01, 0.06], color: C.cape })
        .build();
      this.cape = this.joint(this.torso, 0, 0.62, -0.19, cape);
      this.axe = null;
      this.hammer = null;
      this.load = null;
      this.hoe = this.bow = this.sack = null;
    } else {
      this.cape = null;
      this.axe = this.prop(this.armR, buildAxe());
      this.hammer = this.prop(this.armR, buildHammer());
      this.load = this.prop(this.torso, buildLogBundle());
      this.hoe = this.prop(this.armR, new LowPolyBuilder()
        .box(0.045, 1.05, 0.045, { at: [0, -0.4, 0.05], color: 0x94683e })
        .box(0.32, 0.07, 0.16, { at: [0, -0.92, 0.12], color: 0x747c7d }).build());
      this.bow = this.prop(this.armL, new LowPolyBuilder()
        .box(0.045, 0.85, 0.05, { at: [0, -0.2, 0.18], rot: [0.2, 0, 0], color: 0x94683e })
        .box(0.015, 0.84, 0.015, { at: [0, -0.2, 0.05], color: 0xd9c9b0 }).build());
      this.sack = this.prop(this.torso, new LowPolyBuilder()
        .box(0.48, 0.62, 0.32, { at: [-0.18, 0.32, -0.36], color: 0xb5a174 })
        .box(0.3, 0.1, 0.26, { at: [-0.18, 0.66, -0.36], color: 0x786845 }).build());
    }

    this.hips.position.y = STAND_HIP_HEIGHT;
    this.mesh = this.buildMesh();
    this.object.add(this.mesh);
    // Tools and the load are out of sight until needed.
    for (const hidden of [this.axe, this.hammer, this.load, this.hoe, this.bow, this.sack]) hidden?.scale.setScalar(0);
    // Slightly oversized against the props so characters read clearly at this zoom.
    this.object.scale.setScalar(CHARACTER_SCALE);
  }

  update(m: CharacterMotion): void {
    const dt = m.frameDt;
    const speed = clamp(m.speedRatio, 0, 2);
    // The gait factor eases in and out, so stopping settles rather than pops.
    this.gait = damp(this.gait, speed, 0.07, dt);
    const gait = Math.min(this.gait, 1);
    const sprint = clamp(this.gait - 1, 0, 1);
    this.sit = damp(this.sit, m.pose === 'sit' ? 1 : 0, 0.14, dt);
    const working = m.pose === 'chop' || m.pose === 'gather' || m.pose === 'build' || m.pose === 'farm' || m.pose === 'hunt';
    this.work = damp(this.work, working ? 1 : 0, 0.12, dt);
    const sit = this.sit;
    const work = this.work;

    // One full leg cycle spans two strides.
    const cycle = m.stride * Math.PI;
    const swing = Math.sin(cycle) * gait * (0.62 + sprint * 0.42);
    this.legL.rotation.x = swing * (1 - sit) - 1.45 * sit;
    this.legR.rotation.x = -swing * (1 - sit) - 1.45 * sit;
    this.armL.rotation.x = -swing * 0.85 - 0.5 * sit;
    this.armR.rotation.x = swing * 0.85 - 0.5 * sit;
    this.armL.rotation.z = -0.09 - sprint * 0.1;
    this.armR.rotation.z = 0.09 + sprint * 0.1;

    const idle = Math.sin(m.time * 1.9);
    const bob = Math.abs(Math.cos(cycle)) * 0.075 * gait * (1 + sprint * 0.45);
    const standHeight = STAND_HIP_HEIGHT + bob - 0.04 * gait + idle * 0.007 * (1 - gait);
    this.hips.position.y = standHeight + (SIT_HIP_HEIGHT - standHeight) * sit;
    this.torso.scale.y = 1 + idle * 0.009 * (1 - gait);

    let workLean = 0;
    if (work > 0.01) {
      // Sharp downswing, slow lift: reads as effort rather than waving.
      const rate = m.pose === 'chop' ? 0.85 : m.pose === 'build' ? 1.5 : 0.6;
      const phase = (m.time * rate) % 1;
      const strike = phase < 0.72 ? phase / 0.72 : 1 - (phase - 0.72) / 0.28;
      if (m.pose === 'gather' || m.pose === 'farm') {
        workLean = 0.75;
        this.armL.rotation.x += work * (-0.9 - strike * 0.5);
        this.armR.rotation.x += work * (-0.9 - (1 - strike) * 0.5);
      } else if (m.pose === 'hunt') {
        workLean = 0.12;
        this.armL.rotation.x += work * -1.5;
        this.armR.rotation.x += work * (-1.1 - strike * 0.25);
        this.armR.rotation.z += work * -0.65;
      } else if (m.pose === 'build') {
        // Short, quick hammer taps with the off hand steadying the work.
        workLean = 0.14;
        this.armR.rotation.x += work * (-2 + (1 - strike) * 0.8);
        this.armL.rotation.x += work * -1.25;
      } else {
        workLean = 0.1 + (1 - strike) * 0.26;
        const raised = -2.3 + (1 - strike) * 1.5;
        this.armR.rotation.x += work * raised;
        this.armL.rotation.x += work * (raised * 0.7);
      }
    }

    const targetLean = gait * 0.1 + sprint * 0.2 + clamp(m.acceleration * 0.012, -0.2, 0.22) + workLean * work;
    this.lean = damp(this.lean, targetLean, 0.09, dt);
    this.torso.rotation.x = this.lean;
    this.torso.rotation.y = Math.sin(cycle) * 0.1 * gait;
    this.head.rotation.x = -this.lean * 0.65;
    this.head.rotation.y = -this.torso.rotation.y;

    this.roll = damp(this.roll, clamp(-m.turnRate * 0.03, -0.2, 0.2) * Math.min(this.gait, 1.3), 0.1, dt);
    this.hips.rotation.z = this.roll;

    if (this.cape) {
      const flutter = Math.sin(m.time * 7 + m.stride) * 0.05 * gait + idle * 0.012;
      this.cape.rotation.x = -(0.05 + gait * 0.38 + sprint * 0.5 + flutter) - this.lean * 0.4;
    }
    this.axe?.scale.setScalar(m.tool === 'axe' ? 1 : 0);
    this.hammer?.scale.setScalar(m.tool === 'hammer' ? 1 : 0);
    this.hoe?.scale.setScalar(m.tool === 'hoe' && !m.carrying ? 1 : 0);
    this.bow?.scale.setScalar(m.tool === 'bow' && !m.carrying ? 1 : 0);
    this.sack?.scale.setScalar(m.carrying && m.produceLoad ? 1 : 0);
    if (this.load) {
      this.load.scale.setScalar(m.carrying && !m.produceLoad ? 1 : 0);
      // Carrying keeps one arm up, steadying the load.
      if (m.carrying) this.armL.rotation.x = -2.5;
    }
  }

  private joint(parent: Bone, x: number, y: number, z: number, geometry: BufferGeometry): Bone {
    const joint = new Bone();
    joint.position.set(x, y, z);
    parent.add(joint);
    this.parts.push({ bone: joint, geometry });
    return joint;
  }

  /** Something carried: a joint of its own, sized to zero when it should not show. */
  private prop(parent: Bone, geometry: BufferGeometry): Bone {
    return this.joint(parent, 0, 0, 0, geometry);
  }

  /** Bakes all parts in their rest pose into one geometry, and ties each vertex to its joint. */
  private buildMesh(): SkinnedMesh {
    this.hips.updateMatrixWorld(true);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    const bones: Bone[] = [this.hips];
    for (const { bone, geometry } of this.parts) {
      const index = bones.push(bone) - 1;
      geometry.applyMatrix4(bone.matrixWorld);
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const color = geometry.getAttribute('color');
      for (let i = 0; i < position.count; i++) {
        positions.push(position.getX(i), position.getY(i), position.getZ(i));
        normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        colors.push(color.getX(i), color.getY(i), color.getZ(i));
        skinIndices.push(index, 0, 0, 0);
        skinWeights.push(1, 0, 0, 0);
      }
      geometry.dispose();
    }
    const merged = new BufferGeometry();
    merged.setAttribute('position', new Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    merged.setAttribute('color', new Float32BufferAttribute(colors, 3));
    merged.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4));
    merged.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4));

    const mesh = new SkinnedMesh(merged, sharedMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.boundingSphere = BOUNDS;
    mesh.add(this.hips);
    mesh.updateMatrixWorld(true);
    mesh.bind(new Skeleton(bones));
    return mesh;
  }

  dispose(): void {
    this.mesh.skeleton.dispose();
  }

  private legGeometry(): BufferGeometry {
    const C = this.palette;
    return new LowPolyBuilder()
      .box(0.2, 0.62, 0.24, { at: [0, -0.31, 0], color: C.leg })
      .box(0.22, 0.2, 0.36, { at: [0, -0.68, 0.05], color: C.boot })
      .build();
  }

  private armGeometry(): BufferGeometry {
    const C = this.palette;
    return new LowPolyBuilder()
      .box(0.16, 0.42, 0.18, { at: [0, -0.2, 0], color: C.tunic })
      .box(0.14, 0.14, 0.15, { at: [0, -0.47, 0], color: C.skin })
      .build();
  }
}

/** Axe held in the fist, handle pointing away from the arm. */
function buildAxe(): BufferGeometry {
  return new LowPolyBuilder()
    .box(0.06, 0.06, 0.82, { at: [0, -0.5, 0.3], color: PALETTE.timberLight })
    .box(0.05, 0.26, 0.2, { at: [0, -0.48, 0.68], color: PALETTE.character.metal })
    .build();
}

/** Short mallet held in the fist. */
function buildHammer(): BufferGeometry {
  return new LowPolyBuilder()
    .box(0.05, 0.05, 0.52, { at: [0, -0.5, 0.17], color: PALETTE.timberLight })
    .box(0.13, 0.17, 0.13, { at: [0, -0.5, 0.42], color: PALETTE.iron })
    .build();
}

/** Logs across the back and shoulder. */
function buildLogBundle(): BufferGeometry {
  const logs = new LowPolyBuilder();
  for (const [y, z] of [[0.72, -0.22], [0.74, -0.42], [0.92, -0.32]] as const) {
    logs.cylinder(0.1, 0.1, 1.3, 6, { at: [0, y, z], rot: [0, 0, Math.PI / 2], color: PALETTE.plank, colorTop: PALETTE.timberLight });
  }
  return logs.build();
}
