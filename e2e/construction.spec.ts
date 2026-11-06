import { expect, test, type GameDriver } from './helpers';

test.use({ viewport: { width: 1600, height: 900 } });

const SITES = { hut: [-2.5, 3.9], shed: [-15, 3.8], watchtower: [21.5, -3.2] } as const;

interface SiteSnapshot {
  id: string;
  status: string;
  progress: number;
  solid: boolean;
  workerId: string | null;
}

function site(game: GameDriver, id: string): Promise<SiteSnapshot> {
  return game.page.evaluate((siteId) => ({ ...window.__game.state.construction.find((c: { id: string }) => c.id === siteId) }), id);
}

test('a site shows its price and explains what is missing, without charging', async ({ game }) => {
  await game.setTime(0.3, true);
  let hud = await game.standAt(...SITES.hut);
  expect(hud.prompt).toMatch(/Woodcutter's Hut.*4 wood.*2 coins/);
  expect(hud.blocked).toBe(true);
  expect(hud.prompt).toMatch(/not enough/);

  hud = await game.interact();
  expect(hud.feedback).toMatch(/4 more wood/);
  expect(hud.coins).toBe(5);
  expect(hud.wood).toBe('0/10');
});

test('real wood pays for a building, which a villager walks over and builds', async ({ game, page }) => {
  await game.setTime(0.3, true);

  let hud = await game.standBeside('bren');
  expect(hud.prompt).toMatch(/Recruit Bren/);
  hud = await game.interact();
  expect(hud.coins, 'giving a job is free').toBe(5);

  hud = await game.standBeside('cora');
  expect(hud.prompt, 'woodcutter limit: no hire offered').toMatch(/Talk to Cora/);
  hud = await game.interact();
  expect(hud.feedback).toMatch(/only support 1 woodcutter/);
  expect(hud.coins, 'refusal costs nothing').toBe(5);

  await game.teleport(-70, 5);
  await expect.poll(async () => (await game.resources()).wood, { timeout: 120_000, intervals: [400] }).toBeGreaterThanOrEqual(4);

  hud = await game.standAt(...SITES.hut);
  expect(hud.prompt).toMatch(/^Build Woodcutter's Hut/);
  expect(hud.blocked).toBe(false);

  // A held key, then another press: the price must still only be taken once.
  const before = await game.resources();
  await page.keyboard.down('KeyE');
  await page.keyboard.down('KeyE');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyE');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const after = await game.resources();
  expect(after.coins).toBe(before.coins - 2);
  expect(after.wood).toBeLessThanOrEqual(before.wood - 4 + 3); // A delivery may land during the wait.
  const funded = await site(game, 'hut');
  expect(funded.status).not.toBe('available');
  expect(funded.workerId).not.toBeNull();

  await game.teleport(2.5, 1.6);
  const seen = new Set<string>();
  let checkedPosition = false;
  await expect.poll(async () => {
    const current = await site(game, 'hut');
    const worker = await game.npc(funded.workerId!);
    seen.add(current.status);
    seen.add(`task:${worker.task}`);
    if (current.status === 'building' && current.progress > 0.35 && !checkedPosition) {
      checkedPosition = true;
      expect(Math.hypot(worker.x + 6, worker.z - 5.6), 'builder stays at the site').toBeLessThan(2.2);
    }
    return current.status;
  }, { timeout: 70_000, intervals: [150] }).toBe('completed');
  expect([...seen]).toContain('building');
  expect([...seen]).toContain('task:build');
  expect(checkedPosition).toBe(true);
  await expect.poll(async () => (await game.hud()).notice).toMatch(/finished/);

  // The effect: one more woodcutter, and no more than that.
  await game.setResources({ coins: 20 });
  const nextFree = (): Promise<string> => page.evaluate(() => window.__game.state.npcs.find((n: { job: string; assignedSite: number }) => n.job === 'villager' && n.assignedSite < 0).id);
  hud = await game.standBeside(await nextFree());
  expect(hud.prompt, 'the hut allows a second woodcutter').toMatch(/^Recruit /);
  await game.interact();
  hud = await game.standBeside(await nextFree());
  expect(hud.prompt, 'but not a third').toMatch(/^Talk to /);

  // Solid, tested by walking into it.
  expect((await site(game, 'hut')).solid).toBe(true);
  await game.teleport(-2.5, 3);
  await game.hold(['KeyS'], 1500);
  expect((await game.player()).z, 'cannot walk through the finished hut').toBeLessThanOrEqual(5.1);
  const colliders = await page.evaluate(() => window.__game.world.colliders.filter((c: { kind: string; x: number; z: number }) => c.kind === 'box' && Math.abs(c.x + 2.5) < 0.01 && Math.abs(c.z - 6.6) < 0.01).length);
  expect(colliders, 'its collider was added exactly once').toBe(1);
});

test('the other buildings apply their effects and last through the night', async ({ game, page }) => {
  await game.setTime(0.3, true);
  await game.setResources({ wood: 10, coins: 20 });
  await game.standAt(...SITES.shed);
  await game.interact();
  await game.setResources({ wood: 10 });

  const hud = await game.standAt(...SITES.watchtower);
  expect(hud.prompt).toMatch(/Watchtower.*6 wood.*3 coins/);
  await game.interact();
  await game.teleport(14, 1);

  const done = (): Promise<boolean> => page.evaluate(() => ['shed', 'watchtower'].every((id) => {
    const s = window.__game.state.construction.find((c: { id: string }) => c.id === id);
    return s.status === 'completed' && s.solid;
  }));
  await expect.poll(done, { timeout: 120_000, intervals: [500] }).toBe(true);
  expect((await game.resources()).woodCapacity, 'the shed raises the limit').toBe(25);
  expect(await page.evaluate(() => window.__game.state.village.watchPosts), 'the tower records a watch post').toBe(1);

  await game.setTime(0.95, true);
  await page.waitForTimeout(500);
  expect(await done(), 'still standing at night').toBe(true);
});

test('the village pays its daily income at midnight', async ({ game }) => {
  const before = (await game.resources()).coins;
  await game.setTime(0.998, false);
  await expect.poll(async () => (await game.resources()).coins, { timeout: 5000 }).toBe(before + 2);
  await expect.poll(async () => (await game.hud()).notice).toMatch(/tithes/);
});
