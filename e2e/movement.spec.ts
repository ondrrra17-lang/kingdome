import { expect, test } from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });

test.describe('moving the player with real keys', () => {
  test('each key moves the right way', async ({ game }) => {
    await game.teleport(-30, 0.5);
    let before = await game.player();
    await game.hold(['KeyD'], 500);
    let after = await game.player();
    expect(after.x, 'D moves +X').toBeGreaterThan(before.x + 1);
    expect(Math.abs(after.z - before.z), 'D stays on Z').toBeLessThan(0.2);
    expect(Math.abs(after.facing - Math.PI / 2), 'faces +X after D').toBeLessThan(0.2);

    before = await game.player();
    await game.hold(['KeyA'], 500);
    after = await game.player();
    expect(after.x, 'A moves -X').toBeLessThan(before.x - 0.5);

    await game.teleport(-30, 0.5);
    before = await game.player();
    await game.hold(['KeyW'], 400);
    after = await game.player();
    expect(after.z, 'W moves -Z').toBeLessThan(before.z - 0.5);

    before = await game.player();
    await game.hold(['KeyS'], 400);
    after = await game.player();
    expect(after.z, 'S moves +Z').toBeGreaterThan(before.z - 0.01);
  });

  test('accelerates, reaches walk and sprint speed, and slows down smoothly', async ({ game, page }) => {
    await game.teleport(-60, 1);
    await page.waitForTimeout(100);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(50);
    expect((await game.player()).speed, 'gradual start').toBeLessThan(4.6);
    await page.waitForTimeout(600);
    expect((await game.player()).speed, 'walk speed').toBeCloseTo(4.6, 0);

    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(500);
    expect((await game.player()).speed, 'sprint speed').toBeCloseTo(8.2, 0);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyD');

    await page.waitForTimeout(40);
    expect((await game.player()).speed, 'still coasting').toBeGreaterThan(2);
    await page.waitForTimeout(700);
    expect((await game.player()).speed, 'stopped').toBeLessThan(0.01);

    await game.teleport(-60, 0);
    await game.hold(['KeyD', 'KeyS'], 500);
    const diagonal = await game.player();
    expect(Math.hypot(diagonal.vx, diagonal.vz), 'diagonal is not faster').toBeLessThanOrEqual(4.7);
  });

  test('houses and trees block the player, who slides along walls', async ({ game, page }) => {
    const house = await page.evaluate(() => window.__game.world.colliders.find((c: { kind: string; halfX: number }) => c.kind === 'box' && c.halfX > 3));
    await game.teleport(house.x, house.z + house.halfZ + 3);
    await game.hold(['KeyW'], 1200);
    let at = await game.player();
    const dx = at.x - house.x;
    const dz = at.z - house.z;
    const localZ = dx * Math.sin(house.rotY) + dz * Math.cos(house.rotY);
    expect(Math.abs(localZ), 'stopped at the wall').toBeGreaterThanOrEqual(house.halfZ + 0.3);
    await page.waitForTimeout(100);
    expect((await game.player()).speed, 'legs stop against a wall').toBeLessThan(0.05);

    await game.teleport(house.x - 2, house.z + house.halfZ + 1);
    const start = await game.player();
    await game.hold(['KeyW', 'KeyD'], 700);
    at = await game.player();
    expect(Math.abs(at.x - start.x), 'slides along the wall').toBeGreaterThan(1);

    const tree = await page.evaluate(() => window.__game.world.colliders
      .filter((c: { kind: string; radius: number; z: number; x: number }) => c.kind === 'circle' && c.radius > 0.25 && c.z > -7 && c.z < 2 && Math.abs(c.x) < 95 && Math.abs(c.x + 10.3) > 3)
      .map((c: { x: number; z: number; radius: number }) => ({ x: c.x, z: c.z, r: c.radius }))[0]);
    await game.teleport(tree.x - 3, tree.z);
    await game.hold(['KeyD'], 1000);
    at = await game.player();
    expect(Math.hypot(at.x - tree.x, at.z - tree.z), 'tree blocks').toBeGreaterThanOrEqual(tree.r + 0.41);
  });

  test('the river can only be crossed on the bridge, whose rails hold', async ({ game }) => {
    await game.teleport(22, 5);
    await game.hold(['KeyD'], 1500);
    expect((await game.player()).x, 'river blocks away from the bridge').toBeLessThan(34 - 5.5);

    await game.teleport(22, 0);
    await game.hold(['KeyD', 'ShiftLeft'], 3000);
    expect((await game.player()).x, 'bridge crosses').toBeGreaterThan(42);

    await game.teleport(34, 0);
    expect((await game.player()).y, 'deck arches above the water').toBeGreaterThan(0.5);
    await game.hold(['KeyS'], 700);
    expect(Math.abs((await game.player()).z), 'south rail').toBeLessThan(1.7);
    await game.teleport(34, 0);
    await game.hold(['KeyW'], 700);
    expect(Math.abs((await game.player()).z), 'north rail').toBeLessThan(1.7);
  });

  test('the world has limits on every side', async ({ game }) => {
    await game.teleport(-60, 0);
    await game.hold(['KeyW', 'ShiftLeft'], 2600);
    expect((await game.player()).z, 'north edge of the valley').toBeGreaterThanOrEqual(-9);
    await game.teleport(-60, 0);
    await game.hold(['KeyS', 'ShiftLeft'], 2200);
    expect((await game.player()).z, 'south edge of the valley').toBeLessThanOrEqual(8);
    await game.teleport(90, 0.5);
    await game.hold(['KeyD', 'ShiftLeft'], 1800);
    expect((await game.player()).x, 'east').toBeLessThanOrEqual(98);
    await game.teleport(-90, 0.5);
    await game.hold(['KeyA', 'ShiftLeft'], 1800);
    expect((await game.player()).x, 'west').toBeGreaterThanOrEqual(-98);
  });

  test('releasing focus releases held keys', async ({ game, page }) => {
    await page.keyboard.down('KeyD');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(800);
    const { speed } = await game.player();
    await page.keyboard.up('KeyD');
    expect(speed).toBeLessThan(0.01);
  });
});

test.describe('camera and window', () => {
  const camera = (page: import('@playwright/test').Page): Promise<{ fx: number; fz: number; w: number; h: number }> => page.evaluate(() => {
    const r = window.__game.rig;
    return { fx: r.focus.x, fz: r.focus.z, w: r.camera.right - r.camera.left, h: r.camera.top - r.camera.bottom };
  });

  test('under-follows depth in the valley and stays clamped at its ends', async ({ game, page }) => {
    await game.teleport(-40, 7.5);
    await page.waitForTimeout(2500);
    const south = await camera(page);
    await game.teleport(-40, -8.5);
    await page.waitForTimeout(2500);
    const north = await camera(page);
    const moved = Math.abs(south.fz - north.fz);
    expect(moved).toBeLessThan(16 * 0.35);
    expect(moved).toBeGreaterThan(16 * 0.2);

    await game.teleport(97, 0.5);
    await page.waitForTimeout(1500);
    expect((await camera(page)).fx).toBeLessThanOrEqual(88.01);
  });

  test('follows the window shape, and caps the pixel ratio', async ({ page }) => {
    await page.goto('/?debug');
    await page.waitForFunction(() => window.__game);
    await page.setViewportSize({ width: 800, height: 800 });
    await page.waitForTimeout(300);
    let view = await camera(page);
    expect(view.w / view.h, 'square window').toBeCloseTo(1, 1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    view = await camera(page);
    expect(view.w, 'portrait keeps a minimum width').toBeGreaterThanOrEqual(29.9);
    expect(view.w / view.h).toBeCloseTo(390 / 844, 1);

    expect(await page.evaluate(() => window.__game.rendererHost.pixelRatio)).toBeLessThanOrEqual(2);
  });
});

test('the day clock runs at the configured rate', async ({ page, game }) => {
  await game.setTime(0.4, false);
  const start = await page.evaluate(() => [window.__game.state.time.dayTime, performance.now()]);
  await page.waitForTimeout(2000);
  const end = await page.evaluate(() => [window.__game.state.time.dayTime, performance.now()]);
  const gameSecondsPerSecond = ((end[0] - start[0]) * 240) / ((end[1] - start[1]) / 1000);
  expect(Math.abs(gameSecondsPerSecond - 1)).toBeLessThan(0.25);
});

test('disposing the game frees every GPU resource and removes its page elements', async ({ game }) => {
  const left = await game.dispose();
  expect(left.geometries).toBe(0);
  expect(left.textures).toBe(0);
  expect(left.canvas).toBe(false);
  expect(left.diagnostics).toBe(false);
  expect(left.hud).toBe(false);
});
