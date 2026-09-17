import programmeEvents from "../api/events.json";
import type { CultureNightEvent } from "../interfaces/culture-night-event";
import type { Time } from "../interfaces/time";
import type { EventFilters } from "./event-filters";
import { decodeEventIdentity, encodeEventIdentity } from "./event-identity";

export const urlFormatVersion = "1";

export type UrlState = EventFilters & {
  searchTerm: string;
  collection: "browse" | "my-night" | "shared" | "event";
  view: "list" | "map";
  sort: "time" | "title" | "custom";
  selectedUrl?: string;
  sharedUrls: string[];
};

export class UrlStateError extends Error {
  constructor(message = "This Culture Night link is invalid.") {
    super(message);
    this.name = "UrlStateError";
  }
}

const maxFragmentLength = 1_000_000;
const maxSharedEvents = 4096;
const maxSearchLength = 2000;
const scalarKeys = [
  "v", "year", "collection", "view", "q", "from", "until",
  "type", "booking", "age", "selected", "sort", "shared",
];
const filterKeys = [
  ["eventType", "type"],
  ["bookingDetails", "booking"],
  ["ageGroup", "age"],
] as const;

export function defaultUrlState(): UrlState {
  return {
    startTime: { hour: 15, minute: 0 },
    endTime: { hour: 3, minute: 0 },
    eventType: "All",
    bookingDetails: "All",
    ageGroup: "All",
    searchTerm: "",
    collection: "browse",
    view: "list",
    sort: "time",
    sharedUrls: [],
  };
}

function invalid(): never {
  throw new UrlStateError();
}

function validateYear(year: number) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) invalid();
}

function validateTime(time: Time) {
  if (!time || !Number.isInteger(time.hour) || !Number.isInteger(time.minute) ||
    time.hour < 0 || time.hour > 23 || time.minute < 0 ||
    time.minute > 59 || time.minute % 15 !== 0) invalid();
  const minutes = time.hour * 60 + time.minute;
  if (minutes > 3 * 60 && minutes < 15 * 60) invalid();
}

function timeString(time: Time): string {
  validateTime(time);
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

function parseTime(value: string): Time {
  if (!/^\d{2}:\d{2}$/.test(value)) invalid();
  const [hour, minute] = value.split(":").map(Number);
  const time = { hour, minute };
  validateTime(time);
  return time;
}

function validateFilters(state: EventFilters, events: CultureNightEvent[]) {
  for (const [key] of filterKeys) {
    const value = state[key];
    if (typeof value !== "string" || !value || value.length > 256 ||
      (value !== "All" && !events.some((event) => event[key] === value))) {
      throw new UrlStateError("This Culture Night link contains an unavailable filter.");
    }
  }
}

function validateState(state: UrlState, events: CultureNightEvent[]) {
  if (!["browse", "my-night", "shared", "event"].includes(state.collection) ||
    !["list", "map"].includes(state.view) ||
    !["time", "title", "custom"].includes(state.sort)) invalid();
  validateTime(state.startTime);
  validateTime(state.endTime);
  validateFilters(state, events);
  if (typeof state.searchTerm !== "string" || state.searchTerm.length > maxSearchLength ||
    /[\u0000-\u001f\u007f]/.test(state.searchTerm)) invalid();
  try {
    encodeURIComponent(state.searchTerm);
  } catch {
    invalid();
  }
  if (state.collection === "event" && state.selectedUrl === undefined) invalid();
}

function identity(value: string, encode = false): string {
  try {
    return encode ? encodeEventIdentity(value) : decodeEventIdentity(value);
  } catch {
    return invalid();
  }
}

function sharedEventUrls(values: string[]): string[] {
  if (values.length > maxSharedEvents) {
    throw new UrlStateError("This Culture Night link is too large.");
  }
  return [...new Set(values.map((value) => identity(value)))];
}

function fragmentString(params: URLSearchParams): string {
  return params.toString().split("&")
    .map((field) => field.startsWith("shared=") ? field.replace(/%2C/g, ",") : field)
    .join("&").replace(/%7E/g, "~");
}

export function encodeUrlState(state: UrlState, year: number): string {
  validateYear(year);
  validateState(state, programmeEvents);
  const params = new URLSearchParams({ v: urlFormatVersion, year: String(year) });
  if (state.collection !== "browse") params.set("collection", state.collection);
  if (state.view !== "list") params.set("view", state.view);
  if (state.sort !== "time") params.set("sort", state.sort);
  if (state.searchTerm) params.set("q", state.searchTerm);
  const from = timeString(state.startTime);
  const until = timeString(state.endTime);
  if (from !== "15:00") params.set("from", from);
  if (until !== "03:00") params.set("until", until);
  for (const [key, param] of filterKeys) {
    if (state[key] !== "All") params.set(param, state[key]);
  }
  if (state.selectedUrl !== undefined) params.set("selected", identity(state.selectedUrl, true));
  // Only an explicitly shared snapshot belongs in a URL, never a local My Night list.
  if (state.collection === "shared") {
    const urls = sharedEventUrls(state.sharedUrls);
    if (urls.length) params.set("shared", urls.map((url) => identity(url, true)).join(","));
  }
  const hash = `#${fragmentString(params)}`;
  if (hash.length > maxFragmentLength) {
    throw new UrlStateError("This Culture Night link is too large.");
  }
  return hash;
}

function parseFragment(hash: string): URLSearchParams {
  if (hash === "" || hash === "#") return new URLSearchParams();
  if (typeof hash !== "string" || !hash.startsWith("#")) invalid();
  if (hash.length > maxFragmentLength) {
    throw new UrlStateError("This Culture Night link is too large.");
  }
  const fragment = hash.slice(1);
  // URLSearchParams otherwise silently replaces invalid UTF-8 and accepts broken escapes.
  try {
    encodeURIComponent(decodeURIComponent(fragment));
  } catch {
    invalid();
  }
  const params = new URLSearchParams(fragment);
  for (const key of scalarKeys) {
    if (params.getAll(key).length > 1) invalid();
  }
  return params;
}

function decodeParameters(params: URLSearchParams, events: CultureNightEvent[], year: number): UrlState {
  const state = defaultUrlState();
  if (params.get("v") !== urlFormatVersion) {
    throw new UrlStateError("This Culture Night link uses an unsupported version.");
  }
  const linkedYear = params.get("year");
  if (linkedYear === null || !/^\d{4}$/.test(linkedYear)) invalid();
  if (linkedYear !== String(year)) {
    throw new UrlStateError("This Culture Night link is for a different programme year.");
  }
  if (params.has("collection")) state.collection = params.get("collection") as UrlState["collection"];
  if (params.has("view")) state.view = params.get("view") as UrlState["view"];
  if (params.has("sort")) state.sort = params.get("sort") as UrlState["sort"];
  if (params.has("q")) state.searchTerm = params.get("q")!;
  if (params.has("from")) state.startTime = parseTime(params.get("from")!);
  if (params.has("until")) state.endTime = parseTime(params.get("until")!);
  for (const [key, param] of filterKeys) {
    if (params.has(param)) state[key] = params.get(param)!;
  }
  if (params.has("selected")) state.selectedUrl = identity(params.get("selected")!);
  if (params.has("shared")) {
    if (state.collection !== "shared") invalid();
    state.sharedUrls = sharedEventUrls(params.get("shared")!.split(",", maxSharedEvents + 1));
  }
  validateState(state, events);
  return state;
}

/**
 * Unknown parameters are ignored only for the recognised version and programme year.
 * Event collection identifies a permalink; callers must not apply discovery filters to it.
 */
export function decodeUrlState(
  hash: string, events: CultureNightEvent[], year: number
): UrlState {
  validateYear(year);
  if (hash === "" || hash === "#") return defaultUrlState();
  return decodeParameters(parseFragment(hash), events, year);
}

function webUrl(value: string): URL {
  let url: URL;
  try {
    encodeURIComponent(value);
    url = new URL(value);
  } catch {
    return invalid();
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) invalid();
  return url;
}

function stateRoute(pathname: string): { basePath: string; version?: string; year?: string } {
  const basePath = pathname.replace(/\/$/, "");
  const parts = basePath.split("/");
  let version: string;
  let year: string;
  try {
    version = decodeURIComponent(parts.at(-2) ?? "");
    year = decodeURIComponent(parts.at(-1) ?? "");
    decodeURIComponent(pathname);
  } catch {
    return invalid();
  }
  // Numeric/version-like suffixes are reserved, not treated as deployment directories.
  if (/^v?\d/i.test(version) || /^\d{4}/.test(year)) {
    if (!/^[1-9]\d*$/.test(version) || !/^[1-9]\d{3}$/.test(year) ||
      version !== parts.at(-2) || year !== parts.at(-1)) invalid();
    return { basePath: parts.slice(0, -2).join("/"), version, year };
  }
  if (/^v?\d/i.test(year)) invalid();
  return { basePath };
}

export function readStateLink(fullUrl: string, events: CultureNightEvent[], year: number): UrlState {
  validateYear(year);
  const url = webUrl(fullUrl);
  const route = stateRoute(url.pathname);
  if (route.version === undefined) return decodeUrlState(url.hash, events, year);
  if (route.version !== urlFormatVersion) {
    throw new UrlStateError("This Culture Night link uses an unsupported version.");
  }
  if (route.year !== String(year)) {
    throw new UrlStateError("This Culture Night link is for a different programme year.");
  }
  const params = parseFragment(url.hash);
  if ((params.has("v") && params.get("v") !== route.version) ||
    (params.has("year") && params.get("year") !== route.year)) invalid();
  params.set("v", route.version);
  params.set("year", route.year);
  return decodeParameters(params, events, year);
}

export function createStateLink(baseUrl: string, state: UrlState, year: number): string {
  const url = webUrl(baseUrl);
  const route = stateRoute(url.pathname);
  const params = new URLSearchParams(encodeUrlState(state, year).slice(1));
  params.delete("v");
  params.delete("year");
  url.pathname = `${route.basePath}/${urlFormatVersion}/${year}/`;
  url.search = "";
  url.hash = fragmentString(params);
  return url.href;
}
