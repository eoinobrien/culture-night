# Updating the event data

Run these commands from `scripts/` with Node.js 20.12 or later:

```bash
npm ci
npx playwright install chromium
npm run scrape -- --date=2026-09-18
npm run geocode
npm test
```

Verify the event date on <https://culturenight.ie/> before running a new year's
import. The scraper checks that the homepage confirms the supplied date, follows
the complete listing pagination, rejects duplicate event URLs, and fetches every
detail page. Playwright parses the source HTML without loading images, embeds,
analytics, or page scripts.

## Files

| File | Contents |
| --- | --- |
| `data.json` | Fresh listing cards with parsed start and end times |
| `enrichedData.json` | Details, booking links, venues, addresses, genres, and source map URLs |
| `programme.json` | Official date, source URL, fetch timestamp, listing pages, and event count |
| `location-corrections.json` | Date-scoped venue corrections with authoritative source links |
| `geocodedEvents.json` | Enriched events with coordinates or an explicit `null` location |
| `../site/src/api/events.json` | Site dataset, written by the geocoding step |
| `../site/src/api/programme.json` | Site programme metadata and unresolved locations |

The source datasets are replaced only after a complete scrape. The site's files
are replaced only after geocoding finishes and the dataset passes validation.
Errors stop the command with a non-zero exit status.

## Browser and concurrency

The default browser is Playwright's Chromium. To use an installed Microsoft Edge
instead, set `BROWSER_CHANNEL=msedge`:

```bash
BROWSER_CHANNEL=msedge npm run scrape -- --date=2026-09-18
```

`MAX_CONCURRENT` controls listing and detail requests. It defaults to 3 and accepts
integers from 1 to 8. Keep it low to avoid overloading the source website.

## Resume after an interruption

Successful detail pages are cached under `.scrape-cache/<date>/`. To reuse them
while fetching a fresh listing:

```bash
npm run scrape -- --date=2026-09-18 --resume
```

Omit `--resume` when you want every event's latest details. The cache is ignored by
Git and is not a published dataset.

## Coordinates

The geocoding step reuses coordinates from the existing site dataset and its
local cache only when the full address matches, ignoring case and repeated
whitespace. For new addresses it reads the place coordinates from the official
event's public Google Maps embed. It does not use the map viewport centre or a
paid geocoding API. If the address query is ambiguous, it retries using a unique
Eircode or Northern Ireland postcode from the source address.

`location-corrections.json` fills gaps that have been checked against another
authoritative event listing. Corrections apply only to the matching programme date
and event URL. The 2026 correction supplies the missing Mary Immaculate College
address and coordinates from Limerick.ie. The raw scraped files are kept unchanged;
the mapped event records its `locationSource`.

There are at most three map requests in flight, with a pause between batches and
retries on failure. Multiple markers are accepted only when they are within five
metres of the same location. If the source map
does not identify a unique location, the event keeps `geocode: null`, remains
searchable, and is recorded in the programme's `unmappedEvents` list. Network
errors or an unrecognised map response stop publication.

After a refresh, run the site's lint and build commands and check search, filters,
and a mapped event before publishing. See the [project README](../README.md).

## Optional Google Geocoding API

To retry unresolved addresses with the Google Geocoding API, enable that API on
your Google Cloud project and set `GOOGLE_MAPS_API_KEY` in your environment or in
`scripts/.env.local`. Then rerun `npm run geocode`. The local environment file is
Git-ignored. Never commit the key or paste it into logs.

Cached locations are reused, so API requests are made only for unresolved
addresses. Google Maps billing and quota rules apply. The script logs formatted
addresses and partial matches for review, rejects results outside the island's
bounding box, and stops on authentication, quota, or request errors without
printing the key. Check the resulting locations before publishing, especially
partial matches and coastal venues.

---
_Drafted by Wilson, Eoin's agent ("wow!")._
