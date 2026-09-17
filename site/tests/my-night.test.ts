import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MyNightDataError, myNightStorageKey, readSavedUrls,
  savedEventsInTimeOrder, savedEventsInOrder, toggleSavedUrl, mergeSavedUrls, reorderSavedUrls,
} from "../src/lib/my-night";
import SaveEventButton from "../src/components/SaveEventButton";
import EventResults from "../src/components/EventResults";
import PopupEventDetails from "../src/components/PopupEventDetails";
import MapEmptyState from "../src/components/MapEmptyState";
import events from "../src/api/events.json";
import type { CultureNightEvent } from "../src/interfaces/culture-night-event";

const sample: CultureNightEvent = { ...events[0], image: "" };
const stored = (value: string | null) => ({ getItem: () => value });

test("the shortlist key separates programme years", () => {
  assert.equal(myNightStorageKey(2026), "culture-night:my-night:v1:2026");
  assert.notEqual(myNightStorageKey(2026), myNightStorageKey(2027));
});

test("saved URLs restore without duplicates or destructive rewrites", () => {
  assert.deepEqual(readSavedUrls(stored(null), "key"), []);
  assert.deepEqual(readSavedUrls(stored(JSON.stringify([sample.url, sample.url, "unavailable-event"])), "key"),
    [sample.url, "unavailable-event"]);
});

test("malformed saved data is an explicit error, not an empty-list success", () => {
  for (const raw of ["{broken", "null", "{}", '[""]', "[42]", '["event",false]']) {
    assert.throws(() => readSavedUrls(stored(raw), "key"), MyNightDataError, raw);
  }
  assert.throws(() => readSavedUrls({
    getItem: () => { throw new DOMException("Storage denied", "SecurityError"); },
  }, "key"), { name: "SecurityError" });
});

test("toggle uses URL identity and leaves the supplied list untouched", () => {
  const urls = [sample.url, "another-event"];
  assert.deepEqual(toggleSavedUrl(urls, sample.url), ["another-event"]);
  assert.deepEqual(toggleSavedUrl(urls, "third-event"), [...urls, "third-event"]);
  assert.deepEqual(urls, [sample.url, "another-event"]);
});

test("My Night sorts starts across midnight without applying discovery filters", () => {
  const evening = { ...sample, url: "evening", startTime: { hour: 20, minute: 0 } };
  const afternoon = { ...sample, url: "afternoon", startTime: { hour: 16, minute: 30 }, geocode: null };
  const midnight = { ...sample, url: "midnight", startTime: { hour: 0, minute: 0 } };
  const late = { ...sample, url: "late", startTime: { hour: 2, minute: 0 } };
  const source = [late, afternoon, midnight, evening];
  const result = savedEventsInTimeOrder(source, ["late", "evening", "midnight", "afternoon", "not-in-programme"]);
  assert.deepEqual(result.map((event) => event.url), ["afternoon", "evening", "midnight", "late"]);
  assert.equal(result[0].geocode, null);
  assert.deepEqual(source.map((event) => event.url), ["late", "afternoon", "midnight", "evening"]);
});

test("same-time and duplicate-title events have stable ordering and separate identities", () => {
  const source = [
    { ...sample, url: "z", title: "Same title" },
    { ...sample, url: "a", title: "Same title" },
    { ...sample, url: "b", title: "Earlier alphabetically" },
  ];
  assert.deepEqual(savedEventsInTimeOrder(source, ["a", "z", "b"]).map((event) => event.url), ["b", "a", "z"]);
});

test("save controls name the event, expose state and wait for restoration", () => {
  for (const saved of [false, true]) {
    const html = renderToStaticMarkup(createElement(SaveEventButton, {
      event: { ...sample, title: "Example event" },
      shortlist: { urls: new Set(saved ? [sample.url] : []), ready: true, toggle: () => {} },
    }));
    assert.ok(html.includes(`aria-pressed="${saved}"`));
    assert.ok(html.includes(saved ? "Remove Example event from My Night" : "Save Example event to My Night"));
  }
  const loading = renderToStaticMarkup(createElement(SaveEventButton, {
    event: sample, shortlist: { urls: new Set<string>(), ready: false, toggle: () => {} },
  }));
  assert.ok(loading.includes("disabled"));
});

test("an empty shortlist has a browse action rather than search/filter recovery", () => {
  const html = renderToStaticMarkup(createElement(EventResults, {
    events: [], collection: "my-night", onBrowse: () => {},
    onSelect: () => {}, onClose: () => {}, onClear: () => {}, onReset: () => {},
  }));
  assert.ok(html.includes("No saved events yet"));
  assert.ok(html.includes("Browse events"));
  assert.ok(!html.includes("Reset filters"));
  assert.ok(!html.includes("Clear search"));
});

test("event details keep booking access alongside the shortlist action", () => {
  const html = renderToStaticMarkup(createElement(PopupEventDetails, {
    event: { ...sample, bookingLink: "https://example.test/book", bookingDetails: "Booking required" },
    shortlist: { urls: new Set([sample.url]), ready: true, toggle: () => {} },
  }));
  assert.ok(html.includes("Saved to My Night"));
  assert.ok(html.includes('href="https://example.test/book"'));
  assert.ok(html.includes("Official event listing"));
});

test("map empty states distinguish search, unavailable locations and the shortlist", () => {
  const callbacks = { onClear: () => {}, onReset: () => {}, onBrowse: () => {}, onShowList: () => {} };
  const search = renderToStaticMarkup(createElement(MapEmptyState, {
    ...callbacks, myNight: false, hasUnmappedEvents: false,
  }));
  assert.ok(search.includes("No matching events"));
  assert.ok(search.includes("Clear search"));
  assert.ok(search.includes("Reset filters"));
  const unmapped = renderToStaticMarkup(createElement(MapEmptyState, {
    ...callbacks, myNight: true, hasUnmappedEvents: true,
  }));
  assert.ok(unmapped.includes("No map locations available"));
  assert.ok(unmapped.includes("View list"));
  assert.ok(!unmapped.includes("No saved events yet"));
  const emptyNight = renderToStaticMarkup(createElement(MapEmptyState, {
    ...callbacks, myNight: true, hasUnmappedEvents: false,
  }));
  assert.ok(emptyNight.includes("No saved events yet"));
  assert.ok(emptyNight.includes("Browse events"));
  assert.ok(!emptyNight.includes("Reset filters"));
});

test("adding a shared plan preserves existing saves and deduplicates the union", () => {
  const existing = ["my-plan", "both", "unavailable"];
  const shared = ["shared-plan", "both", "shared-plan"];
  assert.deepEqual(mergeSavedUrls(existing, shared), ["my-plan", "both", "unavailable", "shared-plan"]);
  assert.deepEqual(existing, ["my-plan", "both", "unavailable"]);
  assert.deepEqual(shared, ["shared-plan", "both", "shared-plan"]);
  assert.deepEqual(mergeSavedUrls(existing, []), existing);
});

test("custom and title sorting preserve event identities and leave inputs untouched", () => {
  const source = [
    { ...sample, title: "Zebra", url: "z" },
    { ...sample, title: "Alpha", url: "a" },
    { ...sample, title: "Alpha", url: "b" },
  ];
  const urls = ["b", "missing", "z", "a", "b"];
  assert.deepEqual(savedEventsInOrder(source, urls, "custom").map((event) => event.url), ["b", "z", "a"]);
  assert.deepEqual(savedEventsInOrder(source, urls, "title").map((event) => event.url), ["a", "b", "z"]);
  assert.deepEqual(urls, ["b", "missing", "z", "a", "b"]);
  assert.deepEqual(source.map((event) => event.url), ["z", "a", "b"]);
});

test("reordering preserves concurrent additions and unavailable saves without reviving removed events", () => {
  const current = ["a", "b", "new-from-another-tab", "unavailable"];
  const order = ["b", "removed-in-another-tab", "a", "b"];
  assert.deepEqual(reorderSavedUrls(current, order), ["b", "a", "new-from-another-tab", "unavailable"]);
  assert.deepEqual(reorderSavedUrls(current, []), current);
  assert.deepEqual(current, ["a", "b", "new-from-another-tab", "unavailable"]);
});

test("venue links use map coordinates or the supplied address without requesting the user's location", () => {
  const render = (event: CultureNightEvent) => renderToStaticMarkup(createElement(PopupEventDetails, { event }));
  const mapped = render({ ...sample, venueName: "Arts Hall", geocode: { lat: 53.3, lng: -6.2 } });
  assert.ok(mapped.includes('aria-label="Open Arts Hall in Google Maps"'));
  assert.ok(mapped.includes("https://www.google.com/maps/search/?api=1&amp;query=53.3%2C-6.2"));
  const unmapped = render({ ...sample, venueName: "Arts Hall", fullAddress: "Main Street, Dublin", geocode: null });
  assert.ok(unmapped.includes("query=Arts%20Hall%2C%20Main%20Street%2C%20Dublin"));
  const noLocation = render({ ...sample, venueName: null, fullAddress: "", geocode: null });
  assert.ok(!noLocation.includes("Google Maps"));
});
