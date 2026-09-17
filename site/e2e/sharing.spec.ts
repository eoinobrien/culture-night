import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import events from "../src/api/events.json";
import { programmeYear } from "../src/api/programme";
import { createStateLink, readStateLink, encodeUrlState, defaultUrlState, type UrlState } from "../src/lib/url-state";
import { myNightStorageKey } from "../src/lib/my-night";
import { overlapsAvailability } from "../src/lib/event-filters";

declare global {
  interface Window {
    sharingTest: { writes: number; copiedLink?: string };
  }
}

const key = myNightStorageKey(programmeYear);
const evening = events[0];
const singing = events[1];
const booked = events.find((event) => event.title.includes("Taking the Long Road"));
const late = events.find((event) => event.startTime.hour === 23);
if (!booked || !late) throw new Error("Sharing browser fixtures are missing.");
const bookingEvent = booked;
const lateEvent = late;
const mine = (page: Page) => page.getByRole("button", { name: /^My Night,/ });
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), key);
const readLink = (url: string) => readStateLink(url, events, programmeYear);

async function pickUpFirstEvent(page: Page, title: string) {
  const handle = page.getByRole("button", { name: `Reorder ${title}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: `${title} is at position 1.` })).toHaveCount(1);
  // The keyboard sensor attaches its listener on the next event-loop turn.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

async function prepare(page: Page, seed?: string[], clipboard: "ok" | "denied" | "missing" = "ok") {
  await page.addInitScript(({ key, seed, clipboard }) => {
    if (seed && localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(seed));
    window.sharingTest = { writes: 0 };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) window.sharingTest.writes++;
      setItem.call(this, name, value);
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard === "missing" ? undefined : {
      writeText: async (text: string) => {
        if (clipboard === "denied") throw new DOMException("Clipboard denied for this test", "NotAllowedError");
        window.sharingTest.copiedLink = text;
      },
    } });
  }, { key, seed, clipboard });
}

test("shared My Night never auto-saves and explicit saving merges without replacing a recipient's plan", async ({ page: sender, context, isMobile }) => {
  const sharedUrls = [evening.url, singing.url, bookingEvent.url];
  await prepare(sender, sharedUrls);
  await sender.goto("/");
  await mine(sender).click();
  await sender.getByRole("button", { name: "Share My Night", exact: true }).click();
  await expect(sender.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  const link = await sender.evaluate(() => window.sharingTest.copiedLink);
  expect(link).toBeTruthy();
  const sharedState = readLink(link!);
  expect(new URL(link!).pathname).toBe(`/1/${programmeYear}/`);
  const parameters = new URLSearchParams(new URL(link!).hash.slice(1));
  expect(parameters.has("v")).toBe(false);
  expect(parameters.has("year")).toBe(false);
  expect(parameters.getAll("shared")).toHaveLength(1);
  const ids = parameters.get("shared")!.split(",");
  expect(ids).toHaveLength(sharedUrls.length);
  for (const id of ids) expect(id).toMatch(/^~[A-Za-z0-9_-]{8}$/);
  expect(new URL(link!).hash).toContain(",");
  expect(sharedState.collection).toBe("shared");
  expect(new Set(sharedState.sharedUrls)).toEqual(new Set(sharedUrls));
  expect(new URL(link!).search).toBe("");

  const original = [bookingEvent.url, lateEvent.url, "https://culturenight.ie/event/no-longer-listed/"];
  const originalRaw = JSON.stringify(original);
  await sender.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value: originalRaw });
  const page = await context.newPage();
  await prepare(page);
  await page.goto(link!);
  await expect(page.getByRole("heading", { name: "Shared night", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Shared event results" }).locator(".event-title"))
    .toHaveText([bookingEvent.title, singing.title, evening.title]);
  await expect(mine(page)).toHaveAccessibleName("My Night, 2 saved events");
  expect(await stored(page)).toBe(originalRaw);
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Shared night", exact: true })).toBeVisible();
  expect(await stored(page)).toBe(originalRaw);
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);

  await page.locator(".event-card").filter({ hasText: evening.title }).click();
  const popup = page.locator(".event-popup");
  await expect(popup.getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
  const save = popup.getByRole("button", { name: `Save ${evening.title} to My Night`, exact: true });
  if (isMobile) await save.tap();
  else await save.click();
  await expect(mine(page)).toHaveAccessibleName("My Night, 3 saved events");
  expect(JSON.parse((await stored(page))!)).toEqual([...original, evening.url]);
  if (isMobile) await page.getByRole("button", { name: "List", exact: true }).tap();
  await page.getByRole("button", { name: "Add all to My Night", exact: true }).click();
  await expect(mine(page)).toHaveAccessibleName("My Night, 4 saved events");
  await expect(page.getByRole("button", { name: "Add all to My Night", exact: true })).toBeDisabled();
  expect(JSON.parse((await stored(page))!)).toEqual([...original, evening.url, singing.url]);
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(2);
  expect(readLink(page.url()).sharedUrls).toEqual(sharedState.sharedUrls);
  await page.reload();
  await expect(mine(page)).toHaveAccessibleName("My Night, 4 saved events");
  expect(JSON.parse((await stored(page))!)).toEqual([...original, evening.url, singing.url]);
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
});

test("discovery, selected event and List/Map state restore on reload and browser history", async ({ page, baseURL, isMobile }) => {
  await prepare(page);
  const state = {
    ...defaultUrlState(), searchTerm: "Belfast", startTime: { hour: 18, minute: 0 }, endTime: { hour: 0, minute: 0 },
    eventType: evening.eventType, bookingDetails: evening.bookingDetails, ageGroup: evening.ageGroup || "All",
    selectedUrl: evening.url, view: "map" as const,
  };
  await page.goto(createStateLink(baseURL!, state, programmeYear));
  const search = page.getByRole("combobox", { name: "Search events" });
  const popup = page.locator(".event-popup");
  await expect(search).toHaveValue("Belfast");
  await expect(popup.getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Available from", { exact: true })).toHaveValue("18:00");
  await expect(page.getByLabel("Available until", { exact: true })).toHaveValue("00:00");
  await expect(page.getByLabel("Event type", { exact: true })).toHaveValue(evening.eventType);
  await expect(page.getByLabel("Booking details", { exact: true })).toHaveValue(evening.bookingDetails);
  await page.getByRole("button", { name: "Close filters", exact: true }).click();
  if (isMobile) await page.getByRole("button", { name: "List", exact: true }).tap();
  await page.reload();
  await expect(search).toHaveValue("Belfast");
  if (isMobile) {
    await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Selected event", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Map", exact: true }).tap();
  }
  await expect(popup.getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search and selection", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(popup).toHaveCount(0);
  await page.goBack();
  await expect(search).toHaveValue("Belfast");
  await expect(popup.getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  await page.goForward();
  await expect(search).toHaveValue("");
  await expect(popup).toHaveCount(0);
  expect(await stored(page)).toBeNull();
});

test("event copy produces an independent permalink with booking access and no automatic save", async ({ page, baseURL }) => {
  await prepare(page, [lateEvent.url]);
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "shared", sharedUrls: [bookingEvent.url, evening.url],
  }, programmeYear));
  await page.locator(".event-card").filter({ hasText: bookingEvent.title }).click();
  const popup = page.locator(".event-popup");
  const share = popup.getByRole("button", { name: "Share event", exact: true });
  await expect(share).toHaveText("");
  await expect(share.locator("svg")).toHaveCSS("width", "17px");
  await expect(popup).toHaveCSS("opacity", "1");
  const bounds = await popup.locator(".event-details-actions").evaluate((actions) => {
    const save = actions.querySelector(".save-event-button");
    const share = actions.querySelector(".share-button");
    if (!(save instanceof HTMLElement) || !(share instanceof HTMLElement)) throw new Error("Missing event actions.");
    return { save: save.getBoundingClientRect().toJSON(), share: share.getBoundingClientRect().toJSON(), width: share.offsetWidth, height: share.offsetHeight };
  });
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.share.y).toBeCloseTo(bounds.save.y, 2);
  expect(bounds.share.x).toBeGreaterThanOrEqual(bounds.save.x + bounds.save.width - 0.01);
  await share.click();
  const link = await page.evaluate(() => window.sharingTest.copiedLink);
  expect(link).toBeTruthy();
  const state = readLink(link!);
  expect(state.collection).toBe("event");
  expect(state.selectedUrl).toBe(bookingEvent.url);
  expect(state.sharedUrls).toEqual([]);
  await page.goto(link!);
  await expect(popup.getByRole("heading", { name: bookingEvent.title, exact: true })).toBeVisible();
  await expect(popup.getByRole("link", { name: "View booking", exact: true })).toHaveAttribute("href", bookingEvent.bookingLink!);
  const maps = popup.getByRole("link", { name: /in Google Maps$/ });
  const mapsUrl = new URL((await maps.getAttribute("href"))!);
  expect(mapsUrl.origin).toBe("https://www.google.com");
  expect(mapsUrl.searchParams.get("query")).toBe(`${bookingEvent.geocode!.lat},${bookingEvent.geocode!.lng}`);
  expect(await stored(page)).toBe(JSON.stringify([lateEvent.url]));
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
});

test("search edits and popup dismissal reach the URL before an immediate reload", async ({ page, baseURL }) => {
  await prepare(page);
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), searchTerm: "Belfast", selectedUrl: evening.url, view: "map",
  }, programmeYear));
  await expect(page.locator(".event-popup").getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  const now = new Date();
  // Keep pauseAt ahead of the time spent installing the fake clock.
  await page.clock.install({ time: new Date(now.getTime() - 60_000) });
  await page.clock.pauseAt(now);
  await page.keyboard.press("Escape");
  expect(readLink(page.url()).selectedUrl).toBeUndefined();
  await page.getByRole("combobox", { name: "Search events" }).fill("Dublin");
  expect(readLink(page.url()).searchTerm).toBe("Dublin");
  await page.clock.resume();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Search events" })).toHaveValue("Dublin");
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
});

test("unavailable shared events stay visible as a warning and are never imported", async ({ page, baseURL }) => {
  await prepare(page, [lateEvent.url]);
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "shared",
    sharedUrls: [evening.url, "https://culturenight.ie/event/missing-programme-event/"],
  }, programmeYear));
  await expect(page.getByRole("status").filter({ hasText: "1 shared event is no longer available" })).toBeVisible();
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
  await page.getByRole("button", { name: "Add all to My Night", exact: true }).click();
  expect(await stored(page)).toBe(JSON.stringify([lateEvent.url, evening.url]));
});

test("a direct event link is not hidden by default discovery availability", async ({ page, baseURL }) => {
  const defaults = defaultUrlState();
  const earlyEvent = events.find((event) => !overlapsAvailability(event, defaults.startTime, defaults.endTime));
  if (!earlyEvent) throw new Error("The programme no longer has an event outside default availability.");
  await prepare(page);
  await page.goto(createStateLink(baseURL!, {
    ...defaults, collection: "event", selectedUrl: earlyEvent.url, view: "map",
  }, programmeYear));
  await expect(page.locator(".event-popup").getByRole("heading", { name: earlyEvent.title, exact: true })).toBeVisible();
  expect(await stored(page)).toBeNull();
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
});

test("wrong-year and malformed links report the problem without changing saved data", async ({ page, baseURL }) => {
  await prepare(page, [lateEvent.url]);
  const link = `${baseURL}/${encodeUrlState({ ...defaultUrlState(), collection: "shared", sharedUrls: [evening.url] }, programmeYear - 1)}`;
  for (const url of [link, `${baseURL}/#v=1&year=${programmeYear}&night=%ZZ`]) {
    await page.goto(url);
    await expect(page.getByRole("alert").filter({ hasText: "Your saved My Night has not been changed." })).toBeVisible();
    expect(await stored(page)).toBe(JSON.stringify([lateEvent.url]));
    expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
  }
});

test("custom order persists and is shared without reordering the recipient's own plan", async ({ page, context, isMobile }) => {
  await prepare(page, [bookingEvent.url, evening.url, singing.url]);
  await page.goto("/");
  await mine(page).click();
  const sort = page.getByRole("combobox", { name: "Sort events", exact: true });
  await sort.selectOption("custom");
  const titles = page.getByRole("list", { name: "Saved event results" }).locator(".event-title");
  await expect(titles).toHaveText([bookingEvent.title, evening.title, singing.title]);
  const up = page.getByRole("button", { name: `Move ${evening.title} up`, exact: true });
  if (isMobile) await up.tap();
  else await up.click();
  await expect(titles).toHaveText([evening.title, bookingEvent.title, singing.title]);
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  const customRaw = JSON.stringify([evening.url, bookingEvent.url, singing.url]);
  expect(await stored(page)).toBe(customRaw);
  await sort.selectOption("title");
  const alphabetical = [evening, bookingEvent, singing].sort((a, b) => a.title.localeCompare(b.title, "en-IE"));
  await expect(titles).toHaveText(alphabetical.map((event) => event.title));
  expect(readLink(page.url()).sort).toBe("title");
  expect(await stored(page)).toBe(customRaw);
  await sort.selectOption("custom");
  await page.reload();
  await expect(sort).toHaveValue("custom");
  await expect(titles).toHaveText([evening.title, bookingEvent.title, singing.title]);
  await page.getByRole("button", { name: "Share My Night", exact: true }).click();
  const link = await page.evaluate(() => window.sharingTest.copiedLink);
  expect(readLink(link!).sort).toBe("custom");
  expect(readLink(link!).sharedUrls).toEqual([evening.url, bookingEvent.url, singing.url]);

  const recipient = await context.newPage();
  await prepare(recipient);
  await recipient.goto(link!);
  const shared = recipient.getByRole("list", { name: "Shared event results" }).locator(".event-title");
  await expect(shared).toHaveText([evening.title, bookingEvent.title, singing.title]);
  const sharedSort = recipient.getByRole("combobox", { name: "Sort events", exact: true });
  await sharedSort.selectOption("title");
  await expect(shared).toHaveText(alphabetical.map((event) => event.title));
  await recipient.getByRole("button", { name: `Move ${alphabetical[0].title} down`, exact: true }).click();
  const reordered = [alphabetical[1], alphabetical[0], alphabetical[2]];
  await expect(sharedSort).toHaveValue("custom");
  await expect(shared).toHaveText(reordered.map((event) => event.title));
  expect(readLink(recipient.url()).sharedUrls).toEqual(reordered.map((event) => event.url));
  expect(await stored(recipient)).toBe(customRaw);
  expect(await recipient.evaluate(() => window.sharingTest.writes)).toBe(0);
  await recipient.reload();
  await expect(sharedSort).toHaveValue("custom");
  await expect(shared).toHaveText(reordered.map((event) => event.title));
  expect(await stored(recipient)).toBe(customRaw);
});

test("moving a time-sorted night switches to custom and keeps the controls attached to each card", async ({ page, isMobile }) => {
  await prepare(page, [evening.url, lateEvent.url, singing.url]);
  await page.goto("/");
  await mine(page).click();
  const sort = page.getByRole("combobox", { name: "Sort events", exact: true });
  const results = page.getByRole("list", { name: "Saved event results" });
  const titles = results.locator(".event-title");
  await expect(sort).toHaveValue("time");
  await expect(titles).toHaveText([singing.title, evening.title, lateEvent.title]);
  if (isMobile) {
    const header = await page.locator(".discovery-controls").boundingBox();
    expect(header!.height).toBeLessThanOrEqual(110);
  }
  await expect(results.getByRole("button", { name: /^Reorder / })).toHaveCount(3);
  const connected = await results.getByRole("listitem").evaluateAll((rows) => rows.every((row) => {
    const card = row.querySelector(".event-card")!.getBoundingClientRect();
    const controls = row.querySelector(".event-order-actions")!.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    return Math.abs(card.bottom - controls.top) <= 1 && controls.bottom <= bounds.bottom
      && controls.left >= bounds.left && controls.right <= bounds.right
      && [...row.querySelectorAll<HTMLButtonElement>(".event-order-actions button")].every((button) =>
        button.offsetWidth >= 44 && button.offsetHeight >= 44 && !button.closest(".event-card"));
  }));
  expect(connected).toBe(true);
  const down = page.getByRole("button", { name: `Move ${evening.title} down`, exact: true });
  if (isMobile) await down.tap();
  else await down.click();
  await expect(sort).toHaveValue("custom");
  await expect(titles).toHaveText([singing.title, lateEvent.title, evening.title]);
  expect(await stored(page)).toBe(JSON.stringify([singing.url, lateEvent.url, evening.url]));
  expect(readLink(page.url()).sort).toBe("custom");
  await page.reload();
  await expect(sort).toHaveValue("custom");
  await expect(titles).toHaveText([singing.title, lateEvent.title, evening.title]);
  await sort.selectOption("title");
  const alphabetical = [evening, singing, lateEvent].sort((a, b) => a.title.localeCompare(b.title, "en-IE"));
  await expect(titles).toHaveText(alphabetical.map((event) => event.title));
  await expect(results.getByRole("button", { name: /^Reorder / })).toHaveCount(3);
  await page.getByRole("button", { name: `Move ${alphabetical[0].title} down`, exact: true }).click();
  await expect(sort).toHaveValue("custom");
  const reordered = [alphabetical[1], alphabetical[0], alphabetical[2]];
  await expect(titles).toHaveText(reordered.map((event) => event.title));
  expect(await stored(page)).toBe(JSON.stringify(reordered.map((event) => event.url)));
  await page.getByRole("button", { name: "Browse events", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(0);
  await mine(page).click();
  await expect(sort).toHaveValue("custom");
  await expect(titles).toHaveText(reordered.map((event) => event.title));
  await sort.selectOption("time");
  await page.reload();
  await expect(sort).toHaveValue("time");
  await expect(titles).toHaveText([singing.title, evening.title, lateEvent.title]);
  await expect(results.getByRole("button", { name: /^Reorder / })).toHaveCount(3);
  expect(await stored(page)).toBe(JSON.stringify(reordered.map((event) => event.url)));
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
});

test("cancelled and unchanged drags keep start-time sorting and never save", async ({ page }) => {
  const original = [evening.url, singing.url];
  await prepare(page, original);
  await page.goto("/");
  await mine(page).click();
  const sort = page.getByRole("combobox", { name: "Sort events", exact: true });
  await pickUpFirstEvent(page, singing.title);
  await page.keyboard.press("Space");
  await expect(page.locator(".event-result.is-dragging")).toHaveCount(0);
  await expect(sort).toHaveValue("time");
  await pickUpFirstEvent(page, singing.title);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("status").filter({ hasText: `${singing.title} is at position 2.` })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".event-result.is-dragging")).toHaveCount(0);
  await expect(sort).toHaveValue("time");
  expect(readLink(page.url()).sort).toBe("time");
  expect(await stored(page)).toBe(JSON.stringify(original));
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
});

test("drag handles switch start-time ordering to custom without selecting events", async ({ page, isMobile }) => {
  await prepare(page, [evening.url, singing.url]);
  await page.goto("/");
  await mine(page).click();
  const sort = page.getByRole("combobox", { name: "Sort events", exact: true });
  await expect(sort).toHaveValue("time");
  const first = page.getByRole("button", { name: `Reorder ${singing.title}`, exact: true });
  if (isMobile && page.viewportSize()?.width !== 390) {
    await pickUpFirstEvent(page, singing.title);
    expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("status").filter({ hasText: `${singing.title} is at position 2.` })).toHaveCount(1);
    await page.keyboard.press("Space");
  } else {
    if (isMobile) await page.getByRole("button", { name: `Reorder ${evening.title}`, exact: true }).scrollIntoViewIfNeeded();
    else await first.scrollIntoViewIfNeeded();
    const source = await first.boundingBox();
    const sourceRow = await page.getByRole("list", { name: "Saved event results" }).getByRole("listitem").first().boundingBox();
    const target = await page.getByRole("list", { name: "Saved event results" }).getByRole("listitem").nth(1).boundingBox();
    expect(source).not.toBeNull();
    expect(sourceRow).not.toBeNull();
    expect(target).not.toBeNull();
    const x = source!.x + source!.width / 2;
    const y = source!.y + source!.height / 2;
    const destination = { x, y: y + target!.y + target!.height / 2 - sourceRow!.y - sourceRow!.height / 2 };
    if (isMobile) {
      const session = await page.context().newCDPSession(page);
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      try {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 10, id: 1 }] });
        await expect(page.locator(".event-result.is-dragging")).toHaveCount(1);
        for (let step = 1; step <= 12; step++) {
          await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
            x: x + (destination.x - x) * step / 12,
            y: y + 10 + (destination.y - y - 10) * step / 12, id: 1,
          }] });
        }
        await expect(page.getByRole("status").filter({ hasText: `${singing.title} is at position 2.` })).toHaveCount(1);
      } finally {
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await session.detach();
      }
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 10, { steps: 2 });
      await expect(page.locator(".event-result.is-dragging")).toHaveCount(1);
      await page.mouse.move(destination.x, destination.y, { steps: 12 });
      await expect(page.getByRole("status").filter({ hasText: `${singing.title} is at position 2.` })).toHaveCount(1);
      await page.mouse.up();
    }
  }
  await expect(sort).toHaveValue("custom");
  expect(readLink(page.url()).sort).toBe("custom");
  await expect(page.getByRole("list", { name: "Saved event results" }).locator(".event-title"))
    .toHaveText([evening.title, singing.title]);
  expect(await stored(page)).toBe(JSON.stringify([evening.url, singing.url]));
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(1);
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
  await page.reload();
  await expect(sort).toHaveValue("custom");
  await expect(page.getByRole("list", { name: "Saved event results" }).locator(".event-title"))
    .toHaveText([evening.title, singing.title]);
});

test("replacement requires confirmation and affects only the current programme", async ({ page, baseURL }) => {
  const original = [lateEvent.url, evening.url, "https://culturenight.ie/event/old-unavailable-event/"];
  await prepare(page, original);
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "shared", sharedUrls: [bookingEvent.url, singing.url],
  }, programmeYear));
  const oldKey = myNightStorageKey(programmeYear - 1);
  await page.evaluate((key) => localStorage.setItem(key, '["old-year-plan"]'), oldKey);
  const replace = page.getByRole("button", { name: "Replace My Night", exact: true });
  await replace.click();
  const confirmation = page.getByRole("region", { name: "Confirm replacing My Night", exact: true });
  await expect(confirmation).toBeVisible();
  const cancel = confirmation.getByRole("button", { name: "Cancel replacement", exact: true });
  await expect(cancel).toBeFocused();
  expect(await stored(page)).toBe(JSON.stringify(original));
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
  await cancel.press("Enter");
  await expect(confirmation).toHaveCount(0);
  expect(await stored(page)).toBe(JSON.stringify(original));
  await replace.click();
  await confirmation.getByRole("button", { name: "Confirm replacement", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  expect(await stored(page)).toBe(JSON.stringify([bookingEvent.url, singing.url]));
  expect(await page.evaluate((key) => localStorage.getItem(key), oldKey)).toBe('["old-year-plan"]');
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(1);
  await page.reload();
  expect(await stored(page)).toBe(JSON.stringify([bookingEvent.url, singing.url]));
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);

  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "shared", sharedUrls: ["https://culturenight.ie/event/no-available-events/"],
  }, programmeYear));
  await expect(replace).toBeDisabled();
  expect(await stored(page)).toBe(JSON.stringify([bookingEvent.url, singing.url]));
});

test("the brand resets home without reloading the document, map or My Night", async ({ page, baseURL, isMobile }) => {
  await prepare(page, [lateEvent.url]);
  const sharedState: UrlState = {
    ...defaultUrlState(), collection: "shared", sharedUrls: [evening.url], sort: "custom",
    searchTerm: "Dublin", eventType: evening.eventType, bookingDetails: bookingEvent.bookingDetails,
    ageGroup: lateEvent.ageGroup || "All", startTime: { hour: 18, minute: 15 },
    endTime: { hour: 23, minute: 0 }, selectedUrl: evening.url, view: "map",
  };
  await page.goto(createStateLink(baseURL!, sharedState, programmeYear));
  const map = page.locator(".event-map");
  await expect(map.getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  await map.evaluate((element) => { element.setAttribute("data-home-map", "original"); });
  await page.locator("html").evaluate((element) => { element.setAttribute("data-home-document", "original"); });
  const documentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documentRequests.push(request.url());
  });
  const home = page.getByRole("link", { name: "Culture Night home", exact: true });
  if (isMobile) await home.tap();
  else await home.click();
  await expect(page.getByRole("combobox", { name: "Search events" })).toHaveValue("");
  await expect(page.getByRole("list", { name: "Matching event results" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/1/${programmeYear}/`);
  expect(new URL(page.url()).hash).toBe("");
  expect(readLink(page.url())).toEqual(defaultUrlState());
  await expect(page.locator(".event-popup")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-home-document", "original");
  await expect(map).toHaveAttribute("data-home-map", "original");
  expect(await stored(page)).toBe(JSON.stringify([lateEvent.url]));
  await expect(page.locator(".discovery-toolbar .scope-label")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Shared night", exact: true })).toBeVisible();
  await expect(map.getByRole("heading", { name: evening.title, exact: true })).toBeVisible();
  expect(readLink(page.url())).toEqual(sharedState);
  await page.goForward();
  await expect(page.getByRole("list", { name: "Matching event results" })).toBeVisible();
  expect(readLink(page.url())).toEqual(defaultUrlState());
  await expect(page.locator("html")).toHaveAttribute("data-home-document", "original");
  await expect(map).toHaveAttribute("data-home-map", "original");
  expect(documentRequests).toEqual([]);
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
  expect(await stored(page)).toBe(JSON.stringify([lateEvent.url]));
  await expect(page.locator(".map-caption")).not.toContainText("All Ireland");
});

test("the brand closes filters and scrolls home with keyboard activation, including when already home", async ({ page, baseURL }) => {
  await prepare(page, [lateEvent.url]);
  await page.goto(createStateLink(baseURL!, { ...defaultUrlState(), searchTerm: "Dublin" }, programmeYear));
  await expect(page.getByRole("combobox", { name: "Search events" })).toHaveValue("Dublin");
  await page.locator("html").evaluate((element) => { element.setAttribute("data-home-document", "original"); });
  const home = page.getByRole("link", { name: "Culture Night home", exact: true });
  for (let visit = 0; visit < 2; visit++) {
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(page.getByRole("region", { name: "Event filters", exact: true })).toBeVisible();
    await page.locator(".results-panel").evaluate((element) => { element.scrollTop = 80; });
    expect(await page.locator(".results-panel").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await home.focus();
    await home.press("Enter");
    await expect(page.getByRole("region", { name: "Event filters", exact: true })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Search events" })).toHaveValue("");
    await expect.poll(() => page.locator(".results-panel").evaluate((element) => element.scrollTop)).toBe(0);
    expect(readLink(page.url())).toEqual(defaultUrlState());
    await expect(page.locator("html")).toHaveAttribute("data-home-document", "original");
    await expect(home).toBeFocused();
  }
  expect(await stored(page)).toBe(JSON.stringify([lateEvent.url]));
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
});

test("the brand keeps native modified and middle click navigation", async ({ page, context, baseURL, isMobile }) => {
  test.skip(isMobile, "Desktop link modifiers need one keyboard/mouse project.");
  await prepare(page, [lateEvent.url]);
  await page.goto(createStateLink(baseURL!, { ...defaultUrlState(), collection: "my-night" }, programmeYear));
  await expect(page.getByRole("heading", { name: "My Night", exact: true })).toBeVisible();
  const source = page.url();
  const home = page.getByRole("link", { name: "Culture Night home", exact: true });
  await expect(home).toHaveAttribute("href", "./");
  for (const options of [{ modifiers: ["ControlOrMeta" as const] }, { button: "middle" as const }]) {
    const [newPage] = await Promise.all([context.waitForEvent("page"), home.click(options)]);
    await expect(newPage.getByRole("combobox", { name: "Search events" })).toHaveValue("");
    expect(readLink(newPage.url())).toEqual(defaultUrlState());
    expect(page.url()).toBe(source);
    await expect(page.getByRole("heading", { name: "My Night", exact: true })).toBeVisible();
    expect(await stored(page)).toBe(JSON.stringify([lateEvent.url]));
    await newPage.close();
  }
});

test("unsupported programme paths do not import their shared events", async ({ page, baseURL }) => {
  await prepare(page, [lateEvent.url]);
  const response = await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "shared", sharedUrls: [evening.url],
  }, programmeYear - 1));
  expect(response?.status()).toBe(404);
  expect(await stored(page)).toBe(JSON.stringify([lateEvent.url]));
  expect(await page.evaluate(() => window.sharingTest.writes)).toBe(0);
});

for (const clipboard of ["denied", "missing"] as const) {
  test(`${clipboard} clipboard offers a selectable manual link`, async ({ page, baseURL }) => {
    await prepare(page, undefined, clipboard);
    await page.goto(createStateLink(baseURL!, { ...defaultUrlState(), searchTerm: "Belfast" }, programmeYear));
    await page.getByRole("button", { name: "Share search", exact: true }).click();
    const field = page.getByRole("textbox", { name: "Share link", exact: true });
    await expect(field).toBeVisible();
    const link = await field.inputValue();
    expect(readLink(link).searchTerm).toBe("Belfast");
    await expect(page.getByRole("alert").filter({ hasText: /copy the link below|copy it below/ })).toBeVisible();
    await field.focus();
    expect(await field.evaluate((input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!)).toBe(link.length);
    await page.getByRole("button", { name: "Close sharing message", exact: true }).click();
    await expect(field).toHaveCount(0);
  });
}
