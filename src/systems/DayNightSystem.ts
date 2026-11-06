import { Color, Vector3 } from 'three';
import { ATMOSPHERE } from '../config';
import { clamp, lerp, smoothstep, TAU } from '../core/math';
import { advanceClock, type TimeState } from '../core/GameState';

/** Everything the visual layer needs to know about the current time of day. Mutated in place. */
export interface AtmosphereSample {
  skyTop: Color;
  horizon: Color;
  fog: Color;
  light: Color;
  hemiSky: Color;
  hemiGround: Color;
  silhouette: Color;
  clouds: Color;
  lightIntensity: number;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  /** 0 = full day, 1 = full night. */
  night: number;
  shadowStrength: number;
  /** Unit vector pointing from the ground to the main light. */
  lightDirection: Vector3;
  sunNdcX: number;
  sunNdcY: number;
  sunColor: Color;
  sunVisibility: number;
  moonNdcX: number;
  moonNdcY: number;
  moonVisibility: number;
  starVisibility: number;
}

type ColorKey = 'skyTop' | 'horizon' | 'fog' | 'light' | 'hemiSky' | 'hemiGround' | 'silhouette' | 'clouds';
const COLOR_KEYS: readonly ColorKey[] = ['skyTop', 'horizon', 'fog', 'light', 'hemiSky', 'hemiGround', 'silhouette', 'clouds'];

/** Advances the clock (fixed step) and samples the keyframed atmosphere on request. */
export class DayNightSystem {
  private readonly keys = ATMOSPHERE.keyframes;
  /** Colors decoded once per keyframe, so sampling never allocates. */
  private readonly keyColors: Record<ColorKey, Color>[] = ATMOSPHERE.keyframes.map((k) => ({
    skyTop: new Color(k.skyTop),
    horizon: new Color(k.horizon),
    fog: new Color(k.fog),
    light: new Color(k.light),
    hemiSky: new Color(k.hemiSky),
    hemiGround: new Color(k.hemiGround),
    silhouette: new Color(k.silhouette),
    clouds: new Color(k.clouds),
  }));

  readonly sample: AtmosphereSample = {
    skyTop: new Color(),
    horizon: new Color(),
    fog: new Color(),
    light: new Color(),
    hemiSky: new Color(),
    hemiGround: new Color(),
    silhouette: new Color(),
    clouds: new Color(),
    lightIntensity: 0,
    hemiIntensity: 0,
    fogNear: 0,
    fogFar: 0,
    night: 0,
    shadowStrength: 0,
    lightDirection: new Vector3(0, 1, 0),
    sunNdcX: 0,
    sunNdcY: 0,
    sunColor: new Color(),
    sunVisibility: 0,
    moonNdcX: 0,
    moonNdcY: 0,
    moonVisibility: 0,
    starVisibility: 0,
  };

  update(time: TimeState, dt: number): void {
    if (time.paused) return;
    advanceClock(time, dt / ATMOSPHERE.dayLengthSeconds);
  }

  /** Refreshes `sample` for the given time. Call once per rendered frame. */
  evaluate(dayTime: number): AtmosphereSample {
    const t = ((dayTime % 1) + 1) % 1;
    const keys = this.keys;
    const count = keys.length;

    let index = count - 1;
    for (let i = 0; i < count; i++) {
      if (keys[i].t <= t) index = i;
      else break;
    }
    const nextIndex = (index + 1) % count;
    const from = keys[index];
    const to = keys[nextIndex];
    const span = nextIndex === 0 ? 1 - from.t + to.t : to.t - from.t;
    const blend = clamp((t - from.t) / span, 0, 1);

    const s = this.sample;
    const fromColors = this.keyColors[index];
    const toColors = this.keyColors[nextIndex];
    for (let i = 0; i < COLOR_KEYS.length; i++) {
      const key = COLOR_KEYS[i];
      s[key].lerpColors(fromColors[key], toColors[key], blend);
    }
    s.lightIntensity = lerp(from.lightI, to.lightI, blend);
    s.hemiIntensity = lerp(from.hemiI, to.hemiI, blend);
    s.fogNear = lerp(from.fogNear, to.fogNear, blend);
    s.fogFar = lerp(from.fogFar, to.fogFar, blend);
    s.night = lerp(from.night, to.night, blend);
    s.shadowStrength = lerp(from.shadow, to.shadow, blend);

    // Sun path: rises at +X (screen right), peaks at noon, sets at -X (screen left).
    const sunAngle = (t - 0.25) * TAU;
    const sunX = Math.cos(sunAngle);
    const sunY = Math.sin(sunAngle);
    s.sunNdcX = sunX * ATMOSPHERE.sunArcX;
    s.sunNdcY = ATMOSPHERE.horizonNdc + sunY * ATMOSPHERE.sunArcY;
    s.sunVisibility = smoothstep(-0.16, -0.02, sunY);
    s.sunColor.copy(s.light).lerp(s.horizon, 0.15);

    // Moon path over the night span.
    const nightLength = 1 - ATMOSPHERE.moonriseTime + ATMOSPHERE.moonsetTime;
    const nightT = (((t - ATMOSPHERE.moonriseTime) % 1) + 1) % 1;
    const isMoonLit = nightT < nightLength;
    const moonAngle = (nightT / nightLength) * Math.PI;
    const moonX = Math.cos(moonAngle);
    const moonY = Math.sin(moonAngle);
    s.moonNdcX = moonX * ATMOSPHERE.sunArcX;
    s.moonNdcY = ATMOSPHERE.horizonNdc + moonY * 0.42;
    s.moonVisibility = isMoonLit ? smoothstep(0, 0.12, moonY) * smoothstep(0.55, 0.95, s.night) : 0;
    s.starVisibility = smoothstep(0.55, 1, s.night);

    // The shadow light swaps between sun and moon only at keys where its intensity is
    // zero, so the shadow direction never visibly jumps. Light keeps a slight +Z bias
    // (from the camera side) so building fronts stay readable at low sun angles.
    if (isMoonLit) {
      s.lightDirection.set(moonX * 0.72, 0.6 + 0.3 * moonY, 0.48).normalize();
    } else {
      const elevation = Math.max(sunY, 0) * 0.85 + ATMOSPHERE.minLightElevation;
      s.lightDirection.set(sunX * 0.92, elevation, 0.38).normalize();
    }
    return s;
  }
}
