import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import events from "../src/api/events.json";
import { programmeYear } from "../src/api/programme";
import { createStateLink, defaultUrlState } from "../src/lib/url-state";
import { filterEvents, searchEvents } from "../src/lib/event-filters";

const event = events[0];
const tiles = (page: Page) => page.locator(".night-tiles");
const map = (page: Page) => page.locator(".event-map");

function recordTiles(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/(^|\.)tile\.openstreetmap\.org$/.test(url.hostname)) requests.push(request.url());
  });
  return requests;
}

async function settleMap(page: Page) {
  await expect(map(page)).toHaveClass(/leaflet-container/);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function loadedTiles(page: Page) {
  await expect(tiles(page).locator(".leaflet-tile-loaded").first()).toBeVisible();
}

async function allTilesLoaded(page: Page) {
  await expect.poll(() => tiles(page).locator("img").evaluateAll((images) =>
    images.length > 0 && images.every((image) =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)
  )).toBe(true);
}

async function timedMap(page: Page, baseURL: string) {
  await page.clock.install({ time: new Date("2026-09-17T10:00:00Z") });
  await page.goto(createStateLink(baseURL, {
    ...defaultUrlState(), searchTerm: "Belfast", view: "map",
  }, programmeYear));
  await loadedTiles(page);
  await settleMap(page);
  await allTilesLoaded(page);
  await page.clock.pauseAt(new Date("2026-09-17T11:00:00Z"));
  await page.clock.runFor(32);
}

async function locationIsCentred(page: Page) {
  return map(page).evaluate((element) => {
    const dot = element.querySelector(".user-location");
    if (!dot) return false;
    const bounds = element.getBoundingClientRect();
    const point = dot.getBoundingClientRect();
    return Math.abs(point.x + point.width / 2 - bounds.x - bounds.width / 2) < 4 &&
      Math.abs(point.y + point.height / 2 - bounds.y - bounds.height / 2) < 4;
  });
}

test("initial List view requests no tiles on phones and visible maps use the canonical host", async ({ page, isMobile }) => {
  const requests = recordTiles(page);
  await page.goto("/");
  await settleMap(page);
  if (isMobile) {
    await expect(map(page)).toBeHidden();
    expect(requests).toEqual([]);
    await expect(tiles(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Map", exact: true }).click();
  }
  await loadedTiles(page);
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    const url = new URL(request);
    expect(url.origin).toBe("https://tile.openstreetmap.org");
    expect(url.pathname).toMatch(/^\/\d+\/\d+\/\d+\.png$/);
    expect(url.search).toBe("");
  }
  await expect(page.getByRole("link", { name: "OpenStreetMap", exact: true })).toBeVisible();
});

test("resizing into a hidden List map stops tile requests without replacing the map", async ({ page }) => {
  const requests = recordTiles(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await loadedTiles(page);
  await map(page).evaluate((element) => { element.setAttribute("data-test-map", "original"); });
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(map(page)).toBeHidden();
  await expect(tiles(page)).toHaveCount(0);
  const before = requests.length;
  await page.getByRole("combobox", { name: "Search events" }).fill("Belfast");
  await page.getByRole("button", { name: "Show matching events" }).click();
  await settleMap(page);
  expect(requests.length).toBe(before);
  await page.setViewportSize({ width: 360, height: 800 });
  await settleMap(page);
  expect(requests.length).toBe(before);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadedTiles(page);
  await expect(map(page)).toHaveAttribute("data-test-map", "original");
  await expect(page.getByRole("combobox", { name: "Search events" })).toHaveValue("Belfast");
  await expect.poll(() => requests.length).toBeGreaterThan(before);
});

test("a restored hidden selection loads no tiles and survives repeated List and Map switches", async ({ page, baseURL, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 320, height: 568 });
  const requests = recordTiles(page);
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), selectedUrl: event.url, view: "list",
  }, programmeYear));
  await settleMap(page);
  await expect(map(page)).toBeHidden();
  expect(requests).toEqual([]);
  const beforeStorage = await page.evaluate(() => ({ ...localStorage }));
  await map(page).evaluate((element) => { element.setAttribute("data-test-map", "original"); });

  for (let visit = 0; visit < 2; visit++) {
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await loadedTiles(page);
    await expect(map(page).getByRole("heading", { name: event.title, exact: true })).toBeVisible();
    await expect(map(page)).toHaveAttribute("data-test-map", "original");
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(map(page)).toBeHidden();
    await expect(tiles(page)).toHaveCount(0);
    const before = requests.length;
    await settleMap(page);
    expect(requests.length).toBe(before);
  }
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(beforeStorage);
});

test("rapid searches update results and URLs immediately but fit only after 300 ms of quiet", async ({ page, baseURL }) => {
  const requests = recordTiles(page);
  await timedMap(page, baseURL!);
  const before = requests.length;
  const search = page.getByRole("combobox", { name: "Search events" });
  const dublinCount = searchEvents(filterEvents(events, defaultUrlState()), "Dublin").length;
  await search.fill("Dublin");
  await expect(page.getByRole("status").filter({ hasText: /^[\d,]+ events$/ }))
    .toHaveText(`${dublinCount.toLocaleString("en-IE")} events`);
  expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("q")).toBe("Dublin");
  await page.clock.runFor(150);
  expect(requests.length).toBe(before);
  await search.fill("Galway");
  await page.clock.runFor(150);
  expect(requests.length).toBe(before);
  await search.fill("Dublin");
  await page.clock.runFor(299);
  expect(requests.length).toBe(before);
  await page.clock.runFor(33);
  await expect.poll(() => requests.length).toBeGreaterThan(before);
  await allTilesLoaded(page);
  const after = requests.length;
  await page.clock.runFor(1_000);
  expect(requests.length).toBe(after);
});

test("manual panning cancels a pending refit and requests tiles only after release", async ({ page, baseURL }) => {
  const requests = recordTiles(page);
  await timedMap(page, baseURL!);
  const before = requests.length;
  await page.getByRole("combobox", { name: "Search events" }).fill("Dublin");
  await page.getByRole("combobox", { name: "Search events" }).press("Escape");
  const bounds = (await map(page).boundingBox())!;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(bounds.x + bounds.width - 30, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 30, y, { steps: 12 });
  await page.clock.runFor(450);
  expect(requests.length).toBe(before);
  await page.mouse.up();
  await page.clock.runFor(32);
  await expect.poll(() => requests.length).toBeGreaterThan(before);
  await allTilesLoaded(page);
  const after = requests.length;
  await page.clock.runFor(1_000);
  expect(requests.length).toBe(after);
});

test("continuous pinch zoom skips intermediate tile levels", async ({ page, baseURL, isMobile }) => {
  test.skip(!isMobile, "Pinch requires a touch-enabled browser context.");
  const requests = recordTiles(page);
  await timedMap(page, baseURL!);
  const before = requests.length;
  const bounds = (await map(page).boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const client = await page.context().newCDPSession(page);
  const points = (radius: number) => [
    { x: x - radius, y, id: 1 }, { x: x + radius, y, id: 2 },
  ];
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(25) });
    for (const radius of [40, 60, 85, 110]) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(radius) });
      await page.clock.runFor(32);
      expect(requests.length).toBe(before);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.clock.runFor(500);
    await expect.poll(() => requests.length).toBeGreaterThan(before);
    await allTilesLoaded(page);
    const zooms = new Set(requests.slice(before).map((url) => new URL(url).pathname.split("/")[1]));
    expect(zooms.size).toBe(1);
  } finally {
    await client.detach();
  }
});

test("Near me bypasses and cancels a pending automatic refit", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 53.3498, longitude: -6.2603, accuracy: 25 });
  await timedMap(page, baseURL!);
  await page.getByRole("combobox", { name: "Search events" }).fill("Galway");
  await page.getByRole("combobox", { name: "Search events" }).press("Escape");
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(map(page).getByRole("status")).toContainText("Map centred near your location");
  await page.clock.runFor(32);
  expect(await locationIsCentred(page)).toBe(true);
  await page.clock.runFor(1_000);
  expect(await locationIsCentred(page)).toBe(true);
});

test("choosing an event cancels older camera refits", async ({ page, baseURL }) => {
  await timedMap(page, baseURL!);
  await page.getByRole("combobox", { name: "Search events" }).fill("Dublin");
  await page.clock.runFor(100);
  await page.getByRole("combobox", { name: "Search events" }).fill(event.title);
  await page.getByRole("option").click();
  await page.clock.runFor(1_000);
  await expect(map(page).getByRole("heading", { name: event.title, exact: true })).toBeVisible();
  await expect(map(page).getByRole("button", { name: event.title, exact: true })).toBeInViewport({ ratio: 1 });
  const beforeUrl = page.url();
  await page.clock.runFor(1_000);
  await expect(map(page).getByRole("heading", { name: event.title, exact: true })).toBeVisible();
  expect(page.url()).toBe(beforeUrl);
});

test("empty results cancel a pending refit without requesting its tiles", async ({ page, baseURL }) => {
  const requests = recordTiles(page);
  await timedMap(page, baseURL!);
  const before = requests.length;
  const search = page.getByRole("combobox", { name: "Search events" });
  await search.fill("Dublin");
  await page.clock.runFor(150);
  await search.fill("no-matching-events-for-this-test-xyz");
  await expect(map(page)).toHaveCount(0);
  await page.clock.runFor(1_000);
  expect(requests.length).toBe(before);
  await search.fill("Belfast");
  await page.clock.runFor(32);
  await loadedTiles(page);
});
