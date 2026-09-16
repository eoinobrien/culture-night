import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MyNightDataError, myNightStorageKey, readSavedUrls,
  savedEventsInTimeOrder, toggleSavedUrl,
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
    events: [], myNight: true, onBrowse: () => {},
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
