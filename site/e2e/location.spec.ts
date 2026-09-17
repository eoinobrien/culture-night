import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import events from "../src/api/events.json";
import { myNightStorageKey } from "../src/lib/my-night";
import { programmeYear } from "../src/api/programme";

declare global {
  interface Window {
    locationTest: {
      calls: number;
      options?: PositionOptions;
      succeed?: () => void;
    };
  }
}

const event = events[0];
const key = myNightStorageKey(programmeYear);
const nearMe = (page: Page) => page.getByRole("button", { name: "Near me", exact: true });
const map = (page: Page) => page.getByRole("region", { name: "Event map", exact: true });

async function prepare(page: Page, mode: "success" | "pending" | "unavailable" | "invalid" | 1 | 2 | 3 = "success") {
  await page.addInitScript(({ mode, key, url }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify([url]));
    window.locationTest = { calls: 0 };
    const geolocation: Pick<Geolocation, "getCurrentPosition"> = {
      getCurrentPosition: (success, failure, options) => {
        window.locationTest.calls++;
        window.locationTest.options = options;
        const succeed = () => {
          const coords = {
            latitude: mode === "invalid" ? NaN : 53.3498, longitude: -6.2603, accuracy: 25,
            altitude: null, altitudeAccuracy: null, heading: null, speed: null,
            toJSON() { return { latitude: this.latitude, longitude: this.longitude, accuracy: this.accuracy }; },
          };
          const position = { coords, timestamp: Date.now(), toJSON() { return { coords: this.coords, timestamp: this.timestamp }; } };
          success(position);
        };
        window.locationTest.succeed = succeed;
        if (typeof mode === "number") {
          setTimeout(() => failure?.({ code: mode, message: "Simulated location error",
            PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }), 0);
        } else if (mode !== "pending") {
          setTimeout(succeed, 0);
        }
      },
    };
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: mode === "unavailable" ? undefined : geolocation });
  }, { mode, key, url: event.url });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^My Night,/ })).toBeEnabled();
}

async function showMap(page: Page) {
  const button = page.getByRole("button", { name: "Map", exact: true });
  if (await button.isVisible()) await button.click();
  await expect(nearMe(page)).toBeVisible();
}

test("Near me locates once, centres the map and never changes filters, URLs or saved plans", async ({ page, isMobile }, testInfo) => {
  await prepare(page);
  await page.getByRole("combobox", { name: "Search events" }).fill("Belfast");
  await page.getByRole("button", { name: "Show matching events" }).click();
  await showMap(page);
  expect(await page.evaluate(() => window.locationTest.calls)).toBe(0);
  const beforeUrl = page.url();
  const beforeStorage = await page.evaluate(() => ({ ...localStorage }));
  const count = await page.getByRole("status").filter({ hasText: /^[\d,]+ events$/ }).innerText();
  if (isMobile) await nearMe(page).tap();
  else await nearMe(page).click();
  await expect(map(page).getByRole("status")).toContainText("Map centred near your location");
  await expect(map(page).locator(".user-location")).toBeInViewport({ ratio: 1 });
  const bounds = await nearMe(page).boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  const centred = await map(page).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const dot = element.querySelector(".user-location")!.getBoundingClientRect();
    return Math.abs(dot.x + dot.width / 2 - bounds.x - bounds.width / 2) < 4 &&
      Math.abs(dot.y + dot.height / 2 - bounds.y - bounds.height / 2) < 4;
  });
  expect(centred).toBe(true);
  expect(await page.evaluate(() => window.locationTest)).toMatchObject({
    calls: 1, options: { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
  });
  await expect(page.getByRole("combobox", { name: "Search events" })).toHaveValue("Belfast");
  await expect(page.getByRole("status").filter({ hasText: /^[\d,]+ events$/ })).toHaveText(count);
  expect(page.url()).toBe(beforeUrl);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(beforeStorage);
  await testInfo.attach("near-me-map", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("combobox", { name: "Search events" }).fill(event.title);
  await expect(map(page).getByRole("button", { name: event.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear location and show all results" }).click();
  await expect(map(page).locator(".user-location")).toHaveCount(0);
  await expect(map(page).getByRole("button", { name: event.title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.locationTest.calls)).toBe(1);
  await page.reload();
  await showMap(page);
  expect(await page.evaluate(() => window.locationTest.calls)).toBe(0);
  await expect(map(page).locator(".user-location")).toHaveCount(0);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(beforeStorage);
});

test("a cancelled location request cannot move the map when its response arrives late", async ({ page }) => {
  await prepare(page, "pending");
  await showMap(page);
  await nearMe(page).click();
  await expect(nearMe(page)).toBeDisabled();
  await expect(nearMe(page)).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => window.locationTest.calls)).toBe(1);
  await page.getByRole("button", { name: "Cancel location lookup" }).click();
  await page.evaluate(() => window.locationTest.succeed?.());
  await expect(nearMe(page)).toBeEnabled();
  await expect(map(page).locator(".user-location")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear location and show all results" })).toHaveCount(0);
});

test("choosing an event cancels an older pending location request", async ({ page }) => {
  await prepare(page, "pending");
  await showMap(page);
  await nearMe(page).click();
  await page.getByRole("combobox", { name: "Search events" }).fill(event.title);
  await page.getByRole("option").click();
  const popup = map(page).getByRole("article");
  await expect(popup.getByRole("heading", { name: event.title, exact: true })).toBeVisible();
  await expect(nearMe(page)).toBeEnabled();
  const selectedUrl = page.url();
  await page.evaluate(() => window.locationTest.succeed?.());
  await expect(map(page).locator(".user-location")).toHaveCount(0);
  await expect(popup.getByRole("heading", { name: event.title, exact: true })).toBeVisible();
  expect(page.url()).toBe(selectedUrl);
});

test("Near me can leave an open event without its popup pulling the map back", async ({ page }) => {
  await prepare(page);
  await page.getByRole("combobox", { name: "Search events" }).fill(event.title);
  await page.getByRole("option").click();
  await expect(map(page).getByRole("article")).toBeVisible();
  await nearMe(page).click();
  await expect(map(page).getByRole("article")).toHaveCount(0);
  await expect(map(page).getByRole("status")).toContainText("Map centred near your location");
  await expect(map(page).locator(".user-location")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.locationTest.calls)).toBe(1);
});

test("a location response after the map unmounts is ignored", async ({ page }) => {
  await prepare(page, "pending");
  await showMap(page);
  await nearMe(page).click();
  await page.getByRole("combobox", { name: "Search events" }).fill("no-events-for-this-search-xyz");
  await expect(nearMe(page)).toHaveCount(0);
  await page.evaluate(() => window.locationTest.succeed?.());
  await map(page).getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(nearMe(page)).toBeVisible();
  await expect(map(page).locator(".user-location")).toHaveCount(0);
  expect(await page.evaluate(() => window.locationTest.calls)).toBe(1);
});

test("cancelling a location lookup preserves the open event", async ({ page }) => {
  await prepare(page, "pending");
  await page.getByRole("combobox", { name: "Search events" }).fill(event.title);
  await page.getByRole("option").click();
  const popup = map(page).getByRole("article");
  await expect(popup).toBeVisible();
  const beforeUrl = page.url();
  await nearMe(page).click();
  await page.getByRole("button", { name: "Cancel location lookup" }).click();
  await expect(popup).toBeVisible();
  await page.evaluate(() => window.locationTest.succeed?.());
  await expect(map(page).locator(".user-location")).toHaveCount(0);
  expect(page.url()).toBe(beforeUrl);
});

for (const [mode, message] of [
  [1, "permission was denied"], [2, "could not be found"], [3, "timed out"],
  ["unavailable", "unavailable in this browser"], ["invalid", "could not be used"],
] as const) {
  test(`Near me reports ${mode} without changing the current plan`, async ({ page }) => {
    await prepare(page, mode);
    await showMap(page);
    const before = await page.evaluate(() => ({ ...localStorage }));
    await nearMe(page).click();
    const error = map(page).getByRole("alert");
    await expect(error).toContainText(message);
    await expect(error).toBeInViewport({ ratio: 1 });
    await expect(nearMe(page)).toBeEnabled();
    await expect(map(page).locator(".user-location")).toHaveCount(0);
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
    await page.getByRole("button", { name: "Dismiss location message" }).click();
    await expect(error).toHaveCount(0);
  });
}

test("an empty map does not offer or request location", async ({ page }) => {
  await prepare(page);
  await page.getByRole("combobox", { name: "Search events" }).fill("no-events-for-this-search-xyz");
  const button = page.getByRole("button", { name: "Map", exact: true });
  if (await button.isVisible()) await button.click();
  await expect(map(page).getByRole("heading", { name: "No matching events" })).toBeVisible();
  await expect(nearMe(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.locationTest.calls)).toBe(0);
});
