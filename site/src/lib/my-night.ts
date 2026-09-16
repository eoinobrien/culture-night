import type { CultureNightEvent } from "../interfaces/culture-night-event";
import { programmeMinutes } from "./event-filters";

export const myNightStorageKey = (year: number) => `culture-night:my-night:v1:${year}`;

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

export function savedEventsInTimeOrder(
  events: CultureNightEvent[],
  urls: readonly string[]
): CultureNightEvent[] {
  const saved = new Set(urls);
  return events.filter((event) => saved.has(event.url)).sort((a, b) =>
    programmeMinutes(a.startTime) - programmeMinutes(b.startTime) ||
    a.title.localeCompare(b.title, "en-IE") ||
    a.url.localeCompare(b.url)
  );
}
