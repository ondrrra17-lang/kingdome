import { AdditiveBlending, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { damp } from '../core/math';
import type { Interactable } from '../systems/interaction/InteractionSystem';

const FOLLOW_HALF_LIFE = 0.03;
const HEIGHT_ABOVE_GROUND = 0.07;

/** One glowing ground ring under the interaction focus, so only one thing is ever highlighted. */
export class InteractionMarkerView {
  readonly mesh: Mesh;
  private readonly material: MeshBasicMaterial;
  private current: Interactable | null = null;

  constructor(private readonly surfaceHeight: (x: number, z: number) => number) {
    const geometry = new RingGeometry(0.86, 1, 40);
    geometry.rotateX(-Math.PI / 2);
    this.material = new MeshBasicMaterial({
      color: 0xffd98a,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.visible = false;
  }

  update(focus: Interactable | null, frameDt: number, time: number): void {
    const mesh = this.mesh;
    mesh.visible = focus !== null;
    if (!focus) {
      this.current = null;
      return;
    }
    if (focus !== this.current) {
      this.current = focus;
      mesh.position.set(focus.x, 0, focus.z);
    } else {
      // Smooths the moving villager's fixed-step position across rendered frames.
      mesh.position.x = damp(mesh.position.x, focus.x, FOLLOW_HALF_LIFE, frameDt);
      mesh.position.z = damp(mesh.position.z, focus.z, FOLLOW_HALF_LIFE, frameDt);
    }
    mesh.position.y = this.surfaceHeight(mesh.position.x, mesh.position.z) + HEIGHT_ABOVE_GROUND;
    const pulse = Math.sin(time * 3.2);
    const scale = focus.markerRadius * (1 + pulse * 0.035);
    mesh.scale.set(scale, 1, scale);
    this.material.opacity = 0.62 + pulse * 0.16;
  }
}
