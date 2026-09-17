import type { CultureNightEvent } from "../interfaces/culture-night-event";
import { programmeMinutes } from "./event-filters";

export const myNightStorageKey = (year: number) => `culture-night:my-night:v1:${year}`;
export type MyNightSort = "time" | "title" | "custom";

export class MyNightDataError extends Error {}

export function readSavedUrls(storage: Pick<Storage, "getItem">, key: string): string[] {
  const value = storage.getItem(key);
  if (value === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new MyNightDataError("My Night contains unreadable saved data.", { cause: error });
  }
  if (!Array.isArray(parsed) || !parsed.every((url): url is string => typeof url === "string" && url.trim().length > 0)) {
    throw new MyNightDataError("My Night must contain a list of event URLs.");
  }
  return [...new Set(parsed)];
}

export function toggleSavedUrl(urls: readonly string[], url: string): string[] {
  return urls.includes(url) ? urls.filter((saved) => saved !== url) : [...urls, url];
}

export function mergeSavedUrls(urls: readonly string[], additions: readonly string[]): string[] {
  return [...new Set([...urls, ...additions])];
}

export function reorderSavedUrls(urls: readonly string[], order: readonly string[]): string[] {
  const existing = new Set(urls);
  const requested = new Set(order);
  return [...new Set(order)].filter((url) => existing.has(url)).concat([...existing].filter((url) => !requested.has(url)));
}

export function savedEventsInTimeOrder(
  events: CultureNightEvent[],
  urls: readonly string[]
): CultureNightEvent[] {
  return savedEventsInOrder(events, urls, "time");
}

export function savedEventsInOrder(
  events: CultureNightEvent[],
  urls: readonly string[],
  sort: MyNightSort
): CultureNightEvent[] {
  const saved = new Set(urls);
  const selected = events.filter((event) => saved.has(event.url));
  if (sort === "custom") {
    const byUrl = new Map(selected.map((event) => [event.url, event]));
    return [...saved].flatMap((url) => {
      const event = byUrl.get(url);
      return event ? [event] : [];
    });
  }
  return selected.sort((a, b) =>
    (sort === "time" ? programmeMinutes(a.startTime) - programmeMinutes(b.startTime) : 0) ||
    a.title.localeCompare(b.title, "en-IE") || a.url.localeCompare(b.url));
}
