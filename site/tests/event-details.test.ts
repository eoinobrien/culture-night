import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PopupEventDetails from "../src/components/PopupEventDetails";
import SearchBox from "../src/components/SearchBox";
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
  const html = renderToStaticMarkup(createElement(SearchBox, {
    searchTerm: sample.title,
    suggestions: [sample],
    selectedEvent: sample,
    setSearchTerm: () => {},
    selectSuggestion: () => {},
    clearSearch: () => {},
    runSearch: () => {},
  }));
  assert.ok(html.includes("No map location available"));
  assert.ok(html.includes("View booking"));
  assert.ok(html.includes("Online content"));
  assert.ok(html.includes(sample.fullAddress));
});
