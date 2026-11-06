import { Color, InstancedMesh, Group, Matrix4, Euler, Quaternion, Vector3, type Material, MeshDepthMaterial, MeshLambertMaterial, RGBADepthPacking } from 'three';
import { CAMERA, WORLD } from '../config';
import { applyHorizon, createFoliageMaterial } from '../rendering/materials';
import { buildVegetationPrototypes } from './placeholders/vegetation';
import type { Placement, ScatterKind } from './WorldData';

/** The valley stays one band; the forests north and south of it are cut into rows. */
function depthBand(z: number): number {
  const { valleyBand, bandDepth } = WORLD.vegetationDepth;
  if (z < valleyBand.minZ) return -1 - Math.floor((valleyBand.minZ - z) / bandDepth);
  if (z >= valleyBand.maxZ) return 1 + Math.floor((z - valleyBand.maxZ) / bandDepth);
  return 0;
}

/**
 * Renders scatter data as InstancedMesh batches, split by kind, area and shadow
 * casting. An InstancedMesh culls as one unit, so these chunks are what lets
 * off-screen scenery skip the draw entirely, including in the shadow pass.
 */
export class VegetationView {
  readonly group = new Group();
  /** Each batch with its southernmost instance, so a batch wholly past the horizon can be skipped. */
  private readonly depthCulled: { mesh: InstancedMesh; maxZ: number }[] = [];
  private shownHorizon = Infinity;

  constructor(placements: readonly Placement[]) {
    const prototypes = buildVegetationPrototypes();
    const trees = createFoliageMaterial(0.0042);
    const low = createFoliageMaterial(0.04);
    const grass = createFoliageMaterial(0.2, true);
    const rock = new MeshLambertMaterial({ vertexColors: true });
    applyHorizon(rock, 'rock', 'instance');
    const materials: Record<ScatterKind, Material> = {
      pine: trees, pineSlim: trees, oak: trees, oakAmber: trees,
      bush: low, flower: grass, grass, rock,
    };

    // What is past the horizon casts no shadow either, which also spares the shadow pass.
    const shadowDepth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    applyHorizon(shadowDepth, 'instance-depth', 'instance');

    const batches = new Map<string, Placement[]>();
    for (const p of placements) {
      const chunk = Math.floor(p.x / WORLD.vegetationChunkSize);
      const key = `${p.kind}|${chunk}|${depthBand(p.z)}|${p.castShadow ? 1 : 0}`;
      const batch = batches.get(key);
      if (batch) batch.push(p);
      else batches.set(key, [p]);
    }

    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const euler = new Euler();
    const scale = new Vector3();
    const tint = new Color();
    for (const batch of batches.values()) {
      const first = batch[0];
      const mesh = new InstancedMesh(prototypes[first.kind], materials[first.kind], batch.length);
      mesh.castShadow = first.castShadow;
      mesh.customDepthMaterial = shadowDepth;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      for (let i = 0; i < batch.length; i++) {
        const p = batch[i];
        position.set(p.x, p.y, p.z);
        rotation.setFromEuler(euler.set(0, p.rotY, 0));
        scale.set(p.scale, p.scale * p.heightScale, p.scale);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
        mesh.setColorAt(i, tint.setRGB(p.tint, p.tint, p.tint * (0.92 + (p.tint - 0.86) * 0.3)));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      let maxZ = -Infinity;
      for (const p of batch) if (p.z > maxZ) maxZ = p.z;
      this.depthCulled.push({ mesh, maxZ });
    }
    this.group.matrixAutoUpdate = false;
  }

  /**
   * The shader shrinks anything past the horizon to nothing, but a batch that is entirely
   * past it would still be a draw call in both passes. The view frustum cannot catch these,
   * because what is north of the horizon still projects into the sky above it.
   */
  setHorizon(z: number): void {
    if (z === this.shownHorizon) return;
    this.shownHorizon = z;
    const limit = z - CAMERA.horizon.band;
    for (let i = 0; i < this.depthCulled.length; i++) {
      const entry = this.depthCulled[i];
      entry.mesh.visible = entry.maxZ > limit;
    }
  }

  /** Makes every batch drawable regardless of the view, or restores normal culling. */
  setCullingEnabled(enabled: boolean): void {
    for (const { mesh } of this.depthCulled) {
      mesh.frustumCulled = enabled;
      mesh.visible = true;
    }
    this.shownHorizon = Infinity;
  }
}
