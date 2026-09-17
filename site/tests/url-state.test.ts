import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import eventIds from "../src/api/event-ids.json";
import events from "../src/api/events.json";
import programme from "../src/api/programme.json";
import {
  createStateLink, decodeUrlState, defaultUrlState, encodeUrlState, readStateLink,
  urlFormatVersion, UrlStateError, type UrlState,
} from "../src/lib/url-state";
import { availabilityError, filterEvents } from "../src/lib/event-filters";
import { canonicalEventUrl, decodeEventIdentity, encodeEventIdentity } from "../src/lib/event-identity";
import {
  canonicalOfficialUrl, formatEventIds, generateEventIds, parseEventIds, shortEventId,
} from "../scripts/generate-event-ids.mjs";

const year = programme.year;
const prefix = `#v=1&year=${year}`;
const url = (slug: string) => `https://culturenight.ie/event/${slug}/`;
const state = (overrides: Partial<UrlState> = {}): UrlState => ({
  ...defaultUrlState(), ...overrides,
});
const decode = (hash: string) => decodeUrlState(hash, events, year);
const roundTrip = (value: UrlState) => decode(encodeUrlState(value, year));

function assertInvalid(hash: string) {
  assert.throws(() => decode(hash), (error: unknown) => {
    assert.ok(error instanceof UrlStateError);
    assert.equal(error.name, "UrlStateError");
    assert.ok([
      "This Culture Night link is invalid.",
      "This Culture Night link uses an unsupported version.",
      "This Culture Night link is for a different programme year.",
      "This Culture Night link contains an unavailable filter.",
      "This Culture Night link is too large.",
    ].includes(error.message));
    return true;
  }, hash.slice(0, 200));
}

test("defaults match Home, are fresh, and have a minimal canonical fragment", () => {
  const first = defaultUrlState();
  const second = defaultUrlState();
  assert.deepEqual(first, {
    startTime: { hour: 15, minute: 0 }, endTime: { hour: 3, minute: 0 },
    eventType: "All", bookingDetails: "All", ageGroup: "All",
    searchTerm: "", collection: "browse", view: "list", sort: "time", sharedUrls: [],
  });
  first.startTime.hour = 16;
  first.endTime.minute = 15;
  first.sharedUrls.push(events[0].url);
  assert.deepEqual(decode(""), second);
  assert.deepEqual(decode("#"), second);
  assert.notEqual(first.startTime, second.startTime);
  assert.notEqual(first.endTime, second.endTime);
  assert.notEqual(first.sharedUrls, second.sharedUrls);
  assert.equal(encodeUrlState(second, year), prefix);
  assert.deepEqual(decode(prefix), second);
});

test("all discovery fields round-trip, including Unicode and URL syntax in search", () => {
  const value = state({
    startTime: { hour: 18, minute: 15 }, endTime: { hour: 1, minute: 45 },
    eventType: "Online", bookingDetails: "Booking required", ageGroup: "18+",
    searchTerm: " Oíche 你好 🎭 & + # ? = 100% ", view: "map",
    selectedUrl: events[1].url,
  });
  const hash = encodeUrlState(value, year);
  assert.deepEqual(decode(hash), value);
  assert.ok(hash.includes("type=Online"));
  assert.ok(hash.includes("booking=Booking+required"));
  assert.equal(encodeUrlState(decode(hash), year), hash);
});

test("every selectable quarter-hour, midnight and reversed availability round-trip", () => {
  for (let minutes = 15 * 60; minutes <= 27 * 60; minutes += 15) {
    const time = { hour: Math.floor(minutes / 60) % 24, minute: minutes % 60 };
    const value = state({ startTime: time, endTime: time });
    assert.deepEqual(roundTrip(value), value);
  }
  for (const [startTime, endTime] of [
    [{ hour: 23, minute: 45 }, { hour: 0, minute: 0 }],
    [{ hour: 0, minute: 15 }, { hour: 2, minute: 45 }],
    [{ hour: 20, minute: 0 }, { hour: 19, minute: 0 }],
    [{ hour: 2, minute: 0 }, { hour: 23, minute: 0 }],
  ]) {
    const value = state({ startTime, endTime });
    assert.deepEqual(roundTrip(value), value);
    assert.equal(availabilityError(roundTrip(value).startTime, roundTrip(value).endTime),
      availabilityError(startTime, endTime));
  }
});

test("a permalink identifies an early-hours event independently of discovery candidates", () => {
  const early = events.find((event) => filterEvents([event], defaultUrlState()).length === 0);
  assert.ok(early, "the programme contains events outside default availability");
  const value = state({ collection: "event", selectedUrl: early.url });
  assert.deepEqual(roundTrip(value), value);
  assert.equal(roundTrip(value).selectedUrl, early.url);
  assertInvalid(`${prefix}&collection=event`);
  assert.throws(() => encodeUrlState(state({ collection: "event" }), year), UrlStateError);
});

test("selection can coexist with browse, My Night, shared and event modes", () => {
  for (const collection of ["browse", "my-night", "shared", "event"] as const) {
    const value = state({ collection, selectedUrl: events[0].url });
    assert.deepEqual(roundTrip(value), value);
  }
  assert.deepEqual(roundTrip(state({ collection: "shared" })), state({ collection: "shared" }));
});

test("only explicit shared mode serialises a snapshot, never the local private list", () => {
  for (const collection of ["browse", "my-night", "event"] as const) {
    const value = state({
      collection, selectedUrl: events[0].url,
      sharedUrls: [events[1].url, "private unavailable entry"],
    });
    const hash = encodeUrlState(value, year);
    assert.ok(!hash.includes("shared="));
    assert.ok(!hash.includes(events[1].url));
    assert.ok(!hash.includes("private"));
    assert.deepEqual(decode(hash), { ...value, sharedUrls: [] });
  }
});

test("stable compact identities deduplicate without depending on programme ordering", () => {
  const value = state({
    collection: "shared", view: "map", selectedUrl: events[1].url,
    sharedUrls: [events[1].url, events[0].url, events[1].url],
  });
  const hash = encodeUrlState(value, year);
  const params = new URLSearchParams(hash.slice(1));
  assert.equal(params.getAll("shared").length, 1);
  const ids = params.get("shared")!.split(",");
  assert.equal(ids.length, 2);
  assert.ok(ids.every((id) => !id.includes("https:") && !id.includes("/")));
  assert.deepEqual(decodeUrlState(hash, [...events].reverse(), year),
    { ...value, sharedUrls: [events[1].url, events[0].url] });
  const mixed = new URLSearchParams({
    v: "1", year: String(year), collection: "shared", selected: "not-in-programme",
  });
  mixed.set("shared", ["not-in-programme", url("not-in-programme"), "123"].join(","));
  assert.deepEqual(decode(`#${mixed}`), state({
    collection: "shared", selectedUrl: url("not-in-programme"),
    sharedUrls: [url("not-in-programme"), url("123")],
  }));
});

test("Unicode official IDs canonicalise, including the programme's escaped slugs", () => {
  const unicodeEvents = events.filter((event) => event.url.includes("%"));
  assert.equal(unicodeEvents.length, 3);
  for (const event of unicodeEvents) {
    const value = state({ collection: "shared", selectedUrl: event.url, sharedUrls: [event.url] });
    assert.deepEqual(roundTrip(value), value);
  }
  const hash = `${prefix}&collection=shared&selected=${encodeURIComponent("oíche-你好")}` +
    `&shared=${encodeURIComponent(url("o%C3%ADche-%E4%BD%A0%E5%A5%BD"))}` +
    `,${encodeURIComponent("oíche-你好")}`;
  assert.deepEqual(decode(hash), state({
    collection: "shared", selectedUrl: url("o%c3%adche-%e4%bd%a0%e5%a5%bd"),
    sharedUrls: [url("o%c3%adche-%e4%bd%a0%e5%a5%bd")],
  }));
});

test("unknown selected and shared events survive programme removal", () => {
  const value = state({
    collection: "shared", selectedUrl: events[1].url,
    sharedUrls: [events[0].url, url("removed-event")],
  });
  assert.deepEqual(decodeUrlState(encodeUrlState(value, year), [], year), value);
});

test("the entire real programme round-trips without positional IDs or data loss", () => {
  assert.equal(events.length, 1916);
  const value = state({
    collection: "shared", selectedUrl: events[0].url,
    sharedUrls: events.map((event) => event.url),
  });
  const hash = encodeUrlState(value, year);
  assert.deepEqual(roundTrip(value), value);
  const params = new URLSearchParams(hash.slice(1));
  assert.equal(params.getAll("shared").length, 1);
  const ids = params.get("shared")!.split(",");
  assert.equal(ids.length, events.length);
  assert.ok(ids.every((id) => /^~[A-Za-z0-9_-]{8}$/.test(id)));
  assert.equal(params.get("shared")!.length, events.length * 10 - 1);
  assert.ok(hash.length < 20_000);
  const link = createStateLink("https://example.test/culture-night/", value, year);
  assert.deepEqual(readStateLink(link, events, year), value);
});

test("all nonblank programme filter choices are supported without changing input values", () => {
  for (const key of ["eventType", "bookingDetails", "ageGroup"] as const) {
    for (const value of new Set(events.map((event) => event[key]).filter(Boolean))) {
      const selected = state({ [key]: value });
      assert.deepEqual(roundTrip(selected), selected);
    }
  }
});

test("version, year and scalar fields reject missing, duplicate, malformed or unsupported values", () => {
  for (const hash of [
    "#q=test", "#v=2", `#v=01&year=${year}`, `#v=&year=${year}`, "#v=1",
    `#v=1&year=${year + 1}`, "#v=1&year=2026junk", "#v=1&year=02026", "#v=1&year=",
    `${prefix}&collection=other`, `${prefix}&collection=`, `${prefix}&view=grid`,
    `${prefix}&type=Not+In+Programme`, `${prefix}&booking=Required`, `${prefix}&age=Adults`,
    `${prefix}&type=`, `${prefix}&booking=`, `${prefix}&age=`, `${prefix}&q=%00`,
    "v=1&year=2026",
  ]) assertInvalid(hash);
  for (const [key, value] of [
    ["v", "1"], ["year", String(year)], ["collection", "browse"], ["view", "list"],
    ["q", ""], ["from", "15:00"], ["until", "03:00"], ["type", "All"],
    ["booking", "All"], ["age", "All"], ["selected", "example"], ["sort", "time"],
  ]) {
    const extras = key === "v" || key === "year" ? `${key}=${value}` : `${key}=${value}&${key}=${value}`;
    assertInvalid(`${prefix}&${extras}`);
  }
  assertInvalid(`${prefix}&%76=1`);
});

test("malformed percent escapes and UTF-8 fail even in ignored fields", () => {
  for (const value of ["%", "%2", "%GG", "%FF", "%C3%28", "%E0%A4%A", "\ud800"]) {
    for (const field of ["q", "extra", "selected"]) assertInvalid(`${prefix}&${field}=${value}`);
  }
});

test("unsupported times fail rather than silently changing availability", () => {
  for (const value of [
    "", "3:00", "03:0", "03:15", "04:00", "14:45", "24:00", "15:01",
    "15:60", "-1:00", "15:00:00", " 15:00", "NaN:00",
  ]) {
    for (const field of ["from", "until"]) assertInvalid(`${prefix}&${field}=${encodeURIComponent(value)}`);
  }
  for (const time of [
    { hour: 24, minute: 0 }, { hour: 15.5, minute: 0 }, { hour: 15, minute: 1 },
    { hour: 3, minute: 15 }, { hour: NaN, minute: 0 },
  ]) assert.throws(() => encodeUrlState(state({ startTime: time }), year), UrlStateError);
});

test("hostile identities and cross-collection payloads fail with fixed, non-echoing errors", () => {
  const hostile = [
    "", ".", "..", "../event", "/event/example/", "one/two", "one\\two",
    "https://evil.example/event/example/", "javascript:alert(1)", "data:text/html,test",
    "http://culturenight.ie/event/example/", "https://culturenight.ie.evil.example/event/example/",
    "https://culturenight.ie@evil.example/event/example/", "//evil.example/event/example/",
    "https://culturenight.ie/event/example/?track=1", "https://culturenight.ie/event/example/#fragment",
    "https://culturenight.ie:443/event/example/", "two words", "nul\u0000", "line\nbreak",
    "%2Fexample", "%252Fexample", "%2e%2e", "%5cexample", "%", "hidden\u200bslug",
  ];
  for (const identity of hostile) {
    assertInvalid(`${prefix}&selected=${encodeURIComponent(identity)}`);
    assertInvalid(`${prefix}&collection=shared&shared=${encodeURIComponent(identity)}`);
    assert.throws(() => encodeUrlState(state({ selectedUrl: identity }), year), UrlStateError);
  }
  for (const collection of ["browse", "my-night", "event"]) {
    assertInvalid(`${prefix}&collection=${collection}&selected=example&shared=another`);
  }
});

test("unknown fields are ignored only after validating the recognised version and year", () => {
  assert.deepEqual(decode(`${prefix}&future=one&future=two`), defaultUrlState());
  assertInvalid(`#v=2&year=${year}&future=value`);
  assertInvalid(`#v=1&year=${year + 1}&future=value`);
  assertInvalid(`${prefix}&extra=%`);
});

test("pathological payloads have bounded lengths without rejecting the full programme", () => {
  assertInvalid(`${prefix}&q=${"a".repeat(2001)}`);
  assertInvalid(`${prefix}&selected=${"a".repeat(2049)}`);
  assertInvalid(`${prefix}&selected=${encodeURIComponent("夜".repeat(250))}`);
  assertInvalid(`${prefix}&extra=${"a".repeat(1_000_000)}`);
  assertInvalid(`${prefix}&collection=shared&shared=${Array(4097).fill("example").join(",")}`);
  assert.throws(() => encodeUrlState(state({ searchTerm: "a".repeat(2001) }), year), UrlStateError);
  assert.throws(() => encodeUrlState(state({ searchTerm: "\ud800" }), year), UrlStateError);
  assert.throws(() => encodeUrlState(state({
    collection: "shared", sharedUrls: Array(4097).fill(events[0].url),
  }), year), UrlStateError);
});

test("generated links retain origin and deployment path but remove old query and fragment", () => {
  const value = state({ searchTerm: "Dún Laoghaire", view: "map" });
  const link = createStateLink("https://example.test/culture-night/?utm_source=private&token=secret#old", value, year);
  const parsed = new URL(link);
  assert.equal(parsed.origin, "https://example.test");
  assert.equal(parsed.pathname, `/culture-night/${urlFormatVersion}/${year}/`);
  assert.equal(parsed.search, "");
  assert.deepEqual(readStateLink(link, events, year), value);
  assert.equal(new URLSearchParams(parsed.hash.slice(1)).has("v"), false);
  assert.equal(new URLSearchParams(parsed.hash.slice(1)).has("year"), false);
  assert.ok(!link.includes("private"));
  assert.ok(!link.includes("secret"));
  assert.equal(new URL(createStateLink("http://localhost:3000/nested/base", state(), year)).pathname,
    `/nested/base/${urlFormatVersion}/${year}/`);
  for (const base of ["not a URL", "/relative", "javascript:alert(1)", "https://user:password@example.test/"]) {
    assert.throws(() => createStateLink(base, state(), year), UrlStateError);
  }
});

test("encoding and decoding do not mutate state, nested objects, lists or programme data", () => {
  const value = state({
    collection: "shared", startTime: { hour: 23, minute: 0 },
    sharedUrls: [events[1].url, events[0].url, events[1].url],
  });
  const before = structuredClone(value);
  Object.freeze(value.startTime);
  Object.freeze(value.endTime);
  Object.freeze(value.sharedUrls);
  Object.freeze(value);
  const source = structuredClone(events.slice(0, 2));
  const originalSource = structuredClone(source);
  for (const event of source) Object.freeze(event);
  Object.freeze(source);
  const hash = encodeUrlState(value, year);
  decodeUrlState(hash, source, year);
  createStateLink("https://example.test/culture-night/", value, year);
  assert.deepEqual(value, before);
  assert.deepEqual(source, originalSource);
});

test("time, title and custom sorting round-trip without reordering shared snapshots", () => {
  const sharedUrls = [events[20].url, events[1].url, url("removed"), events[10].url];
  for (const sort of ["time", "title", "custom"] as const) {
    const value = state({ sort, collection: "shared", sharedUrls });
    assert.deepEqual(roundTrip(value), value);
    assert.deepEqual(readStateLink(createStateLink("https://example.test/", value, year), events, year), value);
    assert.equal(new URLSearchParams(encodeUrlState(value, year).slice(1)).get("sort"),
      sort === "time" ? null : sort);
  }
  for (const sort of ["", "date", "Title", "manual"]) assertInvalid(`${prefix}&sort=${sort}`);
  assert.throws(() => encodeUrlState(state({ sort: "manual" as UrlState["sort"] }), year), UrlStateError);
  assert.deepEqual(sharedUrls, [events[20].url, events[1].url, url("removed"), events[10].url]);
});

test("canonical path links support deployment prefixes and replace an existing suffix once", () => {
  assert.equal(urlFormatVersion, "1");
  const value = state({ collection: "shared", sort: "custom", sharedUrls: [events[2].url, events[0].url] });
  for (const base of ["", "/culture-night", "/nested/deployment", "/O%C3%ADche"]) {
    for (const suffix of ["", "/", `/1/${year}`, `/1/${year}/`, "/2/2025/"]) {
      const link = createStateLink(`https://example.test${base}${suffix}?private=tracking#old`, value, year);
      const parsed = new URL(link);
      assert.equal(parsed.pathname, `${base}/1/${year}/`);
      assert.equal(parsed.search, "");
      assert.ok(!parsed.hash.includes("year="));
      assert.ok(!parsed.hash.includes("v="));
      assert.deepEqual(readStateLink(link, events, year), value);
      assert.equal(createStateLink(link, value, year), link);
    }
  }
});

test("legacy root and deployment-root hashes remain readable alongside payload-only paths", () => {
  const value = state({
    searchTerm: "Oíche & 你好", selectedUrl: events[0].url,
    collection: "shared", sort: "custom", sharedUrls: [events[1].url, events[0].url],
  });
  for (const base of ["/", "/culture-night/", "/nested/base/"]) {
    const legacy = `https://example.test${base}${encodeUrlState(value, year)}`;
    assert.deepEqual(readStateLink(legacy, events, year), value);
    const oldSlugHash = `${prefix}&selected=${encodeURIComponent(events[0].url)}`;
    assert.deepEqual(readStateLink(`https://example.test${base}${oldSlugHash}`, events, year),
      state({ selectedUrl: events[0].url }));
    assert.deepEqual(readStateLink(`https://example.test${base}`, events, year), defaultUrlState());
  }
  for (const suffix of ["", "#", "#v=1", `#year=${year}`, prefix]) {
    assert.deepEqual(readStateLink(`https://example.test/1/${year}/${suffix}`, events, year), defaultUrlState());
  }
  assert.deepEqual(readStateLink(`https://example.test/1/${year}/#q=hello&sort=title&extra=value`, events, year),
    state({ searchTerm: "hello", sort: "title" }));
  assert.throws(() => readStateLink("https://example.test/#q=hello", events, year), UrlStateError);
});

test("path metadata rejects wrong, malformed, incomplete or conflicting version and year", () => {
  for (const path of [
    `/2/${year}/`, `/01/${year}/`, `/v1/${year}/`, `/bad/${year}/`, `/1/${year + 1}/`,
    "/1/not-a-year/", "/1/02026/", "/1/2026junk/", "/1/0/", "/1//", "/1/", "/2026/",
    `/1.0/${year}/`, `/1//${year}/`, `/%31/${year}/`, "/1/%32%30%32%36/", "/base/%GG/",
  ]) {
    assert.throws(() => readStateLink(`https://example.test${path}`, events, year), UrlStateError, path);
  }
  for (const hash of [
    `#v=2&year=${year}`, `#v=1&year=${year + 1}`, "#v=", "#year=", "#v=01", "#year=02026",
    "#v=1&v=1", `#year=${year}&year=${year}`, "#sort=time&sort=title",
    "#q=%", "#extra=%FF", "#selected=~too-short",
  ]) {
    assert.throws(() => readStateLink(`https://example.test/base/1/${year}/${hash}`, events, year),
      UrlStateError, hash);
  }
  assert.throws(() => readStateLink(`https://example.test/2/${year}/${prefix}`, events, year), UrlStateError);
  assert.throws(() => readStateLink(`https://example.test/1/${year - 1}/${prefix}`, events, year), UrlStateError);
});

test("known compact IDs and legacy slugs resolve to the same canonical official identity", () => {
  for (const event of events) {
    const compact = encodeEventIdentity(event.url);
    assert.match(compact, /^~[A-Za-z0-9_-]{8}$/);
    assert.equal(decodeEventIdentity(compact), event.url);
    assert.equal(canonicalEventUrl(event.url), canonicalOfficialUrl(event.url));
    assert.equal(decodeEventIdentity(url(compact)), event.url);
    assert.equal(encodeEventIdentity(url(compact)), compact);
  }
  const compact = encodeEventIdentity(events[0].url);
  const slug = events[0].url.slice("https://culturenight.ie/event/".length, -1);
  assert.deepEqual(decode(`${prefix}&collection=shared&shared=${compact},${slug}`),
    state({ collection: "shared", sharedUrls: [events[0].url] }));
  assert.equal(encodeEventIdentity(url("unregistered-event")), "unregistered-event");
  assert.equal(decodeEventIdentity("unregistered-event"), url("unregistered-event"));
});

test("unknown compact IDs remain opaque and reversible rather than being lost or treated as indices", () => {
  for (const id of ["AAAAAAAA", "toString", "12345678"]) {
    assert.equal(Object.hasOwn(eventIds, id), false);
    const token = `~${id}`;
    const value = state({
      collection: "shared", sort: "custom", selectedUrl: url(token),
      sharedUrls: [events[0].url, url(token), events[1].url],
    });
    assert.deepEqual(roundTrip(value), value);
    assert.equal(decodeEventIdentity(token), url(token));
    assert.equal(encodeEventIdentity(url(token)), token);
    assert.ok(!events.some((event) => event.url === url(token)));
    assert.ok(new URLSearchParams(encodeUrlState(value, year).slice(1)).get("shared")!.split(",").includes(token));
    assert.deepEqual(readStateLink(createStateLink("https://example.test/", value, year), events, year), value);
  }
});

test("malformed compact tokens fail explicitly in both selected and shared identities", () => {
  for (const token of [
    "~", "~1234567", "~123456789", "~~12345678", "~abc.defg", "~abc/defg", "~abc+defg",
    "~abc=defg", "~你好123456", "~abc defg", "~abcdefgh?x", "other~abc",
  ]) {
    for (const value of [token, url(token)]) {
      assertInvalid(`${prefix}&selected=${encodeURIComponent(value)}`);
      assertInvalid(`${prefix}&collection=shared&shared=${encodeURIComponent(value)}`);
      assert.throws(() => encodeUrlState(state({ selectedUrl: value }), year), UrlStateError);
    }
  }
});

test("shared plans use one readable comma-separated field without changing other fields", () => {
  const value = state({
    collection: "shared", sort: "custom", searchTerm: "comma, %2C %252C &shared=one,two",
    eventType: "In Person, Online", ageGroup: "18+, All Ages",
    selectedUrl: events[1].url,
    sharedUrls: [events[2].url, url("~AAAAAAAA"), url("unavailable-event"), events[0].url, events[2].url],
  });
  const expected = { ...value, sharedUrls: value.sharedUrls.slice(0, -1) };
  const list = expected.sharedUrls.map(encodeEventIdentity).join(",");
  const hash = encodeUrlState(value, year);
  const link = createStateLink("https://example.test/culture-night/", value, year);
  for (const fragment of [hash, new URL(link).hash]) {
    const params = new URLSearchParams(fragment.slice(1));
    assert.deepEqual(params.getAll("shared"), [list]);
    assert.ok(fragment.includes(`&shared=${list}`));
    assert.ok(fragment.includes(new URLSearchParams({ q: value.searchTerm }).toString()));
    assert.ok(fragment.includes("type=In+Person%2C+Online"));
    assert.ok(fragment.includes("age=18%2B%2C+All+Ages"));
    assert.equal(params.get("selected"), encodeEventIdentity(value.selectedUrl!));
  }
  assert.deepEqual(decode(hash), expected);
  assert.deepEqual(readStateLink(link, events, year), expected);
  assert.deepEqual(decode(hash.replace(`shared=${list}`, `shared=${encodeURIComponent(list)}`)), expected);
  assert.ok(!encodeUrlState(state({ collection: "shared" }), year).includes("shared="));
  const singleton = state({ collection: "shared", sharedUrls: [events[0].url] });
  assert.deepEqual(roundTrip(singleton), singleton);
  assert.equal(new URLSearchParams(encodeUrlState(singleton, year).slice(1)).get("shared"),
    encodeEventIdentity(events[0].url));
});

test("repeated shared parameters and malformed list entries are rejected in both URL formats", () => {
  const token = encodeEventIdentity(events[0].url);
  const fields = [
    `shared=${token}&shared=${token}`,
    `shared=${token}&%73hared=unavailable`,
    `shared=${token}&shared=`,
    ...["", ",", `,${token}`, `${token},`, `${token},,unavailable`, `${token}, `,
      `${token},https://evil.example/event/hello/`, `${token},~short`,
      `${token},%`, `${token},%FF`, `${token}%252Cunavailable`,
      JSON.stringify([token, "unavailable"])].map((list) => `shared=${list}`),
  ];
  for (const field of fields) {
    const payload = `collection=shared&${field}`;
    assertInvalid(`${prefix}&${payload}`);
    assert.throws(() => readStateLink(`https://example.test/1/${year}/#${payload}`, events, year), UrlStateError);
  }
  assertInvalid(`${prefix}&selected=${token},${token}`);
});

test("the single shared list enforces the entry limit before deduplication", () => {
  const value = state({
    collection: "shared", sort: "custom",
    sharedUrls: Array.from({ length: 4096 }, (_, index) => url(`limit-event-${index}`)),
  });
  assert.deepEqual(roundTrip(value), value);
  const token = encodeEventIdentity(events[0].url);
  assert.deepEqual(decode(`${prefix}&collection=shared&shared=${Array(4096).fill(token).join(",")}`),
    state({ collection: "shared", sharedUrls: [events[0].url] }));
  const tooLarge = { name: "UrlStateError", message: "This Culture Night link is too large." };
  const payload = `collection=shared&shared=${Array(4097).fill(token).join(",")}`;
  assert.throws(() => decode(`${prefix}&${payload}`), tooLarge);
  assert.throws(() => readStateLink(`https://example.test/1/${year}/#${payload}`, events, year), tooLarge);
  assert.throws(() => encodeUrlState({ ...value, sharedUrls: [...value.sharedUrls, value.sharedUrls[0]] }, year),
    tooLarge);
  assert.throws(() => decode(`${prefix}&collection=shared&shared=${"a".repeat(1_000_000)}`), tooLarge);
});

test("the checked-in registry uses the first six SHA-256 bytes and covers the whole programme", () => {
  const generated = generateEventIds(events, eventIds);
  assert.equal(formatEventIds(generated), formatEventIds(eventIds));
  assert.equal(Object.keys(eventIds).length, events.length);
  for (const [id, officialUrl] of Object.entries(eventIds)) {
    assert.equal(id, createHash("sha256").update(officialUrl).digest().subarray(0, 6).toString("base64url"));
    assert.equal(shortEventId(officialUrl), id);
  }
  assert.deepEqual(generateEventIds([...events].reverse(), {}), eventIds);
});

test("registry generation preserves removed entries and existing targets when new events arrive", () => {
  const oldUrl = url("old-programme-removed-event");
  const oldId = shortEventId(oldUrl);
  const registry = { ...eventIds, [oldId]: oldUrl };
  const before = structuredClone(registry);
  const newEvent = { url: url("new-programme-added-event") };
  const first = generateEventIds([...events, newEvent], registry);
  const reversed = generateEventIds([newEvent, ...events].reverse(), registry);
  assert.deepEqual(first, reversed);
  assert.equal(first[oldId], oldUrl);
  assert.equal(first[shortEventId(newEvent.url)], newEvent.url);
  for (const [id, target] of Object.entries(registry)) assert.equal(first[id], target);
  assert.deepEqual(registry, before);
});

test("registry collisions, changed targets, malformed URLs and duplicate JSON IDs are rejected", () => {
  const first = url("first-event");
  const second = url("second-event");
  const registry = { AAAAAAAA: first };
  const before = structuredClone(registry);
  const collidedId = () => "AAAAAAAA";
  assert.throws(() => generateEventIds([{ url: second }], registry, collidedId), /collision/);
  assert.throws(() => generateEventIds([{ url: first }, { url: second }], {}, collidedId), /collision/);
  assert.deepEqual(registry, before);
  assert.throws(() => generateEventIds([], { [shortEventId(first)]: second }), /changed target/);
  assert.throws(() => parseEventIds('{"AAAAAAAA":"first","AAAAAAAA":"second"}'), /duplicate IDs/);
  assert.throws(() => parseEventIds('{"AAAAAAAA":"first","\\u0041AAAAAAA":"second"}'), /duplicate IDs/);
  for (const invalid of [null, [], "registry"]) {
    assert.throws(() => generateEventIds(events, invalid), /invalid format/);
  }
  for (const invalidUrl of [
    "https://evil.example/event/hello/", url("~AAAAAAAA"), url("one/two"), url("with space"),
    url("%"), url(".."), `${first}?tracking=1`,
  ]) assert.throws(() => generateEventIds([{ url: invalidUrl }], {}));
});
