const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
const { fetchText, validGeocode, validateEvents, saveJson } = require("./event-data.cjs");

const addressKey = (address) => address.trim().replace(/\s+/g, " ").toLowerCase();

async function googleGeocode(address, apiKey) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.search = new URLSearchParams({ address, key: apiKey, region: "ie" });
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  } catch (error) {
    throw new Error(`Google Geocoding request failed (${error.name}) for ${address}.`);
  }
  if (!response.ok) throw new Error(`Google Geocoding HTTP ${response.status} for ${address}.`);
  const data = await response.json();
  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK") {
    throw new Error(`Google Geocoding returned ${data.status}; check the key, API restrictions, billing and quota.`);
  }
  const result = data.results[0];
  const geocode = result?.geometry?.location;
  const country = result?.address_components?.find((part) => part.types.includes("country"))?.short_name;
  const northernIreland = result?.address_components?.some((part) =>
    part.types.includes("administrative_area_level_1") && part.long_name === "Northern Ireland");
  if (!validGeocode(geocode) || !(country === "IE" || (country === "GB" && northernIreland)) ||
      geocode.lat < 51.35 || geocode.lat > 55.5 || geocode.lng < -10.8 || geocode.lng > -5.3) {
    throw new Error(`Google Geocoding returned a location outside Ireland for ${address}.`);
  }
  console.log(`Google Geocoding: ${address} => ${result.formatted_address}${result.partial_match ? " (partial match; review)" : ""}`);
  return geocode;
}

function sourcePostcode(address) {
  const codes = [...address.matchAll(/\b((?:[AC-FHKNPRTV-Y]\d{2}|D6W)\s?[0-9AC-FHKNPRTV-Y]{4}|BT\d{1,2}\s?\d[A-Z]{2})\b/gi)]
    .map(([code]) => code.replace(/\s/g, "").toUpperCase());
  const unique = [...new Set(codes)];
  return unique.length === 1 ? unique[0] : null;
}

function parseMapGeocode(html) {
  const payload = html.match(/initEmbed\((\[[\s\S]*?\])\);/);
  if (!payload) throw new Error("The source map response has no initEmbed data.");
  const data = JSON.parse(payload[1]);
  const places = [];
  const visit = (node) => {
    if (!Array.isArray(node)) return;
    // A place has an identifier, display address and [latitude, longitude].
    // Do not use viewport coordinates, which need not identify the venue.
    if (typeof node[0] === "string" && /^0x[\da-f]+:0x[\da-f]+$/i.test(node[0]) &&
        typeof node[1] === "string" && Array.isArray(node[2]) && node[2].length === 2) {
      const geocode = { lat: node[2][0], lng: node[2][1] };
      if (validGeocode(geocode)) places.push(geocode);
    }
    // Search-result markers encode coordinates as signed 32-bit values in 1e-7 degrees.
    if (Array.isArray(node[0]) && node[0].length >= 2 &&
        node[0].slice(0, 2).every((id) => typeof id === "string" && /^\d+$/.test(id)) &&
        Array.isArray(node[3]) && node[3].length === 2 && node[3].every(Number.isInteger)) {
      const degrees = (value) => (value > 2147483647 ? value - 4294967296 : value) / 1e7;
      const geocode = { lat: degrees(node[3][0]), lng: degrees(node[3][1]) };
      if (validGeocode(geocode)) places.push(geocode);
    }
    node.forEach(visit);
  };
  visit(data);
  const unique = [...new Map(places.map((point) => [JSON.stringify(point), point])).values()];
  if (!unique.length) return null;
  const first = unique[0];
  const coLocated = unique.every((point) => Math.hypot(
    (point.lat - first.lat) * 111320,
    (point.lng - first.lng) * 111320 * Math.cos(first.lat * Math.PI / 180),
  ) <= 5);
  return coLocated ? first : null;
}

async function main() {
  const events = JSON.parse(fs.readFileSync(path.join(__dirname, "enrichedData.json"), "utf8"));
  const programme = JSON.parse(fs.readFileSync(path.join(__dirname, "programme.json"), "utf8"));
  validateEvents(events, false);
  if (programme.eventCount !== events.length) throw new Error("Programme and event counts do not match.");
  const corrections = JSON.parse(fs.readFileSync(path.join(__dirname, "location-corrections.json"), "utf8"));
  for (const correction of corrections[programme.date] || []) {
    const event = events.find((entry) => entry.url === correction.url);
    if (!event || !correction.fullAddress || !correction.source || !validGeocode(correction.geocode)) {
      throw new Error(`Invalid or stale location correction: ${correction.url}`);
    }
    Object.assign(event, {
      fullAddress: correction.fullAddress,
      geocode: correction.geocode,
      locationSource: correction.source,
    });
  }
  const envPath = path.join(__dirname, ".env.local");
  const localEnv = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, "utf8")) : {};
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || localEnv.GOOGLE_MAPS_API_KEY;
  if (fs.existsSync(envPath) && !apiKey) {
    throw new Error("scripts/.env.local exists but does not define GOOGLE_MAPS_API_KEY.");
  }

  const cachePath = path.join(__dirname, ".scrape-cache", "geocodes.json");
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
  const existing = JSON.parse(fs.readFileSync(path.join(__dirname, "../site/src/api/events.json"), "utf8"));
  for (const event of existing) {
    if (event.fullAddress && validGeocode(event.geocode)) {
      cache[addressKey(event.fullAddress)] = event.geocode;
    }
  }
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const result = [];
  const unmapped = [];
  const lookups = new Map();
  const lookup = (url) => {
    if (!lookups.has(url.href)) {
      lookups.set(url.href, fetchText(url).then(parseMapGeocode));
    }
    return lookups.get(url.href);
  };
  const locate = async (event) => {
    const key = addressKey(event.fullAddress);
    let geocode = event.geocode || (key ? cache[key] : null);
    if (!validGeocode(geocode)) {
      geocode = null;
      if (apiKey && key) {
        const lookupKey = `google:${key}`;
        if (!lookups.has(lookupKey)) {
          lookups.set(lookupKey, googleGeocode(event.fullAddress, apiKey));
        }
        geocode = await lookups.get(lookupKey);
      } else if (event.mapUrl) {
        const url = new URL(event.mapUrl);
        if (url.hostname !== "maps.google.com" || url.pathname !== "/maps") {
          throw new Error(`Unexpected source map URL: ${event.mapUrl}`);
        }
        geocode = await lookup(url);
        const postcode = sourcePostcode(event.fullAddress);
        if (!geocode && postcode) {
          url.searchParams.set("q", postcode);
          geocode = await lookup(url);
        }
      }
      if (geocode && key) {
        cache[key] = geocode;
        saveJson(cachePath, cache);
      }
    }
    return { ...event, geocode };
  };
  for (let start = 0; start < events.length; start += 3) {
    const previousLookupCount = lookups.size;
    const batch = await Promise.all(events.slice(start, start + 3).map(locate));
    for (const event of batch) {
      if (!event.geocode) {
        unmapped.push({ title: event.title, url: event.url, address: event.fullAddress });
        console.warn(`No verified location: ${event.title} (${event.fullAddress || "no address"})`);
      }
    }
    result.push(...batch);
    if (start % 99 === 0) console.log(`Geocoded ${result.length}/${events.length}`);
    if (lookups.size > previousLookupCount) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  validateEvents(result);
  saveJson(path.join(__dirname, "geocodedEvents.json"), result);
  saveJson(path.join(__dirname, "../site/src/api/events.json"), result);
  saveJson(path.join(__dirname, "../site/src/api/programme.json"), {
    ...programme, mappedEventCount: result.length - unmapped.length, unmappedEvents: unmapped,
  });
  console.log(`Updated ${result.length} events; ${unmapped.length} have no unique source map location.`);
}

module.exports = { parseMapGeocode, addressKey, sourcePostcode, googleGeocode };
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
