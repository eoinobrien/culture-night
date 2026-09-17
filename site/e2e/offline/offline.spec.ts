import type { Page, APIRequestContext } from "@playwright/test";
import { test, expect } from "../fixtures";
import events from "../../src/api/events.json";
import { programmeYear } from "../../src/api/programme";
import { createStateLink, defaultUrlState } from "../../src/lib/url-state";
import { myNightStorageKey } from "../../src/lib/my-night";

const first = events[0];
const second = events[1];
const storageKey = myNightStorageKey(programmeYear);
const offlineIndicator = (page: Page) => page.locator(".programme-date .offline-indicator");
const myNight = (page: Page) => page.getByRole("button", { name: /^My Night,/ });
async function configure(request: APIRequestContext, change: object) {
  const response = await request.post("/__offline-test/state", { data: change });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{ criticalAsset: string; requests: { path: string; destination: string }[] }>;
}
async function ready(page: Page) {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(async () => (await readStatus(page)).ready).toBe(true);
  await expect(offlineIndicator(page)).toHaveCount(0);
}
async function readStatus(page: Page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const channel = new MessageChannel();
    const reply = new Promise<{ version: string; ready: boolean }>((resolve) => {
      channel.port1.onmessage = (event) => { channel.port1.close(); resolve(event.data); };
    });
    registration.active!.postMessage({ type: "OFFLINE_STATUS" }, [channel.port2]);
    return reply;
  });
}

async function expectOfflineList(page: Page) {
  await expect(offlineIndicator(page)).toHaveText("Offline");
  await expect(page.locator(".map-panel")).toBeHidden();
  await expect(page.locator(".leaflet-marker-icon:visible, .map-caption:visible, .map-location-controls:visible")).toHaveCount(0);
  await expect(page.locator(".night-tiles")).toHaveCount(0);
  await expect(page.locator(".event-image, .image-placeholder")).toHaveCount(0);
  await expect(page.locator(".results-panel")).toBeVisible();
  const workspace = (await page.locator(".discovery-workspace").boundingBox())!;
  const results = (await page.locator(".results-panel").boundingBox())!;
  expect(results.width).toBe(workspace.width);
  for (const card of (await page.locator(".event-card").all()).slice(0, 2)) {
    const bounds = (await card.boundingBox())!;
    const body = (await card.locator(".event-card-body").boundingBox())!;
    const border = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      return { left: parseFloat(style.borderLeftWidth), right: parseFloat(style.borderRightWidth), top: parseFloat(style.borderTopWidth) };
    });
    expect(body.x - bounds.x).toBe(border.left);
    expect(body.y - bounds.y).toBe(border.top);
    expect(bounds.width - body.width).toBe(border.left + border.right);
  }
}

test.beforeEach(async ({ request }) => {
  await configure(request, { version: "a", failure: "none", clearRequests: true });
});

test("complete guide survives offline reload, My Night edits and unvisited shared links without tiles", async ({ page, context, baseURL, request }) => {
  await page.goto("/");
  await ready(page);
  const requests = await configure(request, {});
  expect(requests.requests.some((entry) => entry.path === `/1/${programmeYear}/` || entry.path === `/1/${programmeYear}/index.html`)).toBe(true);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (await Promise.all(keys.map(async (key) => (await (await caches.open(key)).keys()).map((entry) => entry.url)))).flat();
  });
  expect(cached.some((url) => url.includes("_next/static/chunks"))).toBe(true);
  expect(cached.every((url) => new URL(url).origin === baseURL)).toBe(true);
  expect(cached.some((url) => /tile\.openstreetmap|culturenight\.ie|wp-content|cdn-cgi/.test(url))).toBe(false);
  await page.getByRole("combobox", { name: "Search events" }).fill(first.title);
  await page.getByRole("button", { name: "Show matching events" }).click();
  await page.getByRole("button", { name: `Save ${first.title} to My Night`, exact: true }).click();

  await context.setOffline(true);
  await page.reload();
  await expect(offlineIndicator(page)).toHaveText("Offline");
  await expect(myNight(page)).toHaveAccessibleName("My Night, 1 saved event");
  await page.getByRole("combobox", { name: "Search events" }).fill("Belfast");
  await page.getByRole("button", { name: "Show matching events" }).click();
  await expect(page.locator(".results-heading [role=status]")).toContainText("186 events");
  await myNight(page).click();
  await page.locator(".event-card").click();
  const details = page.locator(".unmapped-details");
  await expect(details.getByRole("heading", { name: first.title, exact: true })).toBeVisible();
  await details.getByText("Full description", { exact: true }).click();
  await expect(details).toContainText(first.description);
  await details.getByText("Address, age and accessibility", { exact: true }).click();
  await expect(details).toContainText(first.fullAddress);
  await expect(details).toContainText("Google Maps need internet");
  await expectOfflineList(page);
  await expect(page.locator(".event-image img")).toHaveCount(0);

  const shared = await context.newPage();
  await shared.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "shared", sharedUrls: [second.url, first.url], sort: "custom",
    selectedUrl: second.url, view: "map",
  }, programmeYear));
  await expectOfflineList(shared);
  await expect(shared.locator(".unmapped-details")).toContainText(second.title);
  expect(await shared.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey)).toEqual([first.url]);
  await shared.getByRole("button", { name: "Add all to My Night", exact: true }).click();
  await myNight(shared).click();
  await shared.getByLabel("Sort events").selectOption("title");
  await shared.reload();
  await expect(myNight(shared)).toHaveAccessibleName("My Night, 2 saved events");
  await expect(shared.getByLabel("Sort events")).toHaveValue("title");
  await shared.getByRole("button", { name: `Remove ${first.title} from My Night`, exact: true }).click();
  await shared.reload();
  await expect(myNight(shared)).toHaveAccessibleName("My Night, 1 saved event");
  await context.setOffline(false);
  await expect(offlineIndicator(shared)).toHaveCount(0);
  await expect(shared.locator(".event-image img").first()).toBeVisible();
});

test("disconnecting an open map hides all pins and controls without losing selection or saved events", async ({ page, context, baseURL, isMobile }, testInfo) => {
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), selectedUrl: first.url, view: "map",
  }, programmeYear));
  await ready(page);
  await expect(page.locator(".event-popup")).toBeVisible();
  await page.locator(".event-popup").getByRole("button", { name: `Save ${first.title} to My Night`, exact: true }).click();
  await page.locator(".event-map").evaluate((element) => { element.setAttribute("data-original-map", "yes"); });

  await context.setOffline(true);
  await expectOfflineList(page);
  await expect(page.locator(".unmapped-details")).toContainText(first.title);
  await expect(myNight(page)).toHaveAccessibleName("My Night, 1 saved event");
  await page.locator(".event-card").first().scrollIntoViewIfNeeded();
  const screenshot = testInfo.outputPath("offline-list-only.png");
  await page.screenshot({ path: screenshot });
  await testInfo.attach("offline-list-only", { path: screenshot, contentType: "image/png" });
  await page.setViewportSize({ width: 1000, height: 700 });
  await expectOfflineList(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await expectOfflineList(page);
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });

  await context.setOffline(false);
  await expect(offlineIndicator(page)).toHaveCount(0);
  await expect(page.locator(".event-image img").first()).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".event-map")).toBeVisible();
  await expect(page.locator(".night-tiles .leaflet-tile-loaded").first()).toBeVisible();
  await expect(page.locator(".event-popup")).toContainText(first.title);
  await expect(page.locator(".event-map")).toHaveAttribute("data-original-map", "yes");
  await expect(myNight(page)).toHaveAccessibleName("My Night, 1 saved event");

  await context.setOffline(true);
  await page.reload();
  await expectOfflineList(page);
  await expect(page.locator(".unmapped-details")).toContainText(first.title);
  await expect(myNight(page)).toHaveAccessibleName("My Night, 1 saved event");
});

test("offline root, programme query and unsupported programme retain their real route meanings", async ({ page, context }) => {
  await page.goto("/");
  await ready(page);
  await context.setOffline(true);
  for (const url of ["/?source=offline", `/1/${programmeYear}/?source=offline`]) {
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    await expect(offlineIndicator(page)).toHaveText("Offline");
    await expect(myNight(page)).toBeEnabled();
  }
  const missing = await page.goto("/1/1900/");
  expect(missing?.status()).toBe(404);
  await expect(myNight(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

for (const failure of ["fail", "hang", "corrupt"]) {
  test(`incomplete ${failure} download is logged and automatically retried on reconnect`, async ({ page, context, request }) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await configure(request, { failure });
    await page.goto("/");
    await expect.poll(() => errors.some((message) => message.includes("Could not prepare the offline event guide")), { timeout: 45_000 }).toBe(true);
    await expect(offlineIndicator(page)).toHaveCount(0);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(false);
    await expect(myNight(page)).toBeEnabled();
    await context.setOffline(true);
    await configure(request, { failure: "none" });
    await context.setOffline(false);
    await ready(page);
  });
}

test("background retries back off after failure without user interaction", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.clock.install({ time: new Date("2026-09-17T20:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-17T20:00:01Z"));
  await page.addInitScript(() => {
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    let attempts = 0;
    navigator.serviceWorker.register = async (...args) => {
      if (++attempts <= 2) throw new Error("Temporary offline storage failure");
      return register(...args);
    };
  });
  await page.goto("/");
  const failures = () => errors.filter((message) => message.includes("Temporary offline storage failure")).length;
  await expect.poll(failures).toBe(1);
  await expect(offlineIndicator(page)).toHaveCount(0);
  await page.clock.fastForward(29_000);
  expect(failures()).toBe(1);
  await page.clock.fastForward(1_000);
  await expect.poll(failures).toBe(2);
  await page.clock.fastForward(59_000);
  expect(failures()).toBe(2);
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(false);
  await page.clock.fastForward(1_000);
  await ready(page);
});

test("an evicted essential asset is detected and automatically repaired without losing My Night", async ({ page, context }) => {
  await page.goto("/");
  await ready(page);
  await page.locator(".event-results .save-event-button").first().click();
  await context.setOffline(true);
  await page.evaluate(async () => {
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      const request = (await cache.keys()).find((request) => request.url.includes(".woff"));
      if (request) await cache.delete(request);
    }
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await readStatus(page)).ready).toBe(false);
  await expect(offlineIndicator(page)).toHaveAttribute("title", /not been saved completely/);
  await context.setOffline(false);
  await ready(page);
  await expect(myNight(page)).toHaveAccessibleName("My Night, 1 saved event");
});

test("failed updates keep the complete old guide; completed updates wait without reloading", async ({ page, context, request }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await ready(page);
  await page.locator(".event-results .save-event-button").first().click();
  const old = await readStatus(page);
  await page.evaluate(() => { document.body.dataset.originalVisit = "yes"; });
  await configure(request, { version: "b", failure: "fail" });
  await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
  await expect.poll(() => errors.some((message) => message.includes("Could not prepare the offline event guide"))).toBe(true);
  await expect(offlineIndicator(page)).toHaveCount(0);
  expect((await readStatus(page)).version).toBe(old.version);
  expect((await readStatus(page)).ready).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(offlineIndicator(page)).toHaveText("Offline");
  await expect(myNight(page)).toHaveAccessibleName("My Night, 1 saved event");
  await page.evaluate(() => { document.body.dataset.originalVisit = "yes"; });
  await configure(request, { failure: "none" });
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe("installed");
  await expect(offlineIndicator(page)).toHaveCount(0);
  expect((await readStatus(page)).version).toBe(old.version);
  await expect(myNight(page)).toHaveAccessibleName("My Night, 1 saved event");
  expect(await page.locator("body").getAttribute("data-original-visit")).toBe("yes");
  await page.getByRole("combobox", { name: "Search events" }).fill("Belfast");
  expect(await page.locator("body").getAttribute("data-original-visit")).toBe("yes");
  const activation = Promise.any(context.serviceWorkers().map((worker) => worker.evaluate(() =>
    new Promise((resolve) => globalThis.addEventListener("activate", () => resolve(true), { once: true })))));
  await page.close();
  await activation;
  const reopened = await context.newPage();
  await reopened.goto("/");
  await ready(reopened);
  expect((await readStatus(reopened)).version).not.toBe(old.version);
  await expect(myNight(reopened)).toHaveAccessibleName("My Night, 1 saved event");
});

test("failed online tiles offer complete text details without following an external link", async ({ page, context, baseURL }) => {
  await context.route("https://tile.openstreetmap.org/**", (route) => route.abort("failed"));
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "event", selectedUrl: first.url, view: "map",
  }, programmeYear));
  await ready(page);
  const fallback = page.locator(".map-connectivity");
  await expect(fallback).toContainText("Map tiles could not load");
  await fallback.getByRole("button", { name: "Read event details in List", exact: true }).click();
  const selected = page.locator(".selected-result");
  await selected.getByText("Read event details without the map", { exact: true }).click();
  await selected.getByText("Full description", { exact: true }).click();
  await expect(selected).toContainText(first.description);
  await selected.getByText("Address, age and accessibility", { exact: true }).click();
  await expect(selected).toContainText(first.fullAddress);
});

test("blocked offline storage is logged without adding online UI or blocking discovery", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => {
    navigator.serviceWorker.register = async () => { throw new DOMException("Storage blocked for this test", "SecurityError"); };
  });
  await page.goto("/");
  await expect.poll(() => errors.some((message) => message.includes("Storage blocked"))).toBe(true);
  await expect(offlineIndicator(page)).toHaveCount(0);
  await expect(page.locator(".offline-guide")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Search events" }).fill("Belfast");
  await page.getByRole("button", { name: "Show matching events" }).click();
  await expect(page.locator(".results-heading [role=status]")).toContainText("186 events");
});

test("the icon and Offline label sit beside the date and disappear online without adding a row", async ({ page, context }, testInfo) => {
  await page.goto("/");
  await ready(page);
  for (const viewport of [
    { width: 320, height: 568 }, { width: 360, height: 800 }, { width: 390, height: 844 },
    { width: 568, height: 320 }, { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await context.setOffline(false);
    await expect(offlineIndicator(page)).toHaveCount(0);
    const before = (await page.locator(".app-header").boundingBox())!;
    await context.setOffline(true);
    await expect(offlineIndicator(page)).toHaveText("Offline");
    await expect(offlineIndicator(page).locator("svg")).toBeVisible();
    const date = (await page.locator(".programme-date > span").first().boundingBox())!;
    const badge = (await offlineIndicator(page).boundingBox())!;
    const after = (await page.locator(".app-header").boundingBox())!;
    expect(Math.abs(badge.y + badge.height / 2 - date.y - date.height / 2)).toBeLessThan(2);
    expect(badge.x).toBeGreaterThanOrEqual(date.x + date.width);
    expect(badge.x + badge.width).toBeLessThanOrEqual(viewport.width);
    expect(after.height).toBe(before.height);
    await expect(page.locator(".offline-guide")).toHaveCount(0);
    if (viewport.width === 320) await testInfo.attach("offline-header-320", { body: await page.screenshot(), contentType: "image/png" });
  }
  await context.setOffline(false);
  await expect(offlineIndicator(page)).toHaveCount(0);
});
