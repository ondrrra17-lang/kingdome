import { AdditiveBlending, BufferGeometry, Color, ConeGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PointLight, Points, ShaderMaterial, Sprite, SpriteMaterial, Uniform, type Texture } from 'three';
import { EFFECTS, WORLD } from '../config';
import { createRng, lerp } from '../core/math';
import type { AtmosphereSample } from '../systems/DayNightSystem';
import { buildCampfireBase, buildFireSeats } from './placeholders/props';

const EMBER_VERTEX = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
varying float vLife;
void main() {
  float life = fract(uTime * (0.22 + aPhase * 0.2) + aPhase * 7.0);
  vLife = life;
  vec3 p = position * (0.4 + life * 1.4);
  p.y = life * 3.6;
  p.x += sin(uTime * 1.7 + aPhase * 20.0) * 0.2 * life;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (3.2 - life * 1.6) * uPixelRatio;
}`;

const EMBER_FRAGMENT = /* glsl */ `
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d) * (1.0 - vLife) * 1.3;
  gl_FragColor = vec4(vec3(1.0, 0.56, 0.2), a);
  #include <colorspace_fragment>
}`;

interface Flame {
  mesh: Mesh;
  phase: number;
}

/** Campfire visual: base geometry, animated flames, glow, embers and a shadowless point light. */
export class CampfireView {
  readonly group = new Group();
  private readonly flames: Flame[] = [];
  private readonly light: PointLight;
  private readonly glow: Sprite;
  private readonly glowMaterial: SpriteMaterial;
  private readonly emberMaterial: ShaderMaterial;

  constructor(groundY: number, glowTexture: Texture, solidMaterial: MeshLambertMaterial, pixelRatio: number) {
    const { x, z } = WORLD.campfire;
    this.group.position.set(x, groundY, z);

    const base = new Mesh(buildCampfireBase(31), solidMaterial);
    const seats = new Mesh(buildFireSeats(32), solidMaterial);
    base.castShadow = seats.castShadow = true;
    base.receiveShadow = seats.receiveShadow = true;
    this.group.add(base, seats);

    const flameColors = [0xff5a1e, 0xff9a2e, 0xffd76a];
    const flameSizes = [[0.48, 1.4], [0.33, 1.0], [0.18, 0.62]];
    for (let i = 0; i < flameColors.length; i++) {
      const [radius, height] = flameSizes[i];
      const geometry = new ConeGeometry(radius, height, 7, 1, true);
      geometry.translate(0, height / 2, 0);
      const material = new MeshBasicMaterial({
        color: flameColors[i],
        transparent: true,
        opacity: 0.86,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.position.y = 0.16;
      this.group.add(mesh);
      this.flames.push({ mesh, phase: i * 2.1 });
    }

    this.glowMaterial = new SpriteMaterial({
      map: glowTexture,
      color: new Color(0xff8a3a),
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.glow = new Sprite(this.glowMaterial);
    this.glow.position.y = 0.9;
    this.group.add(this.glow);

    const fire = EFFECTS.fireLight;
    this.light = new PointLight(fire.color, fire.intensityDay, fire.distance, fire.decay);
    this.light.position.y = fire.height;
    this.light.castShadow = false;
    this.group.add(this.light);

    const rng = createRng(777);
    const positions: number[] = [];
    const phases: number[] = [];
    for (let i = 0; i < EFFECTS.emberCount; i++) {
      positions.push((rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 0.8);
      phases.push(rng());
    }
    const emberGeometry = new BufferGeometry();
    emberGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    emberGeometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));
    emberGeometry.computeBoundingSphere();
    this.emberMaterial = new ShaderMaterial({
      vertexShader: EMBER_VERTEX,
      fragmentShader: EMBER_FRAGMENT,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      uniforms: { uTime: new Uniform(0), uPixelRatio: new Uniform(pixelRatio) },
    });
    const embers = new Points(emberGeometry, this.emberMaterial);
    embers.frustumCulled = false;
    this.group.add(embers);
  }

  setPixelRatio(pixelRatio: number): void {
    this.emberMaterial.uniforms.uPixelRatio.value = pixelRatio;
  }

  update(sample: AtmosphereSample, time: number): void {
    const flicker = 0.84 + 0.1 * Math.sin(time * 9.3) + 0.06 * Math.sin(time * 17.7 + 1.3) + 0.05 * Math.sin(time * 4.1 + 0.4);

    for (let i = 0; i < this.flames.length; i++) {
      const flame = this.flames[i];
      const wobble = Math.sin(time * (7.5 + i * 2.2) + flame.phase);
      const stretch = 1 + 0.16 * wobble + 0.06 * Math.sin(time * 15.5 + flame.phase);
      flame.mesh.scale.set(1 - 0.08 * wobble, stretch, 1 - 0.06 * wobble);
      flame.mesh.rotation.y = time * (0.5 + i * 0.4);
      flame.mesh.position.x = Math.sin(time * 5.1 + flame.phase) * 0.03;
    }

    const fire = EFFECTS.fireLight;
    this.light.intensity = lerp(fire.intensityDay, fire.intensityNight, sample.night) * flicker;
    this.glowMaterial.opacity = lerp(0.13, 0.62, sample.night) * flicker;
    const glowSize = lerp(3.6, 8.5, sample.night) * (0.96 + flicker * 0.05);
    this.glow.scale.set(glowSize, glowSize, 1);

    this.emberMaterial.uniforms.uTime.value = time;
  }
}
