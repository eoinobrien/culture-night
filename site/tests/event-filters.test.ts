import assert from "node:assert/strict";
import { test } from "node:test";
import type { CultureNightEvent } from "../src/interfaces/culture-night-event";
import {
  availabilityError,
  filterEvents,
  overlapsAvailability,
  searchEvents,
  type EventFilters,
} from "../src/lib/event-filters";

const time = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
};
const interval = (start: string, end: string) => ({
  startTime: time(start),
  endTime: time(end),
});
const defaults: EventFilters = {
  ...interval("15:00", "03:00"),
  eventType: "All",
  bookingDetails: "All",
  ageGroup: "All",
};
const event = (
  overrides: Partial<CultureNightEvent> = {}
): CultureNightEvent => ({
  title: "An exhibition",
  url: "https://culturenight.ie/event/exhibition/",
  image: "",
  description: "Drop in throughout the evening.",
  locations: [{ title: "Galway", url: "" }],
  time: "16:00 - 20:00",
  ...interval("16:00", "20:00"),
  features: [],
  host: "Gallery host",
  eventType: "In Person",
  bookingDetails: "No Booking Required",
  bookingLink: null,
  onlineContentLink: null,
  ageGroup: "All Ages",
  venueName: "City Gallery",
  fullAddress: "Example Street, Galway",
  genres: [{ title: "Visual Art", url: "" }],
  geocode: { lat: 53.27, lng: -9.05 },
  ...overrides,
});

const cases: [string, string, string, string, boolean][] = [
  ["16:00", "20:00", "19:00", "20:00", true],
  ["17:00", "18:00", "16:00", "18:00", true],
  ["17:00", "18:00", "17:00", "18:00", true],
  ["17:00", "19:00", "18:00", "20:00", true],
  ["16:00", "21:00", "18:00", "20:00", true],
  ["18:00", "19:00", "16:00", "18:00", false],
  ["16:00", "18:00", "18:00", "20:00", false],
  ["16:00", "17:00", "18:00", "20:00", false],
  ["23:00", "01:00", "00:00", "02:00", true],
  ["00:30", "01:30", "23:00", "01:00", true],
  ["00:00", "02:00", "15:00", "03:00", true],
  ["23:00", "00:00", "00:00", "01:00", false],
  ["14:00", "21:00", "15:00", "03:00", true],
  ["14:30", "16:30", "16:00", "17:00", true],
  ["13:00", "15:00", "15:00", "03:00", false],
  ["11:00", "12:30", "15:00", "03:00", false],
  ["16:00", "20:00", "19:00", "19:00", true],
  ["16:00", "20:00", "20:00", "20:00", false],
  ["19:00", "19:00", "18:00", "20:00", true],
  ["20:00", "20:00", "18:00", "20:00", false],
  ["19:00", "19:00", "19:00", "19:00", true],
  ["00:00", "00:00", "23:00", "01:00", true],
];
for (const [start, end, from, until, expected] of cases) {
  test(`${start}-${end} during ${from}-${until}: ${expected}`, () => {
    assert.equal(
      overlapsAvailability(interval(start, end), time(from), time(until)),
      expected
    );
  });
}

test("reversed availability is invalid, not a new day-long window", () => {
  assert.ok(availabilityError(time("20:00"), time("19:00")));
  assert.ok(availabilityError(time("02:00"), time("23:00")));
  assert.equal(availabilityError(time("23:00"), time("02:00")), undefined);
  assert.deepEqual(
    filterEvents([event()], { ...defaults, ...interval("20:00", "19:00") }),
    []
  );
});

test("Go candidates and suggestions cannot escape any selected filter", () => {
  const events = [
    event(),
    event({
      url: "https://culturenight.ie/event/online-exhibition/",
      eventType: "Online",
      bookingDetails: "Booking required",
      ageGroup: "Adults",
      geocode: null,
    }),
  ];
  const filters = {
    ...defaults,
    eventType: "Online",
    bookingDetails: "Booking required",
    ageGroup: "Adults",
  };
  const candidates = searchEvents(filterEvents(events, filters), "exhibition");
  assert.deepEqual(candidates, [events[1]]);
  assert.equal(candidates[0]?.geocode, null);
  assert.deepEqual(
    searchEvents(
      filterEvents(events, { ...filters, ...interval("21:00", "22:00") }),
      "exhibition"
    ),
    []
  );
});

test("duplicate titles remain separately selectable by URL", () => {
  const events = [
    event(),
    event({ url: "https://culturenight.ie/event/another-exhibition/" }),
  ];
  const candidates = searchEvents(filterEvents(events, defaults), "exhibition");
  assert.equal(candidates.length, 2);
  assert.notEqual(candidates[0].url, candidates[1].url);
});

test("search preserves existing fields and handles empty and unmatched queries", () => {
  const events = [event()];
  for (const query of [" EXHIBITION ", "gallery", "example street", "galway", "visual art"]) {
    assert.deepEqual(searchEvents(events, query), events);
  }
  assert.equal(searchEvents(events, " "), events);
  assert.deepEqual(searchEvents(events, "not-an-event"), []);
});
