import type { Texture } from 'three';
import { NPC, type CharacterPalette } from '../config';
import type { NpcState } from './Npc';
import { ActorView } from './ActorView';
import type { CharacterPose, CharacterTool } from './CharacterVisual';
import { PlaceholderCharacter } from './PlaceholderCharacter';

function poseOf(npc: NpcState): CharacterPose {
  if (npc.attentionTimer > 0) return 'none';
  if (npc.task === 'sit') return 'sit';
  if (npc.task === 'build') return 'build';
  if (npc.task === 'chop') return npc.job === 'woodcutter' ? 'chop' : 'gather';
  return 'none';
}

function toolOf(npc: NpcState): CharacterTool {
  if (npc.assignedSite >= 0) return 'hammer';
  return npc.job === 'woodcutter' ? 'axe' : 'none';
}

/** Draws one villager from its state. The simulation never touches this. */
export class NpcView {
  private readonly actor: ActorView;

  get x(): number {
    return this.npc.x;
  }

  get z(): number {
    return this.npc.z;
  }

  constructor(private readonly npc: NpcState, palette: CharacterPalette, blobTexture: Texture) {
    this.actor = new ActorView(new PlaceholderCharacter({ palette }), blobTexture, NPC.fullGaitSpeed);
  }

  dispose(): void {
    this.actor.dispose();
  }

  get object(): ActorView['group'] {
    return this.actor.group;
  }

  /** Whether the villager needs drawing at all. Off-screen and indoor villagers cost nothing here. */
  sync(alpha: number, frameDt: number, time: number, nearView: boolean): void {
    const { npc, actor } = this;
    const visible = nearView && !npc.indoors && !npc.dormant;
    actor.group.visible = visible;
    if (!visible) return;
    actor.setAction(poseOf(npc), npc.carrying, toolOf(npc));
    actor.sync(npc, alpha, frameDt, time);
  }
}
