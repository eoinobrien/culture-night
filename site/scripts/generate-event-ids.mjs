import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const officialEventPrefix = "https://culturenight.ie/event/";
const compactId = /^[A-Za-z0-9_-]{8}$/;

export function canonicalOfficialUrl(value) {
  if (typeof value !== "string" || !value.startsWith(officialEventPrefix) || value.length > 2048) {
    throw new Error("The event registry requires canonical official event URLs.");
  }
  let slug;
  try {
    slug = decodeURIComponent(value.slice(officialEventPrefix.length).replace(/\/$/, ""));
  } catch {
    throw new Error("The event registry contains a malformed event URL.");
  }
  if (!slug || !/^(?:[a-zA-Z0-9_-]|[^\u0000-\u007f])+$/.test(slug) || /[\p{C}\p{Z}]/u.test(slug)) {
    throw new Error("The event registry contains an invalid event URL.");
  }
  const encoded = encodeURIComponent(slug).replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase());
  const url = `${officialEventPrefix}${encoded}/`;
  if (url.length > 2048) throw new Error("The event registry contains an oversized event URL.");
  return url;
}

export function shortEventId(url) {
  return createHash("sha256").update(canonicalOfficialUrl(url), "utf8").digest().subarray(0, 6).toString("base64url");
}

export function parseEventIds(text) {
  const registry = JSON.parse(text);
  const keys = [...text.matchAll(/("(?:\\.|[^"\\])*")\s*:/g)].map((match) => JSON.parse(match[1]));
  if (new Set(keys).size !== keys.length) throw new Error("The event registry contains duplicate IDs.");
  return registry;
}

// idForUrl is injectable solely to exercise the otherwise impractical hash-collision path.
export function generateEventIds(events, registry, idForUrl = shortEventId) {
  if (!Array.isArray(events) || registry === null || typeof registry !== "object" || Array.isArray(registry)) {
    throw new Error("The event registry or programme has an invalid format.");
  }
  const result = new Map();
  for (const [id, url] of Object.entries(registry)) {
    if (!compactId.test(id) || canonicalOfficialUrl(url) !== url || idForUrl(url) !== id) {
      throw new Error("An existing event ID has an invalid or changed target.");
    }
    result.set(id, url);
  }
  for (const event of events) {
    const url = canonicalOfficialUrl(event?.url);
    const id = idForUrl(url);
    if (!compactId.test(id)) throw new Error("An event ID has an invalid format.");
    if (result.has(id) && result.get(id) !== url) {
      throw new Error("Event ID collision. The existing registry has not been changed.");
    }
    result.set(id, url);
  }
  return Object.fromEntries([...result].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function formatEventIds(registry) {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    throw new Error("Usage: node scripts/generate-event-ids.mjs [--check]");
  }
  const check = args.includes("--check");
  const registryPath = new URL("../src/api/event-ids.json", import.meta.url);
  const events = JSON.parse(await readFile(new URL("../src/api/events.json", import.meta.url), "utf8"));
  let original = "";
  try {
    original = await readFile(registryPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const registry = original ? parseEventIds(original) : {};
  const generated = formatEventIds(generateEventIds(events, registry));
  if (check) {
    if (original !== generated) throw new Error("The event registry is out of date. Run scripts/generate-event-ids.mjs.");
    console.log(`Event ID registry verified (${Object.keys(registry).length} entries).`);
  } else {
    if (original !== generated) await writeFile(registryPath, generated);
    console.log(`Event ID registry updated (${Object.keys(JSON.parse(generated)).length} entries).`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
