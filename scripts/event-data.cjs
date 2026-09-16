const fs = require("node:fs");

async function fetchText(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.text();
    } catch (error) {
      if (attempt === 2) throw error;
      console.warn(`Retrying ${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

function parseTimeRange(value) {
  const matches = [...value.matchAll(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/g)];
  if (matches.length !== 2) throw new Error(`Expected a start and end time: ${value}`);
  const times = matches.map(([, h, m]) => {
    const hour = Number(h);
    const minute = Number(m);
    if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) {
      throw new Error(`Invalid time: ${value}`);
    }
    return { hour: hour % 24, minute };
  });
  return { startTime: times[0], endTime: times[1] };
}

function validGeocode(value) {
  return value && Number.isFinite(value.lat) && Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
}

function validateEvents(events, geocoded = true) {
  if (!Array.isArray(events) || !events.length) throw new Error("The event dataset is empty.");
  const urls = new Set();
  for (const event of events) {
    if (!event.title || !event.url?.startsWith("https://culturenight.ie/event/")) {
      throw new Error(`Missing event title or official URL: ${JSON.stringify(event)}`);
    }
    if (urls.has(event.url)) throw new Error(`Duplicate event URL: ${event.url}`);
    urls.add(event.url);
    for (const time of [event.startTime, event.endTime]) {
      if (!time || !Number.isInteger(time.hour) || !Number.isInteger(time.minute) ||
          time.hour < 0 || time.hour > 23 || time.minute < 0 || time.minute > 59) {
        throw new Error(`Invalid event time: ${event.url}`);
      }
    }
    if (event.scrapeError || event.geocodeError) throw new Error(`Incomplete event: ${event.url}`);
    if (geocoded && event.geocode !== null && !validGeocode(event.geocode)) {
      throw new Error(`Invalid coordinates: ${event.url}`);
    }
  }
}

function saveJson(file, data) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(temporary, file);
}

module.exports = { fetchText, parseTimeRange, validGeocode, validateEvents, saveJson };
