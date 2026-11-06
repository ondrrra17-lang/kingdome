import { BufferGeometry, Color, DataTexture, Float32BufferAttribute, LinearFilter, Mesh, MeshLambertMaterial, RGBAFormat, Uint32BufferAttribute, UnsignedByteType, Vector2, type Texture } from 'three';
import { EXPLORATION, PALETTE, WORLD } from '../config';
import { clamp, smoothstep } from '../core/math';
import { riverCenterX, riverWidthScale } from './Paths';
import type { WorldData } from './WorldData';

const ROAD_SDF_RANGE = 8;
const { terrain, strip } = WORLD;

/**
 * Terrain mesh with a painted-look ground shader. Instead of a large color
 * texture, a small baked mask stores road distance, bank, wear and forest shade;
 * the fragment shader turns these into crisp colors at any zoom.
 */
export class TerrainView {
  readonly mesh: Mesh;
  private readonly maskTexture: DataTexture;
  private firstRow = -1;
  private endRow = -1;
  private readonly columnCount: number;
  private readonly rowCount: number;

  constructor(world: WorldData, noise: Texture) {
    this.columnCount = world.heightfield.columns;
    this.rowCount = world.heightfield.rows;
    this.maskTexture = bakeGroundMask(world);
    const geometry = buildGeometry(world);
    const material = new MeshLambertMaterial();
    applyGroundShader(material, this.maskTexture, noise);
    this.mesh = new Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.matrixAutoUpdate = false;
  }

  /** Draws only the rows in view. Rows are in index order, so this is only a draw range. */
  setVisibleRange(northZ: number, southZ: number): void {
    const lastRow = this.rowCount - 1;
    const first = clamp(Math.floor((northZ - terrain.minZ) / terrain.cellSize), 0, lastRow);
    const end = clamp(Math.ceil((southZ - terrain.minZ) / terrain.cellSize), first, lastRow);
    if (first === this.firstRow && end === this.endRow) return;
    this.firstRow = first;
    this.endRow = end;
    const indicesPerRow = (this.columnCount - 1) * 6;
    this.mesh.geometry.setDrawRange(first * indicesPerRow, (end - first) * indicesPerRow);
  }

  dispose(): void {
    this.maskTexture.dispose();
  }
}

function buildGeometry(world: WorldData): BufferGeometry {
  const { columns, rows, heights } = world.heightfield;
  const positions = new Float32Array(columns * rows * 3);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const i = row * columns + col;
      positions[i * 3] = terrain.minX + col * terrain.cellSize;
      positions[i * 3 + 1] = heights[i];
      positions[i * 3 + 2] = terrain.minZ + row * terrain.cellSize;
    }
  }
  const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < columns - 1; col++) {
      const a = row * columns + col;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function bakeGroundMask(world: WorldData): DataTexture {
  const width = WORLD.groundMaskWidth;
  const height = WORLD.groundMaskHeight;
  const data = new Uint8Array(width * height * 4);
  const sizeX = terrain.maxX - terrain.minX;
  const sizeZ = terrain.maxZ - terrain.minZ;
  const fire = WORLD.campfire;
  const settle = WORLD.settlementFlatten;
  for (let v = 0; v < height; v++) {
    const z = terrain.minZ + ((v + 0.5) / height) * sizeZ;
    for (let u = 0; u < width; u++) {
      const x = terrain.minX + ((u + 0.5) / width) * sizeX;
      const i = (v * width + u) * 4;

      const road = world.roads.edgeDistance(x, z);
      data[i] = clamp(((road + ROAD_SDF_RANGE) / (ROAD_SDF_RANGE * 2)) * 255, 0, 255);

      const riverDist = Math.abs(x - riverCenterX(z)) / riverWidthScale(z);
      data[i + 1] = smoothstep(9.5, 5, riverDist) * 255;

      const settleDist = Math.hypot(x - settle.x, (z - settle.z) * 1.7);
      const fireDist = Math.hypot(x - fire.x, z - fire.z);
      let wear = Math.max(smoothstep(21, 7, settleDist) * 0.62, smoothstep(5.5, 1.8, fireDist));
      for (const c of EXPLORATION.clearings) {
        const dist = Math.hypot(x - c.x, z - c.z);
        if (dist < c.radius) wear = Math.max(wear, smoothstep(c.radius, c.radius * 0.35, dist) * c.wear);
      }
      data[i + 2] = wear * 255;

      // Forest floor is in shade, except where the forest opens up beyond the valley.
      const shade = Math.max(
        smoothstep(-8.2, -14, z),
        smoothstep(11, 24, z) * 0.55,
        smoothstep(96, 106, Math.abs(x)),
      );
      const insideValley = z >= strip.minZ && z <= strip.maxZ;
      const clearSky = insideValley ? 0 : smoothstep(3.5, -1, world.open.distance(x, z));
      data[i + 3] = shade * (1 - clearSky) * 255;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function applyGroundShader(material: MeshLambertMaterial, mask: Texture, noise: Texture): void {
  const uniforms = {
    uMask: { value: mask },
    uNoise: { value: noise },
    uTerrainMin: { value: new Vector2(terrain.minX, terrain.minZ) },
    uTerrainSize: { value: new Vector2(terrain.maxX - terrain.minX, terrain.maxZ - terrain.minZ) },
    uRoadRange: { value: ROAD_SDF_RANGE },
    uGrassA: { value: new Color(PALETTE.grassA) },
    uGrassB: { value: new Color(PALETTE.grassB) },
    uGrassC: { value: new Color(PALETTE.grassC) },
    uDirtA: { value: new Color(PALETTE.dirtA) },
    uDirtB: { value: new Color(PALETTE.dirtB) },
    uWorn: { value: new Color(PALETTE.worn) },
    uBank: { value: new Color(PALETTE.bank) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec2 vGroundXZ;
        uniform sampler2D uMask;
        uniform sampler2D uNoise;
        uniform vec2 uTerrainMin;
        uniform vec2 uTerrainSize;
        uniform float uRoadRange;
        uniform vec3 uGrassA, uGrassB, uGrassC, uDirtA, uDirtB, uWorn, uBank;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec4 mask = texture2D(uMask, (vGroundXZ - uTerrainMin) / uTerrainSize);
        vec4 nA = texture2D(uNoise, vGroundXZ * 0.021);
        vec4 nB = texture2D(uNoise, vGroundXZ * 0.097);
        vec4 nC = texture2D(uNoise, vGroundXZ * 0.41);

        vec3 ground = mix(uGrassA, uGrassB, smoothstep(0.36, 0.62, nA.r * 0.6 + nB.g * 0.4));
        ground = mix(ground, uGrassC, smoothstep(0.54, 0.72, nA.g * 0.5 + nB.b * 0.5) * 0.75);
        ground *= 0.9 + 0.2 * nC.r;

        float wear = smoothstep(0.32, 0.72, mask.b + (nB.g - 0.5) * 0.55);
        ground = mix(ground, uWorn * (0.92 + 0.16 * nC.g), wear);

        float roadSd = (mask.r * 2.0 - 1.0) * uRoadRange + (nB.r - 0.5) * 0.85 + (nC.g - 0.5) * 0.28;
        ground *= mix(0.84, 1.0, smoothstep(-0.05, 1.0, roadSd));
        vec3 dirt = mix(uDirtA, uDirtB, smoothstep(0.34, 0.66, nB.a * 0.55 + nC.r * 0.45));
        dirt *= 0.92 + 0.16 * nC.b;
        ground = mix(ground, dirt, smoothstep(0.1, -0.1, roadSd));

        float bank = smoothstep(0.25, 0.72, mask.g + (nB.b - 0.5) * 0.3);
        ground = mix(ground, uBank * (0.88 + 0.24 * nC.r), bank);

        ground *= 1.0 - mask.a * 0.38;
        diffuseColor.rgb = ground;`,
      );
  };
  material.customProgramCacheKey = () => 'ground-shader-v1';
}
