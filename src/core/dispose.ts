import { Material, Mesh, Object3D, Texture } from 'three';

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}

/**
 * Releases the GPU resources of a whole subtree. InstancedMesh, Points, Sprite,
 * and LineSegments all derive from or duck-type the Mesh geometry/material pair.
 * Safe with shared geometries and materials, since dispose() is idempotent.
 */
export function disposeObject3D(root: Object3D): void {
  root.traverse((node) => {
    const drawable = node as Mesh & { dispose?: () => void };
    drawable.geometry?.dispose();
    const material = drawable.material;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
    // InstancedMesh and lights expose their own dispose for instance buffers and shadow maps.
    drawable.dispose?.();
  });
}
