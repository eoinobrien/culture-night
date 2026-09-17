import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import events from "../src/api/events.json";
import { programmeYear } from "../src/api/programme";
import { myNightStorageKey } from "../src/lib/my-night";

const key = myNightStorageKey(programmeYear);
const evening = events[0];
const booked = events.find((event) => event.title.includes("Taking the Long Road"));
const late = events.find((event) => event.startTime.hour === 23);
if (!booked?.bookingLink || !late) throw new Error("My Night browser fixtures are missing from this programme.");
const bookingEvent = booked;
const bookingUrl = booked.bookingLink;
const lateEvent = late;

const myNightButton = (page: Page) => page.getByRole("button", { name: /^My Night,/ });
const saveButton = (page: Page, title: string) => page.getByRole("button", { name: `Save ${title} to My Night`, exact: true });
const removeButton = (page: Page, title: string) => page.getByRole("button", { name: `Remove ${title} from My Night`, exact: true });

async function activate(button: Locator, touch: boolean) {
  if (touch) await button.tap();
  else await button.click();
}

async function findEvent(page: Page, title: string, touch: boolean) {
  await page.getByRole("combobox", { name: "Search events" }).fill(title);
  await activate(page.getByRole("button", { name: "Show matching events" }), touch);
  await expect(page.locator(".event-card")).toHaveCount(1);
}

test("save, refresh, chronological My Night and removal preserve booking access", async ({ page, isMobile }) => {
  await page.goto("/");
  for (const event of [lateEvent, evening, bookingEvent]) {
    await findEvent(page, event.title, isMobile);
    const save = saveButton(page, event.title);
    const bounds = await save.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    await activate(save, isMobile);
    await expect(removeButton(page, event.title)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  }
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 3 saved events");
  await page.reload();
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 3 saved events");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), key))
    .toEqual([lateEvent.url, evening.url, bookingEvent.url]);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Booking details", { exact: true }).selectOption("No Booking Required");
  await page.getByRole("button", { name: "Close filters", exact: true }).click();
  await page.getByRole("combobox", { name: "Search events" }).fill("no-discovery-results-xyz");
  await activate(myNightButton(page), isMobile);
  const saved = page.getByRole("list", { name: "Saved event results" });
  await expect(saved.locator(".event-title")).toHaveText([bookingEvent.title, evening.title, lateEvent.title]);
  await expect(saved.locator(".featured-event")).toHaveCount(0);
  await expect(saved.locator(".event-card button")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Search events" })).toHaveCount(0);

  await activate(saved.locator(".event-card").first(), isMobile);
  const popup = page.locator(".event-popup");
  await expect(popup.getByRole("heading", { name: bookingEvent.title, exact: true })).toBeVisible();
  await expect(popup.getByRole("link", { name: "View booking", exact: true })).toHaveAttribute("href", bookingUrl);
  await activate(popup.getByRole("button", { name: `Remove ${bookingEvent.title} from My Night`, exact: true }), isMobile);
  await expect(popup).toHaveCount(0);
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 2 saved events");
  if (isMobile) await page.getByRole("button", { name: "List", exact: true }).tap();
  for (const event of [evening, lateEvent]) {
    await activate(removeButton(page, event.title), isMobile);
  }
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 0 saved events");
  const empty = page.getByRole("region", { name: "No saved events", exact: true });
  await expect(empty.getByRole("heading", { name: "No saved events yet" })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), key)).toEqual([]);
  if (isMobile) await page.getByRole("button", { name: "Map", exact: true }).tap();
  const emptyMap = page.getByRole("region", { name: "Event map", exact: true });
  await expect(emptyMap.getByRole("heading", { name: "No saved events yet" })).toBeVisible();
  await expect(emptyMap.getByRole("button", { name: /Zoom (in|out)/ })).toHaveCount(0);
  await expect(emptyMap.getByRole("button", { name: "Browse events", exact: true })).toBeInViewport({ ratio: 1 });
  await activate(emptyMap.getByRole("button", { name: "Browse events", exact: true }), isMobile);
  await expect(page.getByRole("combobox", { name: "Search events" })).toHaveValue("no-discovery-results-xyz");
});

test("saving from a popup leaves it open and survives List/Map switching", async ({ page, isMobile }, testInfo) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search events" }).fill(evening.title);
  await page.getByRole("option").click();
  const popup = page.locator(".event-popup");
  await expect(popup.getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  await activate(popup.getByRole("button", { name: `Save ${evening.title} to My Night`, exact: true }), isMobile);
  await expect(popup.getByRole("button", { name: `Remove ${evening.title} from My Night`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 1 saved event");
  await expect(popup.getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "My Night tip", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "My Night tip", exact: true })).toHaveCount(0);
  await expect(popup.getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  await activate(myNightButton(page), isMobile);
  await expect(page.getByRole("list", { name: "Saved event results" }).locator(".event-title")).toHaveText([evening.title]);
  await testInfo.attach("my-night-list", { body: await page.screenshot(), contentType: "image/png" });
  if (isMobile) {
    await page.getByRole("button", { name: "Map", exact: true }).tap();
    await expect(page.getByRole("region", { name: "Event map", exact: true }).getByRole("button", { name: evening.title, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "List", exact: true }).tap();
    await expect(page.getByRole("list", { name: "Saved event results" })).toBeVisible();
  }
  await page.reload();
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 1 saved event");
});

test("the first-save tip explains customising and sharing without stealing focus or repeating", async ({ page, isMobile }) => {
  await page.goto("/");
  const tip = page.getByRole("region", { name: "My Night tip", exact: true });
  await expect(myNightButton(page)).toBeEnabled();
  await expect(tip).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(`${key}:tip-seen`), key)).toBeNull();
  await findEvent(page, evening.title, isMobile);
  await activate(saveButton(page, evening.title), isMobile);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Open My Night to customise the order and share your plan.");
  await expect(myNightButton(page)).toHaveAttribute("aria-describedby", "my-night-tip-message");
  await expect(page.getByRole("button", { name: "Dismiss My Night tip", exact: true })).not.toBeFocused();
  const geometry = await tip.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const close = element.querySelector("button")!;
    return { inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
      width: close.offsetWidth, height: close.offsetHeight };
  });
  expect(geometry.inside).toBe(true);
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  await activate(page.getByRole("button", { name: "Dismiss My Night tip", exact: true }), isMobile);
  await expect(tip).toHaveCount(0);
  await expect(myNightButton(page)).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(`${key}:tip-seen`), key)).toBe("1");
  await activate(removeButton(page, evening.title), isMobile);
  await page.reload();
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 0 saved events");
  await activate(saveButton(page, evening.title), isMobile);
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 1 saved event");
  await expect(tip).toHaveCount(0);
});

test("changes synchronise between tabs and storage clearing removes the shortlist", async ({ page, context, isMobile }) => {
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await expect(myNightButton(other)).toBeEnabled();
  await findEvent(page, evening.title, isMobile);
  await activate(saveButton(page, evening.title), isMobile);
  await expect(myNightButton(other)).toHaveAccessibleName("My Night, 1 saved event");
  await findEvent(other, bookingEvent.title, isMobile);
  await activate(saveButton(other, bookingEvent.title), isMobile);
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 2 saved events");
  await activate(removeButton(page, evening.title), isMobile);
  await expect(myNightButton(other)).toHaveAccessibleName("My Night, 1 saved event");
  await other.evaluate(() => localStorage.clear());
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 0 saved events");
  await other.close();
});

test("restoration is programme-scoped and unavailable saved events can be removed explicitly", async ({ page, isMobile }) => {
  await page.addInitScript(({ key, oldKey, url }) => {
    localStorage.setItem(oldKey, JSON.stringify(["old-programme-event"]));
    localStorage.setItem(key, JSON.stringify([url, url, "unavailable-event", "unavailable-event"]));
  }, { key, oldKey: myNightStorageKey(programmeYear - 1), url: evening.url });
  await page.goto("/");
  await expect(myNightButton(page)).toHaveAccessibleName("My Night, 1 saved event");
  await expect(page.getByRole("region", { name: "My Night tip", exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(`${key}:tip-seen`), key)).toBeNull();
  await activate(myNightButton(page), isMobile);
  await expect(page.getByRole("list", { name: "Saved event results" }).locator(".event-title")).toHaveText([evening.title]);
  await expect(page.getByText("1 saved event is no longer in this programme.", { exact: true })).toBeVisible();
  await activate(page.getByRole("button", { name: "Remove unavailable events", exact: true }), isMobile);
  await expect(page.getByRole("button", { name: "Remove unavailable events", exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), key)).toEqual([evening.url]);
});

for (const failure of ["blocked", "full", "malformed"] as const) {
  test(`${failure} storage keeps a visit-only shortlist with an explicit warning`, async ({ page, isMobile }) => {
    await page.addInitScript(({ key, failure }) => {
      if (failure === "malformed") localStorage.setItem(key, "{unreadable");
      if (failure === "blocked") {
        const getItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function (name) {
          if (name === key) throw new DOMException("Storage blocked for this test", "SecurityError");
          return getItem.call(this, name);
        };
      }
      if (failure === "full") {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException("Storage full for this test", "QuotaExceededError");
          setItem.call(this, name, value);
        };
      }
    }, { key, failure });
    await page.goto("/");
    await findEvent(page, evening.title, isMobile);
    await activate(saveButton(page, evening.title), isMobile);
    await expect(page.getByRole("alert").filter({ hasText: "this visit only" })).toBeVisible();
    await expect(myNightButton(page)).toHaveAccessibleName("My Night, 1 saved event");
    await activate(myNightButton(page), isMobile);
    await expect(page.getByRole("list", { name: "Saved event results" }).locator(".event-title")).toHaveText([evening.title]);
    await expect(page.locator(".programme-note")).toContainText("Kept for this visit only.");
    if (failure === "malformed") {
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe("{unreadable");
    }
    await page.reload();
    await expect(myNightButton(page)).toHaveAccessibleName("My Night, 0 saved events");
  });
}
