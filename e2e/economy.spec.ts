import { readFileSync } from 'node:fs';
import { expect, test, type GameDriver } from './helpers';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1600, height: 900 } });
test.beforeEach(async ({ game }) => { await game.setTime(0.35, true); });

async function build(game: GameDriver, id: string, x: number, z: number): Promise<void> {
  await game.setResources({ wood: 10, coins: 20 });
  await game.standAt(x, z);
  expect((await game.hud()).prompt).toMatch(/^Build /);
  await game.interact();
  await game.teleport(-70, 1);
  await expect.poll(() => game.page.evaluate((siteId) => window.__game.state.construction.find((s: { id: string }) => s.id === siteId).status, id), { timeout: 100_000, intervals: [500] }).toBe('completed');
}
async function assign(game: GameDriver, page: Page, id: string, job: string): Promise<void> {
  await game.standBeside(id);
  await page.keyboard.press('KeyR');
  await expect(page.locator('#economy-panel')).toBeVisible();
  await page.locator(`[data-job="${job}"]`).click();
  await expect(page.locator('.economy-result')).toContainText(`a ${job}`);
  await page.keyboard.press('Escape');
}
async function reload(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.hud-save-status')).toHaveText('Game saved');
  await page.reload();
  await page.getByRole('button', { name: 'Continue Game' }).click();
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => { window.__game.state.time.paused = true; });
}

test('builds a farm, assigns a farmer for free, resumes growth after loading and recovers from hunger', async ({ game, page }) => {
  test.setTimeout(240_000);
  await expect(page.locator('[data-value="food"]')).toHaveText('9');
  await expect(page.locator('[data-value="furs"]')).toHaveText('0');
  await game.standBeside('bren'); await page.keyboard.press('KeyR');
  await expect(page.locator('[data-job="farmer"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await build(game, 'farm', -47, 2.6);
  const coins = (await game.resources()).coins;
  await page.evaluate(() => { window.__game.state.resources.food = 0; });
  await assign(game, page, 'bren', 'farmer');
  expect((await game.resources()).coins).toBe(coins);
  await game.teleport(-90, 0);
  await expect(page.locator('.hud-food-warning')).toContainText('No food');
  await expect.poll(() => page.evaluate(() => window.__game.state.kingdom.field.progress), { timeout: 90_000, intervals: [300] }).toBeGreaterThan(0.15);
  const progress = await page.evaluate(() => window.__game.state.kingdom.field.progress);
  await reload(page);
  expect(await page.evaluate(() => window.__game.state.kingdom.field.progress)).toBeGreaterThanOrEqual(progress);
  expect(await page.evaluate(() => window.__game.state.npcs.find((n: { id: string }) => n.id === 'bren').job)).toBe('farmer');
  await expect.poll(() => page.evaluate(() => window.__game.state.resources.food), { timeout: 130_000, intervals: [500] }).toBeGreaterThan(0);
  await expect(page.locator('.hud-food-warning')).not.toContainText('No food');
  expect(await page.evaluate(() => window.__game.state.npcs.find((n: { id: string }) => n.id === 'bren').cargoFood)).toBe(0);
});

test('builds a lodge and a hunter walks to the forest and delivers food', async ({ game, page }) => {
  await build(game, 'lodge', 10, 3.1);
  await assign(game, page, 'cora', 'hunter');
  await game.teleport(-90, 0);
  await expect.poll(() => page.evaluate(() => window.__game.state.npcs.find((n: { id: string }) => n.id === 'cora').task), { timeout: 100_000, intervals: [500] }).toBe('produce');
  const hunting = await game.npc('cora'); expect(hunting.z).toBeLessThan(-20);
  await expect.poll(() => page.evaluate(() => window.__game.state.resources.food), { timeout: 100_000, intervals: [500] }).toBeGreaterThan(9);
  await game.standBeside('edda'); await page.keyboard.press('KeyR');
  await expect(page.locator('[data-job="hunter"]')).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('a merchant arrives by road, trades exact amounts, survives reload and leaves on schedule', async ({ game, page }) => {
  await page.evaluate(() => { window.__game.state.time.day = 3; });
  await game.teleport(15, 1);
  await expect.poll(() => page.evaluate(() => window.__game.state.kingdom.merchant.phase), { timeout: 100_000, intervals: [500] }).toBe('visiting');
  expect(await page.evaluate(() => window.__game.state.kingdom.merchant.nextVisitDay)).toBe(6);
  await reload(page);
  expect(await page.evaluate(() => window.__game.state.kingdom.merchant.phase)).toBe('visiting');
  const merchant = await page.evaluate(() => ({ ...window.__game.state.kingdom.merchant }));
  await page.evaluate(() => { Object.assign(window.__game.state.resources, { wood: 5, furs: 2, coins: 0, food: 0 }); });
  await game.standAt(merchant.x - 0.8, merchant.z);
  await expect.poll(async () => (await game.hud()).prompt).toBe('Trade with Rowan');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#economy-panel')).toBeVisible();
  await expect(page.locator('[data-trade="buy-food"]')).toBeDisabled();
  await page.locator('[data-trade="sell-wood"]').click();
  await expect(page.locator('[data-value="coins"]')).toHaveText('2');
  await expect(page.locator('[data-trade="sell-wood"]')).toBeDisabled();
  await page.locator('[data-trade="buy-food"]').click();
  await page.locator('[data-trade="sell-furs"]').click();
  await expect(page.locator('[data-value="coins"]')).toHaveText('4');
  await expect(page.locator('[data-value="food"]')).toHaveText('3');
  await expect(page.locator('[data-value="furs"]')).toHaveText('0');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const s = window.__game.state, at = s.kingdom.merchant.departAt;
    s.time.day = Math.floor(at); s.time.dayTime = at % 1;
  });
  await game.teleport(15, 1);
  await expect.poll(() => page.evaluate(() => window.__game.state.kingdom.merchant.phase), { timeout: 100_000, intervals: [500] }).toBe('away');
  expect(await page.evaluate(() => window.__game.state.npcs.length)).toBe(8);
});

test('supplies, a traveler rumor and a village request persist without duplicate rewards', async ({ game, page }) => {
  await game.standAt(10.8, -27.5);
  expect((await game.hud()).prompt).toBe('Recover the lost supplies');
  await game.interact();
  await expect(page.locator('[data-value="food"]')).toHaveText('13');
  await expect(page.locator('.hud-notice')).toContainText('Lost supplies recovered');
  await game.interact();
  await expect(page.locator('[data-value="food"]')).toHaveText('13');
  await game.standBeside('wren');
  const rumor = await game.interact(); expect(rumor.feedback).toContain('unopened chest');
  const target = await page.evaluate(() => window.__game.state.kingdom.events.rumorTreasureId);
  expect(await page.evaluate((id) => window.__game.state.exploration.treasures.find((t: { id: string }) => t.id === id).opened, target)).toBe(false);
  await game.standBeside('alda'); await game.interact();
  await game.setResources({ wood: 3 });
  const coins = (await game.resources()).coins;
  await game.interact();
  expect((await game.resources()).coins).toBe(coins + 2);
  await game.interact(); expect((await game.resources()).coins).toBe(coins + 2);
  await reload(page);
  expect(await page.evaluate(() => window.__game.state.kingdom.events)).toMatchObject({ cacheCollected: true, rumorHeard: true, rumorTreasureId: target, request: 'completed' });
  await game.standAt(10.8, -27.5); await page.keyboard.press('KeyE');
  await expect(page.locator('[data-value="food"]')).toHaveText('13');
});

test('an actual Phase 4 save migrates on Continue without resetting progress', async ({ page }) => {
  const text = readFileSync('e2e/fixtures/phase4-save.json', 'utf8');
  await page.addInitScript((save) => localStorage.setItem('emberwick-vale:save', save), text);
  await page.goto('/?debug');
  await page.getByRole('button', { name: 'Continue Game' }).click();
  await page.waitForFunction(() => window.__game);
  const old = JSON.parse(text);
  expect(await page.evaluate(() => window.__game.state.resources.coins)).toBe(old.economy.coins);
  expect(await page.evaluate(() => window.__game.state.time.day)).toBe(old.time.day);
  await expect(page.locator('[data-value="food"]')).toHaveText('9');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('emberwick-vale:save')!).version)).toBe(2);
});
