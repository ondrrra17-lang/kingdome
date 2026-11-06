import { DirectionalLight, Fog, HemisphereLight, type Scene, Vector3 } from 'three';
import { CAMERA, RENDER } from '../config';
import type { AtmosphereSample } from '../systems/DayNightSystem';

const SHADOW_CENTER_Z_OFFSET = -6;

const right = new Vector3();
const up = new Vector3();
const center = new Vector3();

/** Applies an atmosphere sample to the scene's lights and fog. One directional light casts all shadows. */
export class AtmosphereView {
  readonly mainLight: DirectionalLight;
  private readonly hemisphere: HemisphereLight;
  private readonly fog: Fog;
  private shadowTexelSize = 0.04;

  constructor(scene: Scene) {
    this.fog = new Fog(0xffffff, 1, 2);
    scene.fog = this.fog;

    this.hemisphere = new HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemisphere);

    this.mainLight = new DirectionalLight(0xffffff, 1);
    const shadow = this.mainLight.shadow;
    this.mainLight.castShadow = true;
    shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
    shadow.bias = RENDER.shadowBias;
    shadow.normalBias = RENDER.shadowNormalBias;
    shadow.camera.near = 1;
    shadow.camera.far = RENDER.shadowDepthRange;
    scene.add(this.mainLight, this.mainLight.target);
  }

  /** Shadow frustum covers the visible width; the light can rotate, so width and height are equal. */
  setCoverage(halfViewWidth: number): void {
    const radius = Math.max(halfViewWidth + RENDER.shadowMargin, CAMERA.viewHeight * 1.6);
    const camera = this.mainLight.shadow.camera;
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.updateProjectionMatrix();
    this.shadowTexelSize = (radius * 2) / RENDER.shadowMapSize;
  }

  update(sample: AtmosphereSample, focus: Vector3): void {
    this.fog.color.copy(sample.fog);
    this.fog.near = CAMERA.distance + sample.fogNear;
    this.fog.far = CAMERA.distance + sample.fogFar;

    this.hemisphere.color.copy(sample.hemiSky);
    this.hemisphere.groundColor.copy(sample.hemiGround);
    this.hemisphere.intensity = sample.hemiIntensity;

    const light = this.mainLight;
    light.color.copy(sample.light);
    light.intensity = sample.lightIntensity;
    light.shadow.intensity = sample.shadowStrength;

    // Snap the shadow frustum to whole texels so shadow edges stay stable while the camera moves.
    const dir = sample.lightDirection;
    right.set(dir.z, 0, -dir.x).normalize();
    up.crossVectors(dir, right);
    center.set(focus.x, 0, focus.z + SHADOW_CENTER_Z_OFFSET);
    const texel = this.shadowTexelSize;
    const u = center.dot(right);
    const v = center.dot(up);
    center.addScaledVector(right, Math.round(u / texel) * texel - u);
    center.addScaledVector(up, Math.round(v / texel) * texel - v);

    light.target.position.copy(center);
    light.position.copy(center).addScaledVector(dir, RENDER.shadowLightDistance);
  }
}
