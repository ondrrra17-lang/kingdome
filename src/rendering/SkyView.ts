import { BufferGeometry, Color, Float32BufferAttribute, Mesh, ShaderMaterial, Uniform, type Texture, Vector2 } from 'three';
import { ATMOSPHERE } from '../config';
import type { AtmosphereSample } from '../systems/DayNightSystem';

const VERTEX = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uClouds;
uniform vec2 uSunPos;
uniform vec2 uMoonPos;
uniform float uSunVis;
uniform float uMoonVis;
uniform float uStars;
uniform float uAspect;
uniform float uHorizonY;
uniform float uTime;
uniform float uScroll;
uniform sampler2D uNoise;
varying vec2 vNdc;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 aspect = vec2(uAspect, 1.0);
  float h = clamp((vNdc.y - uHorizonY) / (1.0 - uHorizonY), 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.72));

  if (uStars > 0.001) {
    vec2 g = vNdc * aspect * 26.0;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float r = hash(id);
    vec2 offset = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.7;
    float size = 0.03 + 0.05 * fract(r * 13.0);
    float star = step(0.84, r) * smoothstep(size, 0.0, length(f - offset));
    star *= 0.6 + 0.4 * sin(uTime * (1.0 + r * 2.0) + r * 40.0);
    col += vec3(0.85, 0.9, 1.0) * star * uStars * smoothstep(-0.2, 0.5, h);
  }

  if (uMoonVis > 0.001) {
    float d = length((vNdc - uMoonPos) * aspect);
    col += vec3(0.5, 0.6, 0.85) * exp(-d * 6.0) * 0.28 * uMoonVis;
    col = mix(col, vec3(0.86, 0.88, 0.8), smoothstep(0.062, 0.057, d) * uMoonVis);
  }

  if (uSunVis > 0.001) {
    float d = length((vNdc - uSunPos) * aspect);
    col += uSunColor * (exp(-d * 2.6) * 0.42 + exp(-d * 10.0) * 0.5) * uSunVis;
    col = mix(col, uSunColor * 1.15 + vec3(0.25, 0.2, 0.1), smoothstep(0.086, 0.079, d) * uSunVis);
  }

  // Thin stretched cloud bands, drifting slowly and sliding a little with the camera.
  vec2 cloudUv = vec2(vNdc.x * uAspect * 0.11 + uTime * 0.0016 + uScroll, vNdc.y * 0.42);
  float c = texture2D(uNoise, cloudUv).r * 0.65 + texture2D(uNoise, cloudUv * 2.7 + 0.31).g * 0.35;
  float cloud = smoothstep(0.52, 0.68, c) * smoothstep(0.0, 0.25, h) * (1.0 - smoothstep(0.75, 1.0, h));
  col = mix(col, uClouds, cloud * 0.62);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  // A touch of dither hides 8-bit banding in the long gradient.
  gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
}`;

/** The sky is one full-screen triangle drawn first: cheap, and independent of the orthographic projection. */
export class SkyView {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(noise: Texture) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTop: new Uniform(new Color()),
        uHorizon: new Uniform(new Color()),
        uSunColor: new Uniform(new Color()),
        uClouds: new Uniform(new Color()),
        uSunPos: new Uniform(new Vector2()),
        uMoonPos: new Uniform(new Vector2()),
        uSunVis: new Uniform(0),
        uMoonVis: new Uniform(0),
        uStars: new Uniform(0),
        uAspect: new Uniform(1),
        uHorizonY: new Uniform(ATMOSPHERE.horizonNdc),
        uTime: new Uniform(0),
        uScroll: new Uniform(0),
        uNoise: new Uniform(noise),
      },
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  setAspect(aspect: number): void {
    this.material.uniforms.uAspect.value = aspect;
  }

  update(sample: AtmosphereSample, time: number, cameraX: number): void {
    const u = this.material.uniforms;
    (u.uTop.value as Color).copy(sample.skyTop);
    (u.uHorizon.value as Color).copy(sample.horizon);
    (u.uSunColor.value as Color).copy(sample.sunColor);
    (u.uClouds.value as Color).copy(sample.clouds);
    (u.uSunPos.value as Vector2).set(sample.sunNdcX, sample.sunNdcY);
    (u.uMoonPos.value as Vector2).set(sample.moonNdcX, sample.moonNdcY);
    u.uSunVis.value = sample.sunVisibility;
    u.uMoonVis.value = sample.moonVisibility;
    u.uStars.value = sample.starVisibility;
    u.uTime.value = time;
    u.uScroll.value = cameraX * 0.0006;
  }
}
