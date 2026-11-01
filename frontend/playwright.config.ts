import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (Playwright) against the mock builds: the apps run in the browser with the MSW
 * contract mocks (VITE_USE_MOCKS, `--mode mock`), so no backend is needed. `pnpm e2e` builds and
 * previews staff-web in mock mode; run `pnpm e2e:install` once for the browser.
 */
const STAFF_PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${STAFF_PORT}`,
    locale: "en-GB",
    timezoneId: "Africa/Kigali",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "pnpm --filter @medilink/staff-web build:mock && pnpm --filter @medilink/staff-web preview",
    url: `http://localhost:${STAFF_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
