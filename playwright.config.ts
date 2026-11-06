import { defineConfig } from '@playwright/test';

const PORT = 4174;
const GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])];
/** Frame rate unlocked, so the benchmark sees the real cost of a frame rather than a 60 FPS cap. */
const UNCAPPED_ARGS = process.env.PERF_CAPPED ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

/**
 * Browser tests against the production build, with real key presses in real Chrome.
 * They run one at a time on the real GPU, because they depend on real time passing and
 * measuring the game only means something when nothing else is competing with it.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.PERF_BASE_URL ?? `http://localhost:${PORT}`,
    // The installed Chrome, so no browser download is needed. See README for an alternative.
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    launchOptions: { args: GPU_ARGS },
  },
  projects: [
    { name: 'game', testIgnore: /perf\.spec\.ts/ },
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      use: { screenshot: 'off', launchOptions: { args: [...GPU_ARGS, ...UNCAPPED_ARGS] } },
    },
  ],
  // Always builds first, so a run can never test an old build by accident.
  // The benchmark can instead be pointed at a build that is already being served.
  webServer: process.env.PERF_BASE_URL ? undefined : {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
