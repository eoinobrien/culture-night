import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isOfflineMessage } from "../src/lib/offline-guide";
import OfflineIndicator from "../src/components/OfflineIndicator";
import EventResults from "../src/components/EventResults";
import events from "../src/api/events.json";

const status = {
  type: "OFFLINE_STATUS", version: "release", ready: true, completed: 10, total: 10,
  year: 2026, fetchedAt: "2026-09-16T18:46:59.409Z",
};

test("offline status requires a complete, well-formed download before readiness", () => {
  assert.equal(isOfflineMessage(status), true);
  assert.equal(isOfflineMessage({ ...status, ready: false, completed: 3 }), true);
  for (const invalid of [
    null, {}, { ...status, completed: 9 }, { ...status, completed: -1 },
    { ...status, total: 0 }, { ...status, completed: 10.5 }, { ...status, total: NaN },
    { ...status, fetchedAt: "yesterday" }, { ...status, year: "2026" }, { ...status, ready: "yes" },
  ]) {
    assert.equal(isOfflineMessage(invalid), false, JSON.stringify(invalid));
  }
  assert.equal(isOfflineMessage({ type: "OFFLINE_PROGRESS", version: "new", completed: 2, total: 5 }), true);
  assert.equal(isOfflineMessage({ type: "OFFLINE_ERROR", version: "new", message: "Storage is full." }), true);
});

test("the indicator is absent online and shows only an icon and Offline while disconnected", () => {
  for (const ready of [false, true]) {
    assert.equal(renderToStaticMarkup(createElement(OfflineIndicator, { offline: false, ready })), "");
    const html = renderToStaticMarkup(createElement(OfflineIndicator, { offline: true, ready }));
    assert.ok(html.includes('role="status"'));
    assert.ok(html.includes("<svg"));
    assert.ok(html.includes("</svg>Offline"));
    assert.ok(!html.includes("<button"));
    assert.ok(!html.includes("<details"));
    assert.ok(html.includes(ready ? "Using saved event data" : "has not been saved completely"));
  }
});

test("unavailable maps expose complete details without discarding the selected event", () => {
  const event = { ...events[0], image: "", description: "A complete offline description.", fullAddress: "Offline venue address" };
  const props = {
    events: [event], selectedEvent: event, onSelect: () => {}, onClose: () => {},
    onClear: () => {}, onReset: () => {},
  };
  const offline = renderToStaticMarkup(createElement(EventResults, { ...props, offline: true, mapUnavailable: true }));
  assert.ok(offline.includes(event.description));
  assert.ok(offline.includes(event.fullAddress));
  assert.ok(!offline.includes("event-image"));
  assert.ok(!offline.includes("<img"));
  assert.ok(offline.includes("Google Maps need internet"));
  assert.ok(offline.includes('aria-label="Close event details"'));
  const online = renderToStaticMarkup(createElement(EventResults, props));
  assert.ok(online.includes("Read event details without the map"));
  assert.ok(online.includes(event.description));
});

test("all collections attempt available photos regardless of connectivity and omit missing images", () => {
  const sample = [events[0], { ...events[1], image: "" }];
  for (const collection of ["browse", "my-night", "shared", "event"] as const) {
    const props = {
      events: sample, collection, onSelect: () => {}, onClose: () => {},
      onClear: () => {}, onReset: () => {},
    };
    const offline = renderToStaticMarkup(createElement(EventResults, { ...props, offline: true }));
    assert.ok(!offline.includes("image-placeholder"));
    assert.equal((offline.match(/class="event-image"/g) ?? []).length, 1);
    assert.ok(offline.includes("<img"));
    for (const event of sample) {
      assert.ok(offline.includes(event.title));
      assert.ok(offline.includes(event.time));
    }
    const online = renderToStaticMarkup(createElement(EventResults, props));
    assert.equal(online, offline);
  }
});
