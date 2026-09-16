import type { CultureNightEvent } from "../interfaces/culture-night-event";
import type { Time } from "../interfaces/time";

export type EventFilters = {
  startTime: Time;
  endTime: Time;
  eventType: string;
  bookingDetails: string;
  ageGroup: string;
};

const minutesPerDay = 24 * 60;
const nightEnd = 3 * 60;
const minutes = (time: Time) => time.hour * 60 + time.minute;

// The selector runs from 15:00 through 03:00 on the following morning.
const availabilityMinutes = (time: Time) => {
  const value = minutes(time);
  return value <= nightEnd ? value + minutesPerDay : value;
};

export function availabilityError(start: Time, end: Time): string | undefined {
  if (availabilityMinutes(end) < availabilityMinutes(start)) {
    return "Available until must be at or after Available from.";
  }
}

export function overlapsAvailability(
  event: Pick<CultureNightEvent, "startTime" | "endTime">,
  start: Time,
  end: Time
): boolean {
  if (availabilityError(start, end)) return false;
  const from = availabilityMinutes(start);
  const until = availabilityMinutes(end);
  const rawStart = minutes(event.startTime);
  const eventStart = availabilityMinutes(event.startTime);
  let eventEnd = minutes(event.endTime) + (eventStart - rawStart);
  if (eventEnd < eventStart) eventEnd += minutesPerDay;

  if (eventStart === eventEnd) {
    return from === until
      ? eventStart === from
      : eventStart >= from && eventStart < until;
  }
  if (from === until) return eventStart <= from && from < eventEnd;
  return eventStart < until && eventEnd > from;
}

export function filterEvents(
  events: CultureNightEvent[],
  filters: EventFilters
): CultureNightEvent[] {
  return events.filter(
    (event) =>
      overlapsAvailability(event, filters.startTime, filters.endTime) &&
      (filters.eventType === "All" || event.eventType === filters.eventType) &&
      (filters.bookingDetails === "All" ||
        event.bookingDetails === filters.bookingDetails) &&
      (filters.ageGroup === "All" || event.ageGroup === filters.ageGroup)
  );
}

export function searchEvents(
  events: CultureNightEvent[],
  query: string
): CultureNightEvent[] {
  const term = query.trim().toLowerCase();
  if (!term) return events;
  return events.filter((event) =>
    [
      event.title,
      event.venueName,
      event.fullAddress,
      event.host,
      ...event.locations.map((location) => location.title),
      ...event.genres.map((genre) => genre.title),
    ].some((value) => value?.toLowerCase().includes(term))
  );
}
