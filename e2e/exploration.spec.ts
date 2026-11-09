import { expect, test } from './helpers';

test.use({ viewport: { width: 1600, height: 900 } });

test.beforeEach(async ({ game }) => {
  await game.openBridge();
  await game.setTime(0.3, true);
});

test('the road north leads out of the valley, past where the barrier used to be', async ({ game }) => {
  await game.teleport(5.6, 0);
  await game.hold(['ShiftLeft', 'KeyW'], 5000);
  expect((await game.player()).z).toBeLessThan(-15);
  expect(await game.page.evaluate(() => window.__game.state.exploration.landmarks.find((l: { id: string }) => l.id === 'ruins').discovered), 'found the ruins on the way').toBe(true);
});

test('the forest stops the player at the valley\'s old edges', async ({ game, page }) => {
  await game.teleport(-60, -5);
  await page.waitForTimeout(100);
  await game.hold(['KeyW'], 2200);
  const north = (await game.player()).z;
  expect(north).toBeGreaterThan(-10);
  expect(north).toBeLessThan(-7.5);

  await game.teleport(-60, 5);
  await page.waitForTimeout(100);
  await game.hold(['KeyS'], 2200);
  const south = (await game.player()).z;
  expect(south).toBeLessThan(8.5);
  expect(south).toBeGreaterThan(6);

  await game.teleport(26, -6);
  await page.waitForTimeout(100);
  await game.hold(['KeyD'], 2500);
  expect((await game.player()).x, 'the river still blocks').toBeLessThan(30);
});

test('a chest pays its fixed coins once, and stays empty afterward', async ({ game, page }) => {
  const start = (await game.hud()).coins;
  const chest = await page.evaluate(() => {
    const item = window.__game.interaction.items.find((i: { id: string }) => i.id === 'chest-ruins');
    return { x: item.x, z: item.z };
  });
  const beside = [chest.x + 1.2, chest.z + 1] as const;

  let hud = await game.standAt(...beside);
  expect(hud.prompt).toBe('Open the chest');
  hud = await game.interact();
  expect(hud.coins).toBe(start + 5);
  expect(hud.feedback).toMatch(/found 5 coins/);

  hud = await game.interact();
  expect(hud.coins, 'a second press pays nothing').toBe(start + 5);
  expect(hud.feedback).toMatch(/Empty/);

  await game.standAt(-16, 1);
  hud = await game.standAt(...beside);
  expect(hud.prompt).toBe('Look in the empty chest');
  hud = await game.interact();
  expect(hud.coins, 'coming back pays nothing').toBe(start + 5);
});

test('a landmark announces itself once and can be examined', async ({ game }) => {
  await game.teleport(-52, -29);
  await expect.poll(async () => (await game.hud()).notice).toMatch(/Quiet Glade/);

  let hud = await game.standAt(3, -35.2);
  expect(hud.prompt).toMatch(/inscription/);
  hud = await game.interact();
  expect(hud.feedback).toMatch(/flame/);
});

test('a traveler refuses without coins, then walks over the bridge and settles', async ({ game, page }) => {
  // Waiting travelers far from the player are not simulated, and wake up nearby.
  expect((await game.npc('wren')).dormant, 'asleep while far away').toBe(true);

  await game.setResources({ coins: 1 });
  await game.teleport(67, -34);
  await expect.poll(async () => (await game.npc('wren')).dormant).toBe(false);

  // Tobin is moved aside, so that only Wren is in range.
  await page.evaluate(() => {
    const tobin = window.__game.state.npcs.find((n: { id: string }) => n.id === 'tobin');
    tobin.x = tobin.prevX = 75;
    tobin.z = tobin.prevZ = -33;
    tobin.attentionTimer = 5;
  });
  let hud = await game.standBeside('wren');
  expect(hud.prompt).toMatch(/Invite Wren.*2 coins/);
  expect(hud.blocked, 'dimmed when unaffordable').toBe(true);

  hud = await game.interact();
  expect(hud.coins).toBe(1);
  expect(hud.feedback).toMatch(/2 coins/);
  expect((await game.npc('wren')).phase).toBe('waiting');

  await game.setResources({ coins: 4 });
  await game.standBeside('wren');
  hud = await game.interact();
  expect(hud.coins, 'exactly 2 coins').toBe(2);
  expect(hud.feedback).toMatch(/sets off/);
  expect(hud.people, 'not a villager yet').toBe(5);

  // Follow the journey in real time. How far someone may move depends on the time between samples.
  let previous = await game.npc('wren');
  let previousTime = Date.now();
  let crossedBridge = false;
  const deadline = Date.now() + 170_000;
  while (previous.phase === 'journey') {
    expect(Date.now(), `still walking at ${previous.x.toFixed(1)}, ${previous.z.toFixed(1)}`).toBeLessThan(deadline);
    await page.waitForTimeout(250);
    const now = await game.npc('wren');
    const time = Date.now();
    const allowed = ((time - previousTime) / 1000) * 5 + 0.5;
    expect(Math.hypot(now.x - previous.x, now.z - previous.z), 'no teleporting').toBeLessThan(allowed);
    if (Math.abs(now.x - 34) < 5.6) {
      crossedBridge = true;
      expect(Math.abs(now.z), 'on the bridge while over the river').toBeLessThan(1.9);
    }
    previous = now;
    previousTime = time;
    await game.teleport(now.x + 2, now.z + 3);
  }
  expect(crossedBridge).toBe(true);
  expect(previous.phase).toBe('settled');
  await expect.poll(async () => (await game.hud()).notice).toMatch(/Wren has reached/);
  expect((await game.hud()).people, 'counted once arrived').toBe(6);

  hud = await game.standBeside('wren');
  expect(hud.prompt, 'can now be hired').toMatch(/Recruit Wren as a woodcutter/);
  await game.interact();
  expect((await game.npc('wren')).job).toBe('woodcutter');
});
