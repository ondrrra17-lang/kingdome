import { expect, test as base, type Page } from '@playwright/test';

declare global {
  interface Window {
    /**
     * The running game, exposed in debug builds. Loosely typed on purpose: tests reach
     * private fields such as the camera rig, and they run in the page, not against its types.
     */
    __game: any;
  }
}

export interface HudText {
  coins: number;
  wood: string;
  people: number;
  day: string;
  prompt: string;
  blocked: boolean;
  feedback: string;
  notice: string;
}

export interface NpcSnapshot {
  id: string;
  job: string;
  phase: string;
  state: string;
  task: string;
  x: number;
  z: number;
  indoors: boolean;
  dormant: boolean;
  assignedSite: number;
}

/** What the tests do to the game: real keys for playing, direct state access to set up a scene. */
export class GameDriver {
  constructor(readonly page: Page) {}

  /** Scene setup for regressions taking place after the opening bridge objective. */
  async openBridge(): Promise<void> {
    await this.page.evaluate(() => {
      const site = window.__game.state.construction.find((s: { id: string }) => s.id === 'bridge');
      site.status = 'completed'; site.progress = 1; site.workerId = null;
    });
    await this.page.waitForTimeout(100);
  }

  /** Puts the player somewhere without walking there. */
  async teleport(x: number, z: number): Promise<void> {
    await this.page.evaluate(([px, pz]) => {
      const g = window.__game;
      const s = g.state.player;
      s.x = s.prevX = px;
      s.z = s.prevZ = pz;
      s.y = s.prevY = g.world.surfaceHeight(px, pz);
      s.vx = s.vz = 0;
    }, [x, z]);
  }

  /** Teleports, then gives the interaction system time to notice. */
  async standAt(x: number, z: number): Promise<HudText> {
    await this.teleport(x, z);
    await this.page.waitForTimeout(300);
    return this.hud();
  }

  /** Stops an NPC to face the player and stands right beside them, so the prompt is stable. */
  async standBeside(id: string): Promise<HudText> {
    await this.page.evaluate((npcId) => {
      const g = window.__game;
      const n = g.state.npcs.find((v: NpcSnapshot) => v.id === npcId);
      const s = g.state.player;
      n.attentionTimer = 5;
      s.x = s.prevX = n.x + 0.9;
      s.z = s.prevZ = n.z + 0.6;
      s.vx = s.vz = 0;
    }, id);
    await this.page.waitForTimeout(300);
    return this.hud();
  }

  async setTime(dayTime: number, paused: boolean): Promise<void> {
    await this.page.evaluate(([t, p]) => {
      const time = window.__game.state.time;
      time.dayTime = t;
      time.paused = p;
    }, [dayTime, paused] as const);
  }

  async setResources(values: { coins?: number; wood?: number }): Promise<void> {
    await this.page.evaluate((v) => Object.assign(window.__game.state.resources, v), values);
  }

  resources(): Promise<{ coins: number; wood: number; woodCapacity: number }> {
    return this.page.evaluate(() => ({ ...window.__game.state.resources }));
  }

  player(): Promise<{ x: number; y: number; z: number; vx: number; vz: number; speed: number; facing: number }> {
    return this.page.evaluate(() => {
      const s = window.__game.state.player;
      return { x: s.x, y: s.y, z: s.z, vx: s.vx, vz: s.vz, speed: s.speed, facing: s.facing };
    });
  }

  npcs(): Promise<NpcSnapshot[]> {
    return this.page.evaluate(() => window.__game.state.npcs.map((n: Record<string, unknown>) => ({
      id: n.id, job: n.job, phase: n.travelPhase, state: n.state, task: n.task,
      x: n.x, z: n.z, indoors: n.indoors, dormant: n.dormant, assignedSite: n.assignedSite,
    })));
  }

  async npc(id: string): Promise<NpcSnapshot> {
    const found = (await this.npcs()).find((n) => n.id === id);
    if (!found) throw new Error(`No NPC called ${id}`);
    return found;
  }

  /** Holds keys down for a while, then releases them. */
  async hold(keys: readonly string[], ms: number): Promise<void> {
    for (const key of keys) await this.page.keyboard.down(key);
    await this.page.waitForTimeout(ms);
    for (const key of keys) await this.page.keyboard.up(key);
  }

  /** Presses E and waits for the HUD, which refreshes ten times a second, to show the result. */
  async interact(): Promise<HudText> {
    await this.page.keyboard.press('KeyE');
    await this.page.waitForTimeout(250);
    return this.hud();
  }

  /** What the player actually sees on the HUD, read from the DOM rather than from game state. */
  hud(): Promise<HudText> {
    return this.page.evaluate(() => {
      const text = (selector: string): string => document.querySelector(selector)?.textContent ?? '';
      const shown = (selector: string): boolean => document.querySelector(selector)?.classList.contains('visible') ?? false;
      return {
        coins: Number(text('[data-value=coins]')),
        wood: text('[data-value=wood]'),
        people: Number(text('[data-value=people]')),
        day: text('[data-value=day]'),
        prompt: shown('.hud-prompt') ? text('.hud-prompt span') : '',
        blocked: document.querySelector('.hud-prompt')?.classList.contains('blocked') ?? false,
        feedback: shown('.hud-feedback') ? text('.hud-feedback') : '',
        notice: shown('.hud-notice') ? text('.hud-notice') : '',
      };
    });
  }

  /** Disposes the game and reports what was left behind. */
  dispose(): Promise<{ geometries: number; textures: number; canvas: boolean; diagnostics: boolean; hud: boolean }> {
    return this.page.evaluate(() => {
      const g = window.__game;
      const renderer = g.rendererHost.renderer;
      g.dispose();
      return {
        ...renderer.info.memory,
        canvas: document.querySelector('canvas') !== null,
        diagnostics: document.getElementById('diagnostics') !== null,
        hud: document.getElementById('hud') !== null,
      };
    });
  }
}

/**
 * Every test gets a fresh game, and fails if anything was logged as an error or warning,
 * so a shader or runtime problem cannot pass unnoticed behind passing assertions.
 */
export const test = base.extend<{ game: GameDriver }>({
  game: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') problems.push(`[${message.type()}] ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`));
    await page.goto('/?debug');
    await page.waitForFunction(() => window.__game, undefined, { timeout: 60_000 });
    await page.waitForTimeout(400);
    await use(new GameDriver(page));
    expect(problems, 'browser console').toEqual([]);
  },
});

export { expect };
