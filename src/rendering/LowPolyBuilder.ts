import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  BoxGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import type { Rng } from '../core/math';

export type Vec3 = readonly [number, number, number];

export interface PartOptions {
  at?: Vec3;
  rot?: Vec3;
  scale?: Vec3;
  /** Vertex color, or the color at the part's lowest point when colorTop is set. */
  color: number;
  /** Optional color at the part's highest point. */
  colorTop?: number;
  /** Random vertex displacement for an organic, hand-made silhouette. */
  jitter?: number;
  rng?: Rng;
  /** Shade as if facing straight up, so thin foliage takes the same light as the ground beneath it. */
  normalUp?: boolean;
}

const lowColor = new Color();
const topColor = new Color();
const mixColor = new Color();
const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scaleVec = new Vector3();

/**
 * Composes flat-shaded, vertex-colored geometry from primitives. Placeholder
 * props are merged into one mesh this way, for one draw call each. Build-time only.
 */
export class LowPolyBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];

  /** Vertices added so far. Lets a caller note where each piece ends, to reveal them in stages. */
  get vertexCount(): number {
    return this.positions.length / 3;
  }

  box(w: number, h: number, d: number, options: PartOptions): this {
    return this.add(new BoxGeometry(w, h, d), options);
  }

  cylinder(radiusTop: number, radiusBottom: number, height: number, segments: number, options: PartOptions): this {
    return this.add(new CylinderGeometry(radiusTop, radiusBottom, height, segments), options);
  }

  /** Open-bottomed cone with its base at the part origin (useful for canopies). */
  cone(radius: number, height: number, segments: number, options: PartOptions): this {
    const geometry = new ConeGeometry(radius, height, segments, 1, true);
    geometry.translate(0, height / 2, 0);
    return this.add(geometry, options);
  }

  blob(radius: number, detail: number, options: PartOptions): this {
    return this.add(new IcosahedronGeometry(radius, detail), options);
  }

  /** Triangular prism: ridge along X, peak at +Y, base centred on the origin. */
  prism(w: number, h: number, d: number, options: PartOptions): this {
    const x = w / 2;
    const z = d / 2;
    const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number[] =>
      [ax, ay, az, bx, by, bz, cx, cy, cz];
    const positions = [
      ...tri(x, 0, z, x, 0, -z, x, h, 0),
      ...tri(-x, 0, -z, -x, 0, z, -x, h, 0),
      ...tri(-x, 0, z, x, 0, z, x, h, 0), ...tri(-x, 0, z, x, h, 0, -x, h, 0),
      ...tri(x, 0, -z, -x, 0, -z, -x, h, 0), ...tri(x, 0, -z, -x, h, 0, x, h, 0),
    ];
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return this.add(geometry, options);
  }

  /** A single upright triangle: the cheapest possible grass blade. Tip leans along local +Z. */
  blade(width: number, height: number, lean: number, options: PartOptions): this {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([-width / 2, 0, 0, width / 2, 0, 0, 0, height, lean], 3));
    return this.add(geometry, options);
  }

  /** Bakes everything added so far into a single non-indexed geometry. */
  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private add(source: BufferGeometry, options: PartOptions): this {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (options.jitter && options.rng) jitterVertices(geometry, options.jitter, options.rng);

    const at = options.at ?? [0, 0, 0];
    const rot = options.rot ?? [0, 0, 0];
    const scale = options.scale ?? [1, 1, 1];
    position.set(at[0], at[1], at[2]);
    quaternion.setFromEuler(euler.set(rot[0], rot[1], rot[2]));
    scaleVec.set(scale[0], scale[1], scale[2]);
    geometry.applyMatrix4(matrix.compose(position, quaternion, scaleVec));
    geometry.computeVertexNormals(); // Non-indexed input, so this yields flat facets.

    const pos = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    lowColor.set(options.color);
    topColor.set(options.colorTop ?? options.color);
    geometry.computeBoundingBox();
    const minY = geometry.boundingBox!.min.y;
    const rangeY = Math.max(geometry.boundingBox!.max.y - minY, 1e-5);
    for (let i = 0; i < pos.count; i++) {
      this.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (options.normalUp) this.normals.push(0, 1, 0);
      else this.normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      mixColor.lerpColors(lowColor, topColor, (pos.getY(i) - minY) / rangeY);
      this.colors.push(mixColor.r, mixColor.g, mixColor.b);
    }
    if (geometry !== source) geometry.dispose();
    source.dispose();
    return this;
  }
}

/** Displaces coincident vertices identically, so a jittered mesh stays watertight. */
function jitterVertices(geometry: BufferGeometry, amount: number, rng: Rng): void {
  const pos = geometry.getAttribute('position');
  const offsets = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    // Math.round folds -0 into 0, so a cone's seam vertices are recognized as the same point.
    const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    let offset = offsets.get(key);
    if (!offset) {
      offset = [(rng() - 0.5) * amount, (rng() - 0.5) * amount, (rng() - 0.5) * amount];
      offsets.set(key, offset);
    }
    pos.setXYZ(i, pos.getX(i) + offset[0], pos.getY(i) + offset[1], pos.getZ(i) + offset[2]);
  }
}
