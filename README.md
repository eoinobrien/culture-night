# Culture Night map

An unofficial map of Culture Night events across Ireland, published at
**[culturenight.eoin.co](https://culturenight.eoin.co/)**.

Search for events, venues, hosts, locations, or genres; filter by time, event type,
booking requirements, and age group; and select an event to see its details on the
map. Event links lead back to the official programme for current booking and
accessibility information. My Night keeps a browser-local plan with custom
ordering. Shareable URLs carry snapshots without automatically saving or replacing
the recipient's plan. Supported browsers use native sharing. The map's opt-in
Near me control centres the current results without saving location coordinates.

The production site saves the event guide in the background during a connected
visit. Once saved, search, full details and My Night work offline, including
reloads. An icon and **Offline** appear beside the date only while disconnected.
Loaded map tiles and photographs stay visible through connection drops, and the
browser can reuse cached media after reload. Unavailable maps fall back to List;
failed photos leave text-only cards. Media is not downloaded as an offline pack.
Bookings and external websites still need internet.

Culture Night 2026 takes place on **Friday 18 September 2026**. The map uses a saved
snapshot of the [official event listings](https://culturenight.ie/events/), not a
live feed. Listings and availability can change after a refresh.

## Run locally

Use Node.js 20.12 or later and npm.

```bash
cd site
npm ci
npm run dev
```

Open <http://localhost:3000>. To check the production build:

```bash
npm run lint
npm run build
```

The application uses Next.js, React, TypeScript, Tailwind CSS, and Leaflet with
OpenStreetMap tiles. Next.js exports a static site to `site/out/`.

## Repository layout

| Path | Purpose |
| --- | --- |
| `site/` | Web application |
| `site/src/api/events.json` | Event data bundled into the site |
| `site/src/api/event-ids.json` | Stable compact IDs for shared event links |
| `site/src/api/programme.json` | Programme date, source, refresh time, and coverage |
| `scripts/` | Event scraper, geocoding step, and intermediate datasets |
| `.github/workflows/nextjs.yml` | GitHub Pages build and deployment |

## Refresh the events

The scraper fetches every listing page and each event's detail page. The geocoding
step reuses coordinates for exact address matches and reads new locations from the
Google map embedded on the official event page. A Google API key is optional.
Ambiguous address queries are retried using the source's Eircode or Northern
Ireland postcode when available.
For locations that still cannot be resolved, the scripts also support the Google
Geocoding API. See the [scripts guide](scripts/README.md#optional-google-geocoding-api).

From the repository root:

```bash
cd scripts
npm ci
npx playwright install chromium
npm run scrape -- --date=2026-09-18
npm run geocode
npm test
```

Confirm the date on the official website before changing `--date` for another year.
The scraper refuses a date not found on the official homepage. It does not relabel
last year's events.

Scraping writes `scripts/data.json`, `scripts/enrichedData.json`, and
`scripts/programme.json` only after all listing and detail pages succeed.
Geocoding then writes `scripts/geocodedEvents.json` and the site's event and
programme JSON files. Review those changes and rebuild the site before publishing.
Update the append-only ID registry before building:

```bash
cd ../site
npm run ids:generate
npm run build
```

Keep retired ID mappings so existing shared links are never reassigned to a
different event. The build checks the registry and fails if it needs updating.

Events without a unique map location remain searchable but do not get a marker.
The import logs these events and lists them in `site/src/api/programme.json`.
Network or parsing failures stop the import rather than publish partial results.
Source-backed location corrections are tracked in `scripts/location-corrections.json`
and apply only to the specified programme date.

See [the scripts guide](scripts/README.md) for browser selection, concurrency, and
resuming an interrupted scrape.

## Publishing

The [GitHub Actions workflow](.github/workflows/nextjs.yml) builds `site/` and
deploys `site/out/` to GitHub Pages on pushes to `main`. It can also be started with
`workflow_dispatch`. The public site is <https://culturenight.eoin.co/>.

Event refreshes are manual. Running the scraper or building locally does not
publish anything.

---
_Drafted by Wilson, Eoin's agent ("wow!")._
