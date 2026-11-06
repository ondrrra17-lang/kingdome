import { BufferGeometry, Color, Float32BufferAttribute, Group, MathUtils, Mesh, ShaderMaterial, Uniform, type Vector3 } from 'three';
import { CAMERA, DISTANT } from '../config';
import { createRng, fbm, lerp } from '../core/math';
import type { AtmosphereSample } from '../systems/DayNightSystem';

const VERTEX = /* glsl */ `
attribute float aMist;
attribute float aShade;
attribute float aSnow;
uniform float uDepth;
varying float vMist;
varying float vShade;
varying float vSnow;
void main() {
  vMist = aMist;
  vShade = aShade;
  vSnow = aSnow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Placed by hand at the back of the depth range, so the camera's far plane never clips a layer.
  gl_Position.z = uDepth * gl_Position.w;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor, uFog, uSnow;
uniform float uFacet, uMist, uSnowAmount;
varying float vMist;
varying float vShade;
varying float vSnow;
void main() {
  vec3 c = uColor * (1.0 + vShade * uFacet);
  c = mix(c, uSnow, smoothstep(0.45, 1.0, vSnow) * uSnowAmount);
  c = mix(c, uFog, smoothstep(0.0, 1.0, vMist) * uMist);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

type LayerConfig = (typeof DISTANT.layers)[number];

interface Layer {
  config: LayerConfig;
  mesh: Mesh;
  material: ShaderMaterial;
}

/**
 * Silhouette layers beyond the terrain. Orthographic cameras have no natural
 * parallax, so each layer follows the camera by `parallax` of its motion to fake
 * depth. Heights are authored in screen space (NDC) and converted to world Y, so
 * the composition holds regardless of a layer's Z.
 */
export class DistantScenery {
  readonly group = new Group();
  private readonly layers: Layer[] = [];

  constructor() {
    DISTANT.layers.forEach((config, order) => {
      const material = new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uColor: new Uniform(new Color()),
          uFog: new Uniform(new Color()),
          uSnow: new Uniform(new Color()),
          uFacet: new Uniform(config.facet),
          uMist: new Uniform(config.mist),
          uSnowAmount: new Uniform(config.snow),
          // The first layer is the furthest away.
          uDepth: new Uniform(0.9998 - order * 0.0001),
        },
      });
      const mesh = new Mesh(buildLayerGeometry(config), material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.layers.push({ config, mesh, material });
    });
  }

  update(sample: AtmosphereSample, focus: Vector3): void {
    for (let i = 0; i < this.layers.length; i++) {
      const { config, mesh, material } = this.layers[i];
      mesh.position.set(focus.x * config.parallax, focus.y, focus.z);
      const u = material.uniforms;
      (u.uColor.value as Color).copy(sample.silhouette).lerp(sample.fog, config.haze);
      (u.uFog.value as Color).copy(sample.fog);
      (u.uSnow.value as Color).copy(sample.horizon).lerp(sample.clouds, 0.7);
    }
  }
}

/** Converts a screen-space height at a given depth into local Y, relative to the camera focus. */
function worldYForNdc(ndc: number, z: number): number {
  const elevation = MathUtils.degToRad(CAMERA.elevationDeg);
  const anchorOffset = (0.5 - CAMERA.anchorScreenY) * CAMERA.viewHeight;
  const screenUp = (ndc * CAMERA.viewHeight) / 2 + anchorOffset;
  return (screenUp + z * Math.sin(elevation)) / Math.cos(elevation);
}

function buildLayerGeometry(config: LayerConfig): BufferGeometry {
  const rng = createRng(config.seed * 991);
  const half = DISTANT.halfWidth;
  const z = config.z;
  const baseY = worldYForNdc(DISTANT.bottomNdc, z);
  const snowLine = config.baseNdc + config.amplitude * 0.5;

  const positions: number[] = [];
  const mists: number[] = [];
  const shades: number[] = [];
  const snows: number[] = [];
  // Mist is linear in height: interpolation across long triangles then stays seamless.
  const mistTopY = worldYForNdc(config.baseNdc + config.amplitude, z);
  const emitVertex = (x: number, y: number, snow: number, shade: number): void => {
    positions.push(x, y, z);
    mists.push(Math.max(0, 1 - (y - baseY) / (mistTopY - baseY)));
    snows.push(snow);
    shades.push(shade);
  };

  // Each column has a peak, a jittered shoulder and a base. Faces climbing to the
  // right catch the light and faces falling away go dark, for a faceted mountain read.
  const topNdcAt = (x: number): number => {
    const n = fbm((x + 400) * config.frequency, config.seed * 3.1, 3, config.seed);
    const t = Math.min(Math.max((n - 0.32) / 0.36, 0), 1);
    return config.baseNdc + t * t * config.amplitude + (rng() - 0.5) * 2 * config.teeth;
  };
  const snowAt = (ndc: number): number => Math.max(0, (ndc - snowLine) / Math.max(config.amplitude * 0.4, 0.001));

  let prevX = -half;
  let prevNdc = topNdcAt(prevX);
  let prevY = worldYForNdc(prevNdc, z);
  let prevShoulderX = prevX;
  let prevShoulderY = lerp(baseY, prevY, 0.6);
  for (let x = -half + config.step; x <= half + config.step; x += config.step) {
    const ndc = topNdcAt(x);
    const y = worldYForNdc(ndc, z);
    const shoulderX = x + (rng() - 0.5) * config.step * 0.8;
    const shoulderY = lerp(baseY, y, 0.5 + rng() * 0.25);
    const slope = Math.max(-1, Math.min(1, (y - prevY) / Math.max(config.step * 0.35, 0.01)));
    const faceA = slope + (rng() - 0.5) * 0.3;
    const faceB = slope * 0.45 + (rng() - 0.5) * 0.4;

    emitVertex(prevX, prevY, snowAt(prevNdc), faceA);
    emitVertex(prevShoulderX, prevShoulderY, 0, faceA);
    emitVertex(x, y, snowAt(ndc), faceA);

    emitVertex(x, y, snowAt(ndc), faceB);
    emitVertex(prevShoulderX, prevShoulderY, 0, faceB);
    emitVertex(shoulderX, shoulderY, 0, faceB);

    emitVertex(prevShoulderX, prevShoulderY, 0, 0);
    emitVertex(prevShoulderX, baseY, 0, 0);
    emitVertex(shoulderX, shoulderY, 0, 0);

    emitVertex(shoulderX, shoulderY, 0, 0);
    emitVertex(prevShoulderX, baseY, 0, 0);
    emitVertex(shoulderX, baseY, 0, 0);

    prevX = x;
    prevNdc = ndc;
    prevY = y;
    prevShoulderX = shoulderX;
    prevShoulderY = shoulderY;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aMist', new Float32BufferAttribute(mists, 1));
  geometry.setAttribute('aShade', new Float32BufferAttribute(shades, 1));
  geometry.setAttribute('aSnow', new Float32BufferAttribute(snows, 1));
  return geometry;
}
