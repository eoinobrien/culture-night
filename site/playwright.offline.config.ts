import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/offline",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/offline" }]],
  use: {
    baseURL: "http://127.0.0.1:3014",
    browserName: "chromium",
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "offline-desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "offline-phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "node e2e/offline/server.mjs",
    url: "http://127.0.0.1:3014/__offline-test/state",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
