import eventIds from "../api/event-ids.json";

const officialEventPrefix = "https://culturenight.ie/event/";
const maxIdentityLength = 2048;
const compactToken = /^~[A-Za-z0-9_-]{8}$/;
const urlsById = new Map(Object.entries(eventIds));
const idsByUrl = new Map(Object.entries(eventIds).map(([id, url]) => [url, id]));

function invalid(): never {
  throw new Error("Invalid Culture Night event identity.");
}

export function canonicalEventUrl(value: string): string {
  if (typeof value !== "string" || !value || value.length > maxIdentityLength) invalid();
  let slug = value;
  if (slug.startsWith(officialEventPrefix)) {
    slug = slug.slice(officialEventPrefix.length).replace(/\/$/, "");
  }
  try {
    slug = decodeURIComponent(slug);
  } catch {
    invalid();
  }
  if (slug.startsWith("~")) {
    if (!compactToken.test(slug)) invalid();
  } else if (!slug || !/^(?:[a-zA-Z0-9_-]|[^\u0000-\u007f])+$/.test(slug) ||
    /[\p{C}\p{Z}]/u.test(slug)) {
    invalid();
  }
  const encoded = encodeURIComponent(slug).replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase());
  const url = `${officialEventPrefix}${encoded}/`;
  if (url.length > maxIdentityLength) invalid();
  return url;
}

export function encodeEventIdentity(value: string): string {
  const url = canonicalEventUrl(value);
  const id = idsByUrl.get(url);
  return id === undefined ? decodeURIComponent(url.slice(officialEventPrefix.length, -1)) : `~${id}`;
}

export function decodeEventIdentity(value: string): string {
  const url = canonicalEventUrl(value);
  const slug = url.slice(officialEventPrefix.length, -1);
  // Unknown compact IDs remain reversible, but cannot match an actual programme URL.
  return slug.startsWith("~") ? urlsById.get(slug.slice(1)) ?? url : url;
}
