import { BufferGeometry, Color, Float32BufferAttribute, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, type Texture } from 'three';
import { PALETTE, WORLD } from '../config';
import { clamp } from '../core/math';
import type { AtmosphereSample } from '../systems/DayNightSystem';
import { riverCenterX } from './Paths';

const VERTEX = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vAcross;
varying vec2 vWorldXZ;
void main() {
  vAcross = uv;
  vWorldXZ = position.xz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uNoise;
uniform vec3 uDeep, uShallow, uFoam, uSky;
uniform float uTime, uLight, uBridgeZ, uBridgeHalf;
varying vec2 vAcross;
varying vec2 vWorldXZ;
void main() {
  float edge = abs(vAcross.x * 2.0 - 1.0);
  // Stretched along the flow (Z) so highlights read as current rather than blotches.
  vec2 flowUv = vec2(vWorldXZ.x * 0.11, vWorldXZ.y * 0.012 - uTime * 0.03);
  vec4 a = texture2D(uNoise, flowUv);
  vec4 b = texture2D(uNoise, flowUv * vec2(2.3, 1.7) + vec2(0.3, -uTime * 0.05));

  vec3 col = mix(uDeep, uShallow, smoothstep(0.32, 0.86, edge + (a.g - 0.5) * 0.3));
  col = mix(col, uSky, 0.16 + 0.14 * a.r);

  // Long streaks along the flow and a broken foam line at the banks.
  float streak = smoothstep(0.56, 0.74, a.b * 0.5 + b.r * 0.5);
  col = mix(col, uFoam, streak * 0.07 * (0.5 + edge));
  float foamLine = smoothstep(0.73, 0.8, edge + (b.g - 0.5) * 0.09) * (1.0 - smoothstep(0.84, 0.9, edge));
  col = mix(col, uFoam, foamLine * 0.22);

  col *= uLight;

  // Fake shadow beneath the deck: the water shader does not receive shadow maps.
  float under = 1.0 - smoothstep(uBridgeHalf - 0.1, uBridgeHalf + 0.9, abs(vWorldXZ.y - uBridgeZ));
  col *= 1.0 - 0.34 * under;

  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const STEP = 2;

/** Water ribbon following the river centreline. Flow is animated entirely in the fragment shader. */
export class RiverView {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly rows: number;
  private firstRow = -1;
  private endRow = -1;

  constructor(noise: Texture) {
    const { minZ, maxZ } = WORLD.terrain;
    const { waterHalfWidth, waterHeight } = WORLD.river;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let rows = 0;
    for (let z = minZ; z <= maxZ; z += STEP) {
      const center = riverCenterX(z);
      positions.push(center - waterHalfWidth, waterHeight, z, center + waterHalfWidth, waterHeight, z);
      uvs.push(0, z, 1, z);
      if (rows > 0) {
        const a = (rows - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      rows++;
    }
    this.rows = rows;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uDeep: { value: new Color(PALETTE.waterDeep) },
          uShallow: { value: new Color(PALETTE.waterShallow) },
          uFoam: { value: new Color(PALETTE.foam) },
          uSky: { value: new Color() },
          uTime: { value: 0 },
          uLight: { value: 1 },
          uBridgeZ: { value: WORLD.bridge.z },
          uBridgeHalf: { value: WORLD.bridge.halfWidth },
        },
      ]),
    });
    // UniformsUtils.merge clones its input, so the shared texture is attached afterward.
    this.material.uniforms.uNoise = { value: noise };
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.matrixAutoUpdate = false;
  }

  /** The water must end where the terrain does, or it would hang over nothing. */
  setVisibleRange(northZ: number, southZ: number): void {
    const lastRow = this.rows - 1;
    const first = clamp(Math.ceil((northZ - WORLD.terrain.minZ) / STEP), 0, lastRow);
    const end = clamp(Math.ceil((southZ - WORLD.terrain.minZ) / STEP), first, lastRow);
    if (first === this.firstRow && end === this.endRow) return;
    this.firstRow = first;
    this.endRow = end;
    this.mesh.geometry.setDrawRange(first * 6, (end - first) * 6);
  }

  update(sample: AtmosphereSample, time: number): void {
    const u = this.material.uniforms;
    (u.uSky.value as Color).copy(sample.skyTop).lerp(sample.horizon, 0.6);
    u.uTime.value = time;
    u.uLight.value = 0.22 + (sample.lightIntensity * 0.2 + sample.hemiIntensity * 0.26) * (1 - sample.night * 0.45);
  }
}
