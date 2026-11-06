import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the production build can be hosted from any sub-directory.
  base: './',
  build: {
    target: 'es2022',
    // Three.js alone is larger than Vite's default warning threshold.
    chunkSizeWarningLimit: 1000,
  },
  // The browser tests in e2e/ belong to Playwright.
  test: { include: ['src/**/*.test.ts'] },
});
