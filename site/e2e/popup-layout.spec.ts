import { test, expect } from "./fixtures";
import events from "../src/api/events.json";
import { programmeYear } from "../src/api/programme";
import { createStateLink, defaultUrlState } from "../src/lib/url-state";

const event = events[0];
const longestVenue = events.filter((event) => event.geocode && event.venueName)
  .sort((a, b) => (b.venueName?.length ?? 0) - (a.venueName?.length ?? 0))[0];

test("popup essentials are compact and the close button leaves the card border visible", async ({ page, baseURL }, testInfo) => {
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "event", selectedUrl: event.url, view: "map",
  }, programmeYear));
  const popup = page.locator(".event-popup");
  await expect(popup.getByRole("heading", { name: event.title, exact: true })).toBeVisible();
  const venue = popup.locator(".popup-detail-linked");
  const booking = popup.locator(".popup-detail-inline");
  expect((await venue.boundingBox())!.height).toBeLessThanOrEqual(48);
  expect((await booking.boundingBox())!.height).toBeLessThanOrEqual(24);
  await expect(booking.locator("dt .sr-only")).toHaveText("Booking");
  await expect(booking.locator("dd")).toHaveText(event.bookingDetails);

  const close = popup.getByRole("button", { name: "Close popup", exact: true });
  const edge = await close.evaluate((element) => {
    const card = element.closest(".event-popup")!.querySelector(".leaflet-popup-content-wrapper")!;
    const outer = card.getBoundingClientRect();
    const button = element.getBoundingClientRect();
    return { top: button.top - outer.top, right: outer.right - button.right };
  });
  expect(edge.top).toBeGreaterThanOrEqual(0.9);
  expect(edge.right).toBeGreaterThanOrEqual(0.9);
  await expect(close).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  for (const target of [
    popup.getByRole("button", { name: /^Save .* to My Night$/ }),
    popup.getByRole("button", { name: "Share event", exact: true }),
    venue.getByRole("link", { name: /Google Maps$/ }),
    close,
  ]) {
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeInViewport({ ratio: 1 });
    const bounds = (await target.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await testInfo.attach("compact-popup", { body: await popup.screenshot(), contentType: "image/png" });
  await close.click();
  await expect(popup).toHaveCount(0);
});

test("a long venue wraps clear of its Google Maps action", async ({ page, baseURL }) => {
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "event", selectedUrl: longestVenue.url, view: "map",
  }, programmeYear));
  const popup = page.locator(".event-popup");
  const venue = popup.locator(".popup-detail-linked");
  await expect(venue).toContainText(longestVenue.venueName!);
  const link = venue.getByRole("link", { name: /Google Maps$/ });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport({ ratio: 1 });
  const overlaps = await venue.evaluate((element) => {
    const definition = element.querySelector("dd")!;
    const link = element.querySelector("a")!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(definition.firstChild!);
    return [...range.getClientRects()].some((rect) => rect.right > link.left - 7);
  });
  expect(overlaps).toBe(false);
  expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await popup.getByRole("button", { name: "Close popup", exact: true }).click();
  await expect(popup).toHaveCount(0);
});
