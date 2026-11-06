import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, Uniform, type Vector3 } from 'three';
import { EFFECTS } from '../config';
import { createRng, lerp } from '../core/math';
import type { AtmosphereSample } from '../systems/DayNightSystem';

const VERTEX = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uFocusX;
uniform float uFocusZ;
uniform float uBoxX;
uniform float uBoxZ;
uniform float uCenterZ;
uniform float uSize;
uniform float uPixelRatio;
varying float vBlink;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.31 + aPhase * 6.28) * 1.2;
  p.z += cos(uTime * 0.23 + aPhase * 9.4) * 0.9;
  p.y += sin(uTime * 0.5 + aPhase * 12.6) * 0.32;
  // Wrap around the camera: a small pool of points fills the whole valley.
  p.x = mod(p.x - uFocusX + uBoxX * 0.5, uBoxX) - uBoxX * 0.5 + uFocusX;
  float centerZ = uFocusZ + uCenterZ;
  p.z = mod(p.z - centerZ + uBoxZ * 0.5, uBoxZ) - uBoxZ * 0.5 + centerZ;
  vBlink = 0.45 + 0.55 * sin(uTime * (0.8 + aPhase) + aPhase * 30.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * uPixelRatio;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vBlink;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * max(vBlink, 0.0) * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

const dayColor = new Color(0xffe4a8);
const nightColor = new Color(0xc8f06a);

/**
 * Restrained ambient life: a sparse drift of motes that catch the light by day and
 * read as fireflies after dark. Motion is GPU-only, so nothing updates per frame
 * on the CPU beyond a few uniforms.
 */
export class AmbientEffects {
  readonly points: Points;
  private readonly material: ShaderMaterial;

  constructor(pixelRatio: number) {
    const rng = createRng(4242);
    const box = EFFECTS.moteBox;
    const positions: number[] = [];
    const phases: number[] = [];
    for (let i = 0; i < EFFECTS.moteCount; i++) {
      positions.push(rng() * box.x, 0.5 + rng() * box.y, box.centerZ + (rng() - 0.5) * box.z);
      phases.push(rng());
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: new Uniform(0),
        uFocusX: new Uniform(0),
        uFocusZ: new Uniform(0),
        uBoxX: new Uniform(box.x),
        uBoxZ: new Uniform(box.z),
        uCenterZ: new Uniform(box.centerZ),
        uSize: new Uniform(5),
        uPixelRatio: new Uniform(pixelRatio),
        uColor: new Uniform(new Color()),
        uOpacity: new Uniform(0),
      },
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  setPixelRatio(pixelRatio: number): void {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  update(sample: AtmosphereSample, time: number, focus: Vector3): void {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uFocusX.value = focus.x;
    u.uFocusZ.value = focus.z;
    u.uSize.value = lerp(4, 6.5, sample.night);
    u.uOpacity.value = lerp(0.22, 0.95, sample.night);
    (u.uColor.value as Color).lerpColors(dayColor, nightColor, sample.night);
  }
}
