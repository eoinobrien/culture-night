# Culture Night web application

The site is published at <https://culturenight.eoin.co/>.

From this directory:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The static export is written to `out/`.

## Discovery layout

The interface uses black and charcoal surfaces with pale-green map pins and
actions. Desktop keeps a scrollable event list beside the map. Phones start in
List view, with search and the List/Map switch kept above the scrolling results.
Filters are collapsed behind a button showing the number of changed filter groups.
Availability counts as one group.

The programme covers all Ireland, including Northern Ireland. The map fits the
matching locations and uses clustered pins without visible event-name labels.
Event cards show supplied imagery, genre, venue, time and booking status.
Results render in batches of 30, with Show more exposing the remaining matches.
When no results have a map location, Map view shows a scrollable empty state
with recovery actions instead of an empty map and misleading zoom controls.

## Map tiles and caching

Leaflet loads raster tiles directly from
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with visible OpenStreetMap
attribution. The tile layer is attached only while the map has a visible,
non-zero-sized container. A phone's hidden List-view map makes no tile requests,
including after filtering or resizing. Hiding removes only the tile layer, not
the map instance, selected event or location state. The existing maximum zoom of
18 is explicit so clustering also works without the tile layer.

Panning loads fresh tiles after movement ends. Continuous pinch/fly-to zooms skip
intermediate tile levels. Subsequent automatic camera refits wait for 300 ms
without another result change, so typing does not refit the map on every key.
The result list, filtered pins and URL still update immediately. Initial fitting,
selecting an event and Near me are not debounced. Newer selection, location,
manual navigation or map removal cancels a pending automatic refit.

Tile images use the browser's normal HTTP cache and the provider's cache headers.
There is no service-worker tile cache, cache-busting query, proxy or offline
prefetch. Browser caching is subject to eviction and is not an offline-map
guarantee. Keep normal caching enabled and follow the
[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

Geographic limits are not enabled. An Ireland-wide tile-layer `bounds` could
exclude tiles wholly outside a padded island-wide rectangle, with map navigation
bounds as a separate control. Boundary tiles would still contain neighbouring
areas. Any restriction needs to account for offshore events and Near me requests
outside the supported area.

For a future self-hosted vector map, obtain a permitted regional extract rather
than archiving OSM's public raster or vector servers. Geofabrik offers an
[experimental Ireland and Northern Ireland Shortbread vector package](https://download.geofabrik.de/europe/ireland-and-northern-ireland.html).
[PMTiles](https://github.com/protomaps/PMTiles) can package a regional tileset for
on-demand access without downloading the whole archive to each visitor. Hosting
needs HTTP Range support and appropriate CORS; the renderer and style must match
the vector schema. The [Protomaps Leaflet vector renderer](https://github.com/protomaps/protomaps-leaflet)
is in maintenance mode and recommends MapLibre for new projects. No vector
migration or archive download is implemented.

## Search and availability

The list, map, result count and search suggestions use the same query, event-type,
booking, age and availability filters. Search matches titles, places, venues,
hosts and genres. Typing narrows the list and map together. Go or Enter shows the
matching results, rather than automatically selecting the first event. Selecting
a card, suggestion or pin opens that event. A suggestion does not replace the
query with its title, so other matching pins remain available.

The Culture Night name returns to default Browse/List state, clears filters and
selection, closes the filter panel and scrolls results to the top without
reloading the document or recreating an existing map. My Night saves are unchanged,
and Back restores the previous view. Modified clicks and opening the home link in
another tab retain normal browser behaviour.

**Available from** and **Available until** describe when you can attend. Events
match if their opening times overlap any part of that window. An event running
16:00-20:00 therefore matches availability of 19:00-20:00. Merely touching an
endpoint does not count. Equal availability times show what is on at that moment.
After-midnight times continue the programme night; the default window is
15:00-03:00.

Overlap does not guarantee late admission. Check booking information and the
full description for fixed-start performances and other attendance rules.

Selecting another marker replaces the non-modal popup. Clear removes both
search and selection; closing a popup does not reopen it when the query changes.
Popups show time, venue, booking status and supplied links first. Address, age,
accessibility and the full description are expandable. The header and body scroll
independently when necessary, with a 44-pixel close action and no modal backdrop.
Essentials use compact line spacing. Google Maps sits beside the venue's label
and value without enlarging its text line, and booking shows its status once
with a visually hidden semantic label. Interactive targets remain at least
44 pixels high. The transparent close button is inset inside the card border.
Selection survives switching between List and Map and resizing the viewport.
Unmapped events expose the same details in the list.

## Near me

The map's **Near me** button requests a location only when pressed. It centres
the current results around that location, with a blue dot and an accuracy circle.
It does not introduce a distance filter, change searches or reorder My Night.
Later searches and event selections can move the map normally. The adjacent
clear button removes the location and fits all current results again.

Location is requested once per press, not watched continuously. The request has
a ten-second timeout and may use a position cached by the browser for up to one
minute. Permission denial, timeout, missing support and unusable positions show
an explanation with a search alternative. Pending requests can be cancelled;
responses arriving after cancellation, event selection or map removal are ignored.
The button is not shown when there are no map results.

Coordinates stay in page memory and disappear on reload. They are never added
to saved plans, share links or an application backend. As with normal map panning,
the map tile provider receives requests for the area being viewed. Browser and
operating-system location services are governed by their own permissions.

## My Night

Save or remove an event using the bookmark button on its card or the action in
its popup. My Night opens in start-time order, with after-midnight events last,
and can show just those events on the map. Each event card has an attached
**Reorder** handle and up/down arrows, visible in every sort mode. Moving an event
uses the currently displayed order and automatically switches to **Custom order**.
That order stays active until you select **Start time**, **Title** or another sort.
The handles also support Space, arrow keys, Space to drop and Escape to cancel.
Cancelled or unchanged drags do not change the sort or saved plan.
Custom ordering is kept with the saved list; the chosen sort is kept in the URL.
Discovery searches and
filters do not hide saved events; returning to Browse restores those controls.
Booking links and complete event details remain available from each selection.
Saving an event does not reserve or book a place.

After the first explicit save to an empty plan, a small tip beside **My Night**
explains custom ordering and sharing. It does not move focus or block other
controls. Dismiss it with its close button, Escape, clicking or focusing elsewhere, or by
opening My Night. A separate programme-scoped `:tip-seen` storage flag prevents
repeat tips after later saves and reloads. If storage is unavailable, it is shown
at most once per visit. Opening a shared link or restoring saved data never
triggers the tip or writes this flag.

My Night's compact header keeps its title, count and share action together, with
Browse and List/Map controls underneath. Storage warnings remain visible.

The shortlist stores event URLs in this browser's `localStorage`, under
`culture-night:my-night:v1:<programme year>`. It survives refreshes and synchronises
changes between tabs on the same origin, but does not sync between browsers or
devices. No account is required. Unavailable saved events are reported and can
be removed explicitly.

If storage is blocked, full or unreadable, the page shows a warning and keeps
changes for the current visit only. Unreadable stored data is not automatically
overwritten. The initial empty render never writes over a stored shortlist.

## Sharing and restored state

Search, availability, event-type, booking and age filters, List/Map view, sorting
and the selected event restore from the URL on reload and browser Back/Forward.
Live search replaces the current history entry; explicit navigation creates
history entries. Map position fits the restored results rather than restoring
an exact camera position. Filter-panel expansion and scroll position are not
stored.

Use **Share search** beside the result count to share the current discovery
view. **Share event** in event details creates a standalone event link,
independent of discovery filters. This also works for an event outside the
default availability window. In map cards, the small share icon sits beside the
My Night button and retains a 44-pixel touch target and accessible label.

**Share My Night** creates a snapshot of the available saved events. The
recipient sees a separate **Shared night**, not their own My Night. Opening,
refreshing or browsing that link never saves its events automatically. Individual
Save buttons and **Add all to My Night** require an explicit action. Add all
merges available events with existing saves and never removes or replaces them.
**Replace My Night** is a separate action beside Add all. It requires confirmation
before replacing the current programme's saved list. Cancelling changes nothing,
and a shared plan with no available events cannot replace an existing plan.
Unavailable shared events are reported and are not imported.

Shared links preserve the chosen sort and exact custom sequence. Reordering a
shared preview also switches it to Custom order and changes its URL, not the
recipient's own My Night. The snapshot
does not update when either person later edits their own saved plan.

Links use `/1/2026/#...`: the path identifies the format version and programme
year, and the fragment holds the view or shared plan. The build exports that path
as real static HTML. Shared events use compact stable IDs in one ordered,
comma-separated field, for example `shared=~3BlgRkGR,~_ykpj-PD`. IDs are not
positions in the programme array. Repeated `shared` fields are rejected; that
earlier local format was not published.

There is no account, server-side storage or shared-plan service. The fragment
is not sent in the page request, but anyone with the complete link can read the
included events. Unsupported programme paths return 404; malformed or unsupported
legacy fragments show an error without changing saved plans. My Night's ordinary
address restores this browser's own plan; use its share button to explicitly
include a shared snapshot.

Links grow with the number of included events. Some messaging apps may reject
or shorten very long links; share fewer events if that happens.

Supported browsers open their native share sheet. Cancelling it does not copy
anything or report an error. Other native-share failures offer an explicit
**Copy link** action and a selectable link. Where native sharing is unavailable
or cannot handle the link, the button copies instead. Copying shows a confirmation;
blocked or unavailable clipboard access exposes a selectable link for manual copying.
Venue details include a Google Maps link using the event coordinates, or the
supplied venue/address when there are no coordinates. Route planning is not
implemented. Clicking the Culture Night name returns to the home view without
clearing saved plans.

### Stable event IDs

`src/api/event-ids.json` is an append-only registry of public event URLs and their
compact IDs. After refreshing event data, run:

```bash
npm run ids:generate
```

The generator derives an eight-character ID from each canonical event URL and
checks for collisions. Existing and retired mappings are retained, so reordering
or refreshing the dataset does not repoint an existing link. Do not regenerate
IDs from array indices or remove historical registry entries.
`npm run build` checks the registry before exporting the site; CI uses the same
build command.

## Checks

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Tests cover overlap and midnight boundaries, filtered search, duplicate titles,
complete event details, missing links, unmapped selections, result-card metadata,
progressive rendering, empty states, compact availability controls, saved URL
validation and chronological shortlist ordering.

### Browser regression tests

After `npm ci`, install the Chromium browser once and run the suite:

```bash
npx playwright install chromium
npm run test:e2e
```

Playwright starts its own Next development server on `127.0.0.1:3012` and stops
it afterwards. That port must be free. Do not run another Next dev server or a
build in this checkout at the same time, because they share `.next`.

The suite covers desktop and touch-emulated phones at 320, 360 and 390 CSS pixels,
plus a short landscape boundary. It checks discovery, initial List-to-Map
selection, empty-state recovery, My Night saving, refresh, chronological order,
booking links, removal, cross-tab updates and storage failures. Unit tests cover
after-midnight start ordering; the current programme has no events starting
between midnight and 03:00.

Sharing regressions cover URL restoration, history, standalone event links,
recipient-plan preservation on open/reload, explicit additive imports, unavailable
events, confirmed replacement, custom ordering, drag/keyboard controls, invalid
links, home navigation and clipboard fallbacks. Pure codec tests cover validation,
stable event identities, legacy links and whole-programme link round trips.

Location regressions mock geolocation, covering explicit requests, camera
centring, accuracy, cancellation, failures and unchanged filters/storage/URLs.
Native-sharing tests mock the operating-system share and clipboard APIs. They
never open real share targets or use the user's actual location or clipboard.
Tile-loading regressions count mocked tile requests, checking zero requests for
hidden maps, the canonical hostname, breakpoint changes and restored selections.
Controlled-clock cases cover the 300 ms refit threshold, cancellation by newer
actions, drag-end loading and continuous touch zoom without intermediate tiles.

External decorative images and map tiles are replaced with a deterministic
fixture. App code, programme data, markers, clustering and browser storage remain
real. Check the exported site separately when validating external imagery.
The HTML report, failure screenshots and traces are ignored by git:

```bash
npx playwright show-report
```

For browser changes, also check Go, Enter, suggestions, excluding filters,
Clear and popup dismissal. Compare list counts with clustered map totals, search
Belfast as well as towns in the Republic, and switch between List and Map.
Exercise long titles and descriptions at 320, 360
and 390 CSS pixels, including resizing an open popup. Its title and close action
must stay accessible, and another visible marker must remain selectable without
a modal dismissal. Touch emulation is not a substitute for physical-phone or
screen-reader testing.

See the [project README](../README.md) for the application overview, event data
refresh, and GitHub Pages deployment.

---
_Drafted by Wilson, Eoin's agent ("wow!")._
