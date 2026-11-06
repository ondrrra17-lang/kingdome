import type { Page } from '@playwright/test';
import { expect, test, type GameDriver } from './helpers';

test.use({ viewport: { width: 1600, height: 900 } });

const SAVE_KEY = 'emberwick-vale:save';

async function saveWithButton(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.hud-save-status')).toHaveText('Game saved');
}

/** Reloads the page and chooses Continue Game, as coming back later would. */
async function reloadAndContinue(page: Page): Promise<void> {
  await page.reload();
  await page.getByRole('button', { name: 'Continue Game' }).click();
  await page.waitForFunction(() => window.__game, undefined, { timeout: 60_000 });
  await page.waitForTimeout(400);
}

function site(game: GameDriver, id: string): Promise<{ status: string; progress: number; solid: boolean; workerId: string | null }> {
  return game.page.evaluate((siteId) => ({ ...window.__game.state.construction.find((c: { id: string }) => c.id === siteId) }), id);
}

test.beforeEach(async ({ game }) => {
  await game.setTime(0.4, true);
});

test('a first visit has no start screen, and saving shows a confirmation', async ({ game, page }) => {
  await expect(page.locator('#start-screen')).toHaveCount(0);
  await saveWithButton(page);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).version, SAVE_KEY)).toBe(1);
  expect((await game.hud()).coins).toBe(5);
});

test('save and reload brings back position, time, resources and discoveries', async ({ game, page }) => {
  await page.evaluate(() => {
    const { state } = window.__game;
    state.time.day = 3;
    state.time.dayTime = 0.61;
  });
  // Moving the clock to a new day pays that day's income, so coins are set after it.
  await expect.poll(async () => (await game.hud()).coins).toBe(7);
  await page.evaluate(() => {
    const { state } = window.__game;
    state.resources.coins = 23;
    state.resources.wood = 7;
  });
  await game.teleport(3, -35);
  await expect.poll(async () => (await game.hud()).notice).toMatch(/Old Ruins/);
  await saveWithButton(page);

  await reloadAndContinue(page);
  const player = await game.player();
  expect(player.x).toBeCloseTo(3, 0);
  expect(player.z).toBeCloseTo(-35, 0);
  const hud = await game.hud();
  expect(hud.coins).toBe(23);
  expect(hud.wood).toBe('7/10');
  expect(hud.day).toBe('Day 3');
  const time = await page.evaluate(() => window.__game.state.time.dayTime);
  expect(Math.abs(time - 0.61)).toBeLessThan(0.02);
  expect(await page.evaluate(() => window.__game.state.exploration.landmarks.find((l: { id: string }) => l.id === 'ruins').discovered)).toBe(true);
  // Already discovered, so not announced a second time.
  await page.waitForTimeout(600);
  expect((await game.hud()).notice).not.toMatch(/Old Ruins/);
});

test('an opened chest stays opened and pays nothing after loading', async ({ game, page }) => {
  await game.standAt(4.2, -43.5);
  let hud = await game.interact();
  expect(hud.coins).toBe(10);
  await saveWithButton(page);

  await reloadAndContinue(page);
  hud = await game.hud();
  expect(hud.coins).toBe(10);
  expect(hud.prompt).toBe('Look in the empty chest');
  hud = await game.interact();
  expect(hud.coins, 'no duplicate reward').toBe(10);
  expect(hud.feedback).toMatch(/Empty/);
});

test('an invited traveler keeps walking after loading, at no extra cost, and nobody is duplicated', async ({ game, page }) => {
  await game.teleport(67, -34);
  await expect.poll(async () => (await game.npc('wren')).dormant).toBe(false);
  await page.evaluate(() => {
    const tobin = window.__game.state.npcs.find((n: { id: string }) => n.id === 'tobin');
    tobin.x = tobin.prevX = 75;
    tobin.attentionTimer = 5;
  });
  await game.standBeside('wren');
  let hud = await game.interact();
  expect(hud.coins).toBe(3);
  await page.waitForTimeout(4000);
  const before = await game.npc('wren');
  expect(before.phase).toBe('journey');
  await saveWithButton(page);

  await reloadAndContinue(page);
  const npcs = await game.npcs();
  expect(npcs).toHaveLength(8);
  expect(new Set(npcs.map((n) => n.id)).size).toBe(8);
  const resumed = await game.npc('wren');
  expect(resumed.phase).toBe('journey');
  expect(Math.hypot(resumed.x - before.x, resumed.z - before.z), 'no teleporting on load').toBeLessThan(4);
  hud = await game.hud();
  expect(hud.coins, 'not charged or refunded').toBe(3);
  expect(hud.people, 'not a villager yet').toBe(5);

  await expect.poll(async () => (await game.npc('wren')).phase, { timeout: 120_000, intervals: [500] }).toBe('settled');
  await expect.poll(async () => (await game.hud()).people).toBe(6);
});

test('a recruited villager stays recruited and keeps working after loading', async ({ game, page }) => {
  await game.standBeside('bren');
  let hud = await game.interact();
  expect((await game.npc('bren')).job).toBe('woodcutter');
  expect(hud.coins, 'giving a job is free').toBe(5);
  await saveWithButton(page);

  await reloadAndContinue(page);
  expect((await game.npc('bren')).job).toBe('woodcutter');
  hud = await game.standBeside('cora');
  expect(hud.prompt, 'the limit still counts them').toMatch(/Talk to Cora/);
  await game.teleport(-70, 5);
  await expect.poll(async () => (await game.resources()).wood, { timeout: 75_000, intervals: [500] }).toBeGreaterThan(0);
});

test('a finished building stays finished and solid, and its effect is not applied twice', async ({ game, page }) => {
  await game.setResources({ wood: 10, coins: 20 });
  await game.standAt(-2.5, 3.9);
  await game.interact();
  await page.evaluate(() => {
    window.__game.state.construction.find((c: { id: string }) => c.id === 'hut').progress = 0.97;
  });
  await expect.poll(async () => (await site(game, 'hut')).status, { timeout: 60_000, intervals: [300] }).toBe('completed');
  await game.setResources({ wood: 6 });
  await saveWithButton(page);
  const limit = await page.evaluate(() => window.__game.state.village.maxWoodcutters);
  expect(limit).toBe(2);
  const { coins } = await game.resources();

  await reloadAndContinue(page);
  await expect.poll(async () => (await site(game, 'hut')).solid).toBe(true);
  expect((await site(game, 'hut')).status).toBe('completed');
  expect(await page.evaluate(() => window.__game.state.village.maxWoodcutters)).toBe(limit);
  expect((await game.resources()).coins).toBe(coins);
  expect((await game.resources()).wood).toBe(6);
  const colliders = await page.evaluate(() => window.__game.world.colliders.filter((c: { kind: string; x: number; z: number }) => c.kind === 'box' && Math.abs(c.x + 2.5) < 0.01 && Math.abs(c.z - 6.6) < 0.01).length);
  expect(colliders).toBe(1);

  await game.teleport(-2.5, 3);
  await game.hold(['KeyS'], 1500);
  expect((await game.player()).z, 'cannot walk through it after loading').toBeLessThanOrEqual(5.1);
});

test('a building in progress is finished after loading, with no second payment', async ({ game, page }) => {
  await game.setResources({ wood: 10, coins: 20 });
  await game.standAt(-15, 3.8);
  await game.interact();
  await expect.poll(async () => (await site(game, 'shed')).status, { timeout: 40_000, intervals: [300] }).toBe('building');
  await page.evaluate(() => {
    window.__game.state.construction.find((c: { id: string }) => c.id === 'shed').progress = 0.7;
  });
  const before = await game.resources();
  await saveWithButton(page);

  await reloadAndContinue(page);
  const resumed = await site(game, 'shed');
  expect(resumed.progress).toBeGreaterThanOrEqual(0.7);
  expect(resumed.workerId).not.toBeNull();
  await game.setTime(0.4, true);
  await expect.poll(async () => (await site(game, 'shed')).status, { timeout: 60_000, intervals: [300] }).toBe('completed');
  const after = await game.resources();
  expect(after.coins).toBe(before.coins);
  expect(after.woodCapacity, 'storage effect applied once').toBe(25);
});

test('villagers still find their way across the map after loading', async ({ game, page }) => {
  await saveWithButton(page);
  await reloadAndContinue(page);
  await game.setTime(0.4, true);
  const start = await game.npcs();
  await page.waitForTimeout(12_000);
  const later = await game.npcs();
  const moved = later.filter((n, i) => n.job !== 'traveler' && Math.hypot(n.x - start[i].x, n.z - start[i].z) > 0.5);
  expect(moved.length, 'the village is up and moving').toBeGreaterThan(0);
  const paths = await page.evaluate(() => window.__game.state.npcs.filter((n: { pathStatus: string }) => n.pathStatus === 'failed').length);
  expect(paths).toBeLessThanOrEqual(1);
});

test('the game saves by itself after something significant', async ({ game, page }) => {
  await page.waitForTimeout(4500); // Past the minimum time between saves.
  await game.standAt(4.2, -43.5);
  await game.interact();
  await expect.poll(() => page.evaluate((key) => {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text).exploration.openedTreasures : [];
  }, SAVE_KEY), { timeout: 8000 }).toContain('chest-ruins');
});

test('leaving the page saves, so coming straight back loses nothing', async ({ game, page }) => {
  await game.setResources({ coins: 41 });
  await reloadAndContinue(page);
  expect((await game.hud()).coins).toBe(41);
});

test('Ctrl+S saves without opening the browser\'s own dialog', async ({ game, page }) => {
  await game.setResources({ coins: 12 });
  await page.keyboard.press('Control+KeyS');
  await expect(page.locator('.hud-save-status')).toHaveText('Game saved');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).economy.coins, SAVE_KEY)).toBe(12);
});

test('a failed save is reported, and the game carries on', async ({ game, page }) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const status = page.locator('.hud-save-status');
  await expect(status).toContainText('Could not save');
  await expect(status).toContainText('full');
  await expect(status).toHaveClass(/error/);
  await page.waitForTimeout(3000);
  await expect(status, 'stays up while progress is at risk').toHaveClass(/visible/);
  await game.teleport(-30, 0.5);
  await game.hold(['KeyD'], 400);
  expect((await game.player()).x, 'still playable').toBeGreaterThan(-30);
});

test.describe('New Game', () => {
  test('in the game: cancelling keeps everything and pauses nothing for good', async ({ game, page }) => {
    await game.setResources({ coins: 33 });
    await saveWithButton(page);
    await page.getByRole('button', { name: 'New Game' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('erases');
    await expect(dialog).toContainText('33 coins');
    await expect(page.getByRole('button', { name: 'Keep playing' }), 'the safe choice has focus').toBeFocused();

    // Nothing moves behind the dialog.
    await game.teleport(-30, 0.5);
    await game.hold(['KeyD'], 400);
    expect((await game.player()).x).toBeCloseTo(-30, 1);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).economy.coins, SAVE_KEY)).toBe(33);
    await game.hold(['KeyD'], 400);
    expect((await game.player()).x, 'playing again').toBeGreaterThan(-30);
    expect((await game.hud()).coins).toBe(33);
  });

  test('in the game: confirming erases progress and starts over, without a save coming back', async ({ game, page }) => {
    await game.setResources({ coins: 33 });
    await saveWithButton(page);
    await page.getByRole('button', { name: 'New Game' }).click();
    await page.getByRole('button', { name: 'Erase and start' }).click();
    await page.waitForFunction(() => window.__game && window.__game.state.resources.coins === 5, undefined, { timeout: 60_000 });
    await expect(page.locator('#start-screen')).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBeNull();
  });

  test('on the start screen: cancelling keeps the save, and confirming erases it', async ({ game, page }) => {
    await game.setResources({ coins: 33 });
    await saveWithButton(page);
    await page.reload();
    await expect(page.locator('.start-summary')).toContainText('33 coins');

    await page.getByRole('button', { name: 'New Game' }).click();
    await page.getByRole('button', { name: 'Keep my save' }).click();
    await expect(page.getByRole('button', { name: 'Continue Game' })).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).not.toBeNull();

    await page.getByRole('button', { name: 'New Game' }).click();
    await page.getByRole('button', { name: 'Erase and start' }).click();
    await page.waitForFunction(() => window.__game, undefined, { timeout: 60_000 });
    expect((await game.hud()).coins).toBe(5);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__game.state.exploration.treasures.every((t: { opened: boolean }) => !t.opened))).toBe(true);
  });
});

test.describe('damaged saves', () => {
  test('an unreadable save is explained, kept aside, and does not stop a new game', async ({ game, page }) => {
    await page.evaluate(() => window.__game.saveSystem.stop());
    await page.evaluate((key) => localStorage.setItem(key, '{"version":1,"truncat'), SAVE_KEY);
    await page.reload();
    await expect(page.locator('.start-warning')).toContainText('could not be read');
    await expect(page.getByRole('button', { name: 'Continue Game' })).toHaveCount(0);
    await page.getByRole('button', { name: 'New Game' }).click();
    await page.waitForFunction(() => window.__game, undefined, { timeout: 60_000 });
    expect((await game.hud()).coins).toBe(5);
    expect(await page.evaluate(() => localStorage.getItem('emberwick-vale:save:damaged'))).toContain('truncat');
  });

  test('a damaged save falls back to the one before it', async ({ game, page }) => {
    await game.setResources({ coins: 15 });
    await saveWithButton(page);
    await game.setResources({ coins: 16 });
    await page.keyboard.press('Control+KeyS');
    await page.waitForTimeout(200);
    await page.evaluate((key) => {
      window.__game.saveSystem.stop();
      localStorage.setItem(key, 'garbage');
    }, SAVE_KEY);
    await page.reload();
    await expect(page.locator('.start-warning')).toContainText('the one before it');
    await page.getByRole('button', { name: 'Continue Game' }).click();
    await page.waitForFunction(() => window.__game, undefined, { timeout: 60_000 });
    expect((await game.hud()).coins).toBe(15);
  });

  test('a partly damaged save still loads, with what it could keep', async ({ game, page }) => {
    await game.setResources({ coins: 19 });
    await saveWithButton(page);
    await page.evaluate((key) => {
      window.__game.saveSystem.stop();
      const save = JSON.parse(localStorage.getItem(key)!);
      save.construction = 'nonsense';
      save.npcs[1] = null;
      localStorage.setItem(key, JSON.stringify(save));
    }, SAVE_KEY);
    await page.reload();
    await expect(page.locator('.start-warning')).toContainText('reset');
    await page.getByRole('button', { name: 'Continue Game' }).click();
    await page.waitForFunction(() => window.__game, undefined, { timeout: 60_000 });
    expect((await game.hud()).coins).toBe(19);
    expect(await game.npcs()).toHaveLength(8);
  });
});
