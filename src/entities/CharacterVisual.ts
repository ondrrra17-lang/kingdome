import type { Object3D } from 'three';

/** What the character is doing with their body, beyond walking. */
export type CharacterPose = 'none' | 'chop' | 'gather' | 'build' | 'sit' | 'farm' | 'hunt';

export type CharacterTool = 'none' | 'axe' | 'hammer' | 'hoe' | 'bow';

/** Per-frame motion handed to a character's visual. */
export interface CharacterMotion {
  /** Walk-cycle position in strides (interpolated). */
  stride: number;
  /** 0 when still, 1 at walking speed, above 1 when sprinting. */
  speedRatio: number;
  /** Rate of speed change, positive when accelerating. */
  acceleration: number;
  /** Rate of turn in radians/s. */
  turnRate: number;
  frameDt: number;
  time: number;
  pose: CharacterPose;
  /** Shows the carried load. */
  carrying: boolean;
  produceLoad?: boolean;
  /** Which work tool to show in hand. */
  tool: CharacterTool;
}

/**
 * What ActorView needs from a character. A GLB-based implementation would load
 * a model and drive an AnimationMixer from the same motion data. Nothing outside
 * this interface depends on how the character is built.
 */
export interface CharacterVisual {
  /** Frees what scene disposal cannot see, such as a skeleton's bone texture. */
  dispose?(): void;
  readonly object: Object3D;
  update(motion: CharacterMotion): void;
}
