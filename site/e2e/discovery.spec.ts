import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const eventTitle = ":Panic :Over at Culture Night";
const eventUrl = "https://culturenight.ie/event/panic-over-at-culture-night/";

async function showMap(page: Page) {
  const toggle = page.getByRole("button", { name: "Map", exact: true });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  }
  return page.getByRole("region", { name: "Event map", exact: true });
}

async function expectWithinViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeInViewport({ ratio: 1 });
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Search events" })).toBeVisible();
});

test("search and Go keep matching results without selecting the first event", async ({ page }) => {
  const search = page.getByRole("combobox", { name: "Search events" });
  await search.fill("Belfast");
  const suggestions = page.getByRole("listbox", { name: "Matching events" });
  await expect(suggestions).toBeVisible();
  await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
  const count = page.getByRole("status").filter({ hasText: /^\d[\d,]* events$/ });
  const expectedCount = await count.innerText();
  expect(Number(expectedCount.replace(/\D/g, ""))).toBeGreaterThan(1);
  await expect(page.getByRole("region", { name: "Selected event", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Show matching events" }).click();
  await expect(suggestions).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Matching event results" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected event", exact: true })).toHaveCount(0);
  await expect(page.locator(".event-card[aria-pressed='true']")).toHaveCount(0);

  const map = await showMap(page);
  await expect(map.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
  await expect(count).toHaveText(expectedCount);
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);

  // Enter without an active suggestion is also a search, not event selection.
  await page.mouse.move(0, 0);
  await search.focus();
  await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
  await search.press("Enter");
  await expect(page.getByRole("list", { name: "Matching event results" })).toBeVisible();
  await expect(count).toHaveText(expectedCount);
  await expect(page.getByRole("region", { name: "Selected event", exact: true })).toHaveCount(0);
});

test("one matching event has matching list/map counts and a real selectable marker", async ({ page }) => {
  await page.getByRole("combobox", { name: "Search events" }).fill(eventTitle);
  await page.getByRole("button", { name: "Show matching events" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^1 event$/ })).toBeVisible();
  const results = page.getByRole("list", { name: "Matching event results" });
  await expect(results.getByRole("listitem")).toHaveCount(1);
  await expect(results.getByRole("button", { name: new RegExp(`${eventTitle}.*View event`) })).toHaveAttribute("aria-pressed", "false");

  const map = await showMap(page);
  await expect(page.getByRole("status").filter({ hasText: /^1 event$/ })).toBeVisible();
  const marker = map.getByRole("button", { name: eventTitle, exact: true });
  await expect(marker).toHaveCount(1);
  await marker.click();
  const popup = map.getByRole("article");
  await expect(popup.getByRole("heading", { name: eventTitle, exact: true })).toBeVisible();
  await expect(popup.getByRole("link", { name: "Official event listing" })).toHaveAttribute("href", eventUrl);
  await expect(page.locator(".leaflet-popup")).toHaveCount(1);
});

test("explicit suggestion selection opens that event, and Escape dismisses its popup", async ({ page }) => {
  const map = await showMap(page);
  const search = page.getByRole("combobox", { name: "Search events" });
  await search.fill(eventTitle);
  await expect(map.getByRole("button", { name: eventTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(1);
  await search.press("ArrowDown");
  await expect(page.getByRole("option", { selected: true })).toContainText(eventTitle);
  await search.press("Enter");
  await expect(map.getByRole("article").getByRole("heading", { name: eventTitle, exact: true })).toBeVisible();
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Selected event", exact: true })).toHaveCount(0);
});

test("suggestion selection from the initial list reveals the event without opening Map first", async ({ page }) => {
  await page.getByRole("combobox", { name: "Search events" }).fill(eventTitle);
  await page.getByRole("option").click();
  const map = page.getByRole("region", { name: "Event map", exact: true });
  await expect(map.getByRole("article").getByRole("heading", { name: eventTitle, exact: true })).toBeVisible();
  await expect(page.locator(".leaflet-popup")).toHaveCount(1);
});

test("rapid filtering during initial Map loading leaves only the current event selectable", async ({ page }) => {
  const map = await showMap(page);
  const search = page.getByRole("combobox", { name: "Search events" });
  for (const query of ["Belfast", "Dublin", eventTitle]) await search.fill(query);
  await search.press("Escape");
  await expect(page.getByRole("status").filter({ hasText: /^1 event$/ })).toBeVisible();
  await expect(map.getByRole("button", { name: eventTitle, exact: true })).toBeVisible();
  await expect(map.locator(".leaflet-marker-icon")).toHaveCount(1);
});

test("empty Map replaces stale details and map controls with bounded recovery actions", async ({ page }, testInfo) => {
  const search = page.getByRole("combobox", { name: "Search events" });
  await search.fill(eventTitle);
  await page.getByRole("button", { name: "Show matching events" }).click();
  const map = await showMap(page);
  await map.getByRole("button", { name: eventTitle, exact: true }).click();
  await expect(map.getByRole("article")).toBeVisible();

  await search.fill("zzzz-no-cultural-events-match-zzzz");
  await search.press("Escape");
  await showMap(page);
  await expect(page.getByRole("status").filter({ hasText: /^0 events$/ })).toBeVisible();
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Selected event", exact: true })).toHaveCount(0);

  const empty = map.getByRole("region", { name: "No map results" });
  await expect(empty.getByRole("heading", { name: "No matching events", exact: true })).toBeVisible();
  await expect(map.getByRole("button", { name: /Zoom (in|out)/ })).toHaveCount(0);
  await expect(map.getByText("Select a pin to see an event", { exact: true })).toHaveCount(0);
  await expect(map.locator(".leaflet-container")).toHaveCount(0);
  const clear = empty.getByRole("button", { name: "Clear search", exact: true });
  const reset = empty.getByRole("button", { name: "Reset filters", exact: true });
  await expectWithinViewport(clear, page);
  await expectWithinViewport(reset, page);
  await testInfo.attach("empty-map", { body: await page.screenshot(), contentType: "image/png" });

  await clear.click();
  await expect(search).toHaveValue("");
  await expect(empty).toHaveCount(0);
  await expect(map.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^0 events$/ })).toHaveCount(0);
});

test("short landscape keeps empty-map recovery inside a scrollable map panel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium-320", "One short landscape boundary is sufficient.");
  await page.setViewportSize({ width: 568, height: 320 });
  const search = page.getByRole("combobox", { name: "Search events" });
  await search.fill("zzzz-no-cultural-events-match-zzzz");
  await search.press("Escape");
  const map = await showMap(page);
  const empty = map.getByRole("region", { name: "No map results" });
  await expectWithinViewport(empty, page);
  await expect(map.getByRole("button", { name: /Zoom (in|out)/ })).toHaveCount(0);
  const clear = empty.getByRole("button", { name: "Clear search", exact: true });
  const reset = empty.getByRole("button", { name: "Reset filters", exact: true });
  await reset.scrollIntoViewIfNeeded();
  await expectWithinViewport(reset, page);
  await clear.scrollIntoViewIfNeeded();
  await expectWithinViewport(clear, page);
  await testInfo.attach("empty-map-landscape", { body: await page.screenshot(), contentType: "image/png" });
  await clear.click();
  await expect(search).toHaveValue("");
  await expect(empty).toHaveCount(0);
});
