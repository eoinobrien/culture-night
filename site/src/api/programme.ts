import programme from "./programme.json";

export const programmeYear = programme.year;
export const programmeRefreshedAt = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Dublin",
}).format(new Date(programme.fetchedAt));
export const programmeDate = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(programme.date));
