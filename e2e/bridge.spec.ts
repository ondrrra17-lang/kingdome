import { expect, test } from './helpers';

test.use({ viewport: { width: 1280, height: 800 } });

const bridge = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const s = window.__game.state.construction.find((s: { id: string }) => s.id === 'bridge');
  return { status: s.status, progress: s.progress, workerId: s.workerId, solid: s.solid };
});
async function reload(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Continue Game' }).click();
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => { window.__game.state.time.paused = true; });
}

test('saving against the broken edge preserves the last safe position', async ({ game, page }) => {
  await game.setTime(0.35, true);
  await game.teleport(22, 0);
  await game.hold(['KeyD', 'ShiftLeft'], 3000);
  const before = await game.player();
  expect(before.x).toBeGreaterThan(30.5);
  expect(before.x).toBeLessThan(31);
  await reload(page);
  expect((await game.player()).x).toBeCloseTo(before.x, 4);
  expect((await bridge(page)).status).toBe('available');
  await game.hold(['KeyD', 'ShiftLeft'], 800);
  expect((await game.player()).x).toBeCloseTo(before.x, 4);
});

test('the opening objective earns wood, repairs the bridge, survives dusk/loading, and leads to the eastern camp', async ({ game, page }) => {
  test.setTimeout(300_000);
  await game.setTime(0.35, true);
  await expect(page.locator('.hud-goal')).toContainText('Restore the Old Bridge');
  await expect(page.locator('.hud-goal')).toContainText('assign a woodcutter');
  await game.teleport(22, 0);
  await game.hold(['KeyD', 'ShiftLeft'], 3000);
  expect((await game.player()).x).toBeLessThan(31);
  await game.standAt(24, 0);
  expect((await game.hud()).blocked).toBe(true);
  await game.interact();
  expect((await game.resources()).coins).toBe(5);
  expect((await bridge(page)).status).toBe('available');

  await game.standBeside('bren');
  await page.keyboard.press('KeyR');
  await page.locator('[data-job="woodcutter"]').click();
  await page.keyboard.press('Escape');
  await game.teleport(-60, 1);
  await expect.poll(async () => (await game.resources()).wood, { timeout: 110_000, intervals: [500] }).toBeGreaterThanOrEqual(8);
  await expect(page.locator('.hud-goal')).toContainText('Press E at the sign');
  const before = await game.resources();
  await game.standAt(24, 0);
  expect((await game.hud()).prompt).toContain('Repair Old Bridge');
  await game.interact();
  expect((await game.resources()).coins).toBe(before.coins - 4);
  expect((await game.resources()).wood).toBe(before.wood - 8);
  await game.interact();
  expect((await game.resources()).coins).toBe(before.coins - 4);
  await game.teleport(21, 1);
  await expect.poll(async () => (await bridge(page)).progress, { timeout: 100_000, intervals: [300] }).toBeGreaterThan(0.15);
  await game.setTime(0.95, true);
  await page.waitForTimeout(500);
  const paused = await bridge(page);
  await page.waitForTimeout(1200);
  expect((await bridge(page)).progress).toBe(paused.progress);
  await reload(page);
  expect((await bridge(page)).progress).toBeCloseTo(paused.progress, 5);
  expect((await game.resources()).coins).toBe(before.coins - 4);
  await game.teleport(22, 0);
  await game.hold(['KeyD', 'ShiftLeft'], 3000);
  expect((await game.player()).x).toBeLessThan(31);
  await game.setTime(0.35, true);
  await game.teleport(21, 1);
  await expect.poll(async () => (await bridge(page)).status, { timeout: 100_000, intervals: [300] }).toBe('completed');
  expect((await bridge(page)).solid).toBe(false);
  await expect(page.locator('.hud-goal')).toContainText('The east bank is open');
  await game.teleport(22, 0);
  await game.hold(['KeyD', 'ShiftLeft'], 3300);
  expect((await game.player()).x).toBeGreaterThan(42);
  await game.standAt(68, -33);
  await expect(page.locator('.hud-goal.complete')).toContainText('Complete.');
  await reload(page);
  await expect(page.locator('.hud-goal.complete')).toBeVisible();
  expect((await bridge(page)).status).toBe('completed');
});

test('a Phase 5 save keeps its already open crossing and eastern position', async ({ game, page }) => {
  await game.setTime(0.35, true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('emberwick-vale:save')!);
    raw.version = 2;
    raw.construction = raw.construction.filter((s: { id: string }) => s.id !== 'bridge');
    raw.player.x = 60; raw.player.z = 0;
    raw.economy.coins = 17;
    localStorage.setItem('emberwick-vale:save', JSON.stringify(raw));
  });
  // Navigation can trigger pagehide saving; stop only this old instance before reloading the fixture.
  await page.evaluate(() => window.__game.saveSystem.stop());
  await page.reload();
  await page.getByRole('button', { name: 'Continue Game' }).click();
  await page.waitForFunction(() => window.__game);
  expect((await bridge(page)).status).toBe('completed');
  expect((await game.player()).x).toBeCloseTo(60, 0);
  expect((await game.resources()).coins).toBe(17);
  await game.teleport(22, 0);
  await game.hold(['KeyD', 'ShiftLeft'], 3300);
  expect((await game.player()).x).toBeGreaterThan(42);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('emberwick-vale:save')!).version)).toBe(3);
});

test('the objective stays readable in a narrow viewport with food warnings', async ({ game, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('F3');
  await page.evaluate(() => { window.__game.state.resources.food = 0; });
  await expect(page.locator('.hud-goal')).toContainText('Restore the Old Bridge');
  await expect(page.locator('.hud-food-warning')).toBeVisible();
  const goal = await page.locator('.hud-goal').boundingBox();
  const warning = await page.locator('.hud-food-warning').boundingBox();
  expect(goal).not.toBeNull(); expect(warning).not.toBeNull();
  expect(goal!.x + goal!.width).toBeLessThanOrEqual(390);
  expect(goal!.y).toBeGreaterThan(warning!.y + warning!.height);
  expect(goal!.y + goal!.height).toBeLessThan(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await game.standBeside('bren');
  await page.keyboard.press('KeyR');
  await expect(page.locator('#economy-panel')).toBeVisible();
  await expect(page.locator('.hud-goal')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.hud-goal')).toBeVisible();
});
