import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'tests/integration/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'tests/integration/support/e2e.ts',
    fixturesFolder: 'tests/integration/fixtures',
    screenshotsFolder: 'tests/integration/screenshots',
    videosFolder: 'tests/integration/videos',
    viewportWidth: 1280,
    viewportHeight: 720,
    retries: {
      runMode: 2,
      openMode: 0,
    },
    defaultCommandTimeout: 10000,
    video: true,
    screenshotOnRunFailure: true,
    env: {
      apiUrl: 'http://localhost:3000/api',
    },
    setupNodeEvents(on, config) {
      return config;
    },
  },
});
