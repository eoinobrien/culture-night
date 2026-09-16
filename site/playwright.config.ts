import { defineConfig } from "@playwright/test";

const port = 3012;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop-chromium", use: { viewport: { width: 1440, height: 900 } } },
    ...[
      { width: 320, height: 568 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
    ].map((viewport) => ({
      name: `mobile-chromium-${viewport.width}`,
      use: { viewport, isMobile: true, hasTouch: true },
    })),
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
