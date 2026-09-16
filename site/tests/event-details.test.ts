import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PopupEventDetails from "../src/components/PopupEventDetails";
import SearchBox from "../src/components/SearchBox";
import EventResults from "../src/components/EventResults";
import FiltersColumn from "../src/components/FiltersColumn";
import events from "../src/api/events.json";
import type { CultureNightEvent } from "../src/interfaces/culture-night-event";

const sample: CultureNightEvent = {
  ...events[0],
  title: "An event with a very long title ".repeat(10),
  description: "The complete description remains available.\n".repeat(20),
  fullAddress: "An address that must not be truncated ".repeat(5),
  ageGroup: "Adults",
  features: ["Wheelchair accessible", "Neurodivergent friendly"],
  bookingDetails: "Booking required",
  bookingLink: "https://example.test/book",
  onlineContentLink: "https://example.test/watch",
  geocode: null,
};
const render = (event: CultureNightEvent) =>
  renderToStaticMarkup(createElement(PopupEventDetails, { event }));

test("attendance details and description are complete, with supplied actions", () => {
  const html = render(sample);
  for (const value of [
    sample.title, sample.description, sample.fullAddress, sample.ageGroup,
    sample.bookingDetails, ...sample.features,
    'href="https://example.test/book"', 'href="https://example.test/watch"',
  ]) {
    assert.ok(html.includes(value), value);
  }
  assert.ok(html.includes("<details>"));
  assert.ok(html.includes("Full description"));
});

test("absent booking links and optional fields are not invented", () => {
  const html = render({
    ...sample, bookingLink: null, onlineContentLink: null, features: [],
    venueName: null, ageGroup: "", fullAddress: "",
  });
  assert.ok(html.includes("Booking required"));
  assert.ok(html.includes("No booking link available"));
  assert.ok(html.includes("Official event listing"));
  for (const omitted of ["View booking", "Online content", "Accessibility and facilities", "Age suitability"]) {
    assert.ok(!html.includes(omitted), omitted);
  }
});

test("unusable links produce feedback and descriptions remain plain text", () => {
  const html = render({
    ...sample, bookingLink: "javascript:alert(1)",
    onlineContentLink: "not a URL", description: "<script>alert(1)</script>",
  });
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes("No booking link available"));
  assert.ok(html.includes("Online content link unavailable"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});

test("unmapped selections expose the same details without requiring a marker", () => {
  const html = renderToStaticMarkup(createElement(EventResults, {
    events: [sample],
    selectedEvent: sample,
    onSelect: () => {},
    onClose: () => {},
    onClear: () => {},
    onReset: () => {},
  }));
  assert.ok(html.includes("No map location available"));
  assert.ok(html.includes("View booking"));
  assert.ok(html.includes("Online content"));
  assert.ok(html.includes(sample.fullAddress));
});

test("result cards keep venue, time, booking and identity for duplicate titles", () => {
  const other = { ...sample, url: "https://example.test/another", venueName: "Another venue", image: "" };
  const html = renderToStaticMarkup(createElement(EventResults, {
    events: [{ ...sample, image: "" }, other],
    selectedEvent: other,
    onSelect: () => {}, onClose: () => {}, onClear: () => {}, onReset: () => {},
  }));
  assert.equal((html.match(/class="event-card /g) || []).length, 2);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.ok(html.includes("Another venue"));
  assert.ok(html.includes(sample.time));
  assert.ok(html.includes(sample.bookingDetails));
  assert.ok(html.includes("No event image"));
});

test("results are progressively rendered without dropping the total", () => {
  const html = renderToStaticMarkup(createElement(EventResults, {
    events: Array.from({ length: 45 }, (_, index) => ({ ...sample, image: "", url: `https://example.test/${index}` })),
    onSelect: () => {}, onClose: () => {}, onClear: () => {}, onReset: () => {},
  }));
  assert.equal((html.match(/class="event-card /g) || []).length, 30);
  assert.ok(html.includes("Show more events"));
  assert.ok(html.includes("30 of 45"));
});

test("empty results expose recovery actions and invalid availability", () => {
  const html = renderToStaticMarkup(createElement(EventResults, {
    events: [], timeError: "Available until must be at or after Available from.",
    onSelect: () => {}, onClose: () => {}, onClear: () => {}, onReset: () => {},
  }));
  assert.ok(html.includes("Check your availability"));
  assert.ok(html.includes("Available until must be at or after Available from."));
  assert.ok(html.includes("Clear search"));
  assert.ok(html.includes("Reset filters"));
});

test("search starts collapsed and exposes a result-set action, not automatic selection", () => {
  const html = renderToStaticMarkup(createElement(SearchBox, {
    searchTerm: "", suggestions: [sample], hasSelection: true,
    setSearchTerm: () => {}, selectSuggestion: () => {}, clearSearch: () => {}, runSearch: () => {},
  }));
  assert.ok(html.includes('role="combobox"'));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('aria-label="Show matching events"'));
  assert.ok(html.includes('aria-label="Clear search and selection"'));
  assert.ok(!html.includes('role="listbox"'));
});

test("compact availability controls retain every quarter hour across midnight", () => {
  const html = renderToStaticMarkup(createElement(FiltersColumn, {
    startTime: { hour: 15, minute: 0 }, endTime: { hour: 3, minute: 0 },
    setStartTime: () => {}, setEndTime: () => {},
    eventType: "All", setEventType: () => {},
    bookingDetails: "All", setBookingDetails: () => {},
    ageGroup: "All", setAgeGroup: () => {}, events: [sample],
  }));
  for (const id of ["inline-available-from", "inline-available-until"]) {
    const selector = html.match(new RegExp(`<select[^>]+id="${id}"[^>]*>(.*?)</select>`))?.[1];
    assert.ok(selector);
    assert.equal((selector.match(/<option/g) || []).length, 49);
    assert.ok(selector.includes(">15:00</option>"));
    assert.ok(selector.includes(">00:00</option>"));
    assert.ok(selector.includes(">03:00</option>"));
    assert.ok(!selector.includes(">All</option>"));
  }
});
