import { expect, test } from './helpers';

test.use({ viewport: { width: 1600, height: 900 } });

const OPEN_GROUND = [-70, 5] as const;

test('starts with the expected resources and people', async ({ game }) => {
  const hud = await game.hud();
  expect(hud.coins).toBe(5);
  expect(hud.wood).toBe('0/10');
  expect(hud.people).toBe(5);
  expect(hud.day).toBe('Day 1');
  const npcs = await game.npcs();
  expect(npcs.filter((n) => n.job !== 'traveler')).toHaveLength(5);
  expect(npcs.filter((n) => n.job === 'traveler')).toHaveLength(3);
});

test('prompts appear near things, and they and their feedback go when leaving', async ({ game, page }) => {
  let hud = await game.standAt(...OPEN_GROUND);
  expect(hud.prompt, 'nothing in the open').toBe('');

  hud = await game.standAt(-10.3, 0.4);
  expect(hud.prompt).toMatch(/campfire/i);
  hud = await game.interact();
  expect(hud.feedback).toMatch(/warm/i);

  hud = await game.standAt(...OPEN_GROUND);
  await page.waitForTimeout(100);
  hud = await game.hud();
  expect(hud.prompt).toBe('');
  expect(hud.feedback).toBe('');

  hud = await game.standAt(-22.8, -2.4);
  expect(hud.prompt).toMatch(/wood pile/i);
  hud = await game.interact();
  expect(hud.feedback).toMatch(/0 of 10 wood/);

  const door = await page.evaluate(() => {
    const house = window.__game.interaction.items.find((i: { id: string }) => i.id === 'house-1');
    return { x: house.x, z: house.z };
  });
  hud = await game.standAt(door.x, door.z + 0.4);
  expect(hud.prompt).toMatch(/Hearth House/);
});

test('recruiting takes one payment however long E is held, and refuses when it should', async ({ game, page }) => {
  let hud = await game.standBeside('bren');
  expect(hud.prompt).toMatch(/Recruit Bren.*free/);

  // Repeated key-down events, as auto-repeat sends them.
  await page.keyboard.down('KeyE');
  await page.keyboard.down('KeyE');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(200);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(150);
  hud = await game.hud();
  expect(hud.coins, 'giving a job is free').toBe(5);
  expect((await game.npc('bren')).job).toBe('woodcutter');
  expect(hud.feedback).toMatch(/Bren is now a woodcutter/);

  hud = await game.standBeside('dunn');
  expect(hud.prompt, 'the woodcutter limit is reached').toMatch(/Talk to Dunn/);
  hud = await game.interact();
  expect(hud.feedback).toMatch(/only support 1 woodcutter/);
  expect((await game.npc('dunn')).job).toBe('villager');

  await page.evaluate(() => {
    const { state } = window.__game;
    state.resources.coins = 0;
    state.village.maxWoodcutters = 5;
  });
  hud = await game.standBeside('dunn');
  expect(hud.prompt, 'no coins are needed').toMatch(/Recruit Dunn.*free/);
  await game.interact();
  expect((await game.npc('dunn')).job).toBe('woodcutter');

  hud = await game.standBeside('alda');
  expect(hud.prompt, 'the gatherer cannot be hired').toMatch(/Talk to Alda/);
});

test('a woodcutter walks, chops and delivers in real time', async ({ game, page }) => {
  await game.setTime(0.3, true);
  await game.standBeside('bren');
  await game.interact();
  await game.teleport(...OPEN_GROUND);

  const seen = new Set<string>();
  await expect.poll(async () => {
    const state = await page.evaluate(() => {
      const n = window.__game.state.npcs.find((v: { id: string }) => v.id === 'bren');
      return { task: n.task, delivered: n.woodDelivered };
    });
    seen.add(state.task);
    return state.delivered;
  }, { timeout: 75_000, intervals: [200] }).toBeGreaterThan(0);
  for (const task of ['toTree', 'chop', 'deliver']) expect([...seen]).toContain(task);

  await page.waitForTimeout(300);
  const { wood } = await game.resources();
  expect((await game.hud()).wood, 'HUD matches state').toBe(`${wood}/10`);
  expect(wood).toBeGreaterThan(0);
});

test('villagers follow the clock: evening at the fire, night indoors, morning out', async ({ game, page }) => {
  await game.setTime(0.3, true);
  await game.standBeside('bren');
  await game.interact();
  await game.teleport(...OPEN_GROUND);

  const villagers = async (): ReturnType<typeof game.npcs> => (await game.npcs()).filter((n) => n.job !== 'traveler');

  await game.setTime(0.76, true);
  await expect.poll(async () => (await villagers()).filter((v) => Math.hypot(v.x + 10, v.z + 2) < 30).length, { timeout: 40_000, intervals: [500] }).toBe(5);

  await game.setTime(0.9, true);
  await expect.poll(async () => (await villagers()).filter((v) => v.indoors).length, { timeout: 90_000, intervals: [1000] }).toBe(5);

  const hud = await game.standAt(-16.5, -1.9);
  expect(hud.prompt, 'indoor villagers cannot be used').not.toMatch(/Recruit|Talk/);

  await game.setTime(0.36, true);
  await page.waitForTimeout(6000);
  expect((await villagers()).some((v) => !v.indoors), 'morning').toBe(true);
});

test('the day number advances at midnight', async ({ game }) => {
  await game.setTime(0.995, false);
  await expect.poll(async () => (await game.hud()).day, { timeout: 10_000 }).toBe('Day 2');
});

test('the debug tools still work', async ({ page }) => {
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__game);
  await page.waitForTimeout(800);
  const panel = page.locator('#diagnostics');
  await expect(panel).toContainText(/sim .*paths/);
  await expect(panel).toContainText('npcs ');

  const before = await page.evaluate(() => window.__game.state.time.dayTime);
  await page.keyboard.press('BracketRight');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.__game.state.time.dayTime);
  expect(after - before, '] scrubs the time').toBeGreaterThan(0.005);

  await page.keyboard.press('F3');
  await expect(panel, 'F3 hides the panel').toBeHidden();
  await page.keyboard.press('F4');
  await page.waitForTimeout(100);
  await page.keyboard.press('F4');
});
