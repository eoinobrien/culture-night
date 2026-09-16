import programme from "./programme.json";

export const programmeYear = programme.year;
export const programmeDate = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(programme.date));
