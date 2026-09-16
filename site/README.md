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

## Search and availability

The list, map, result count and search suggestions use the same query, event-type,
booking, age and availability filters. Search matches titles, places, venues,
hosts and genres. Typing narrows the list and map together. Go or Enter shows the
matching results, rather than automatically selecting the first event. Selecting
a card, suggestion or pin opens that event. A suggestion does not replace the
query with its title, so other matching pins remain available.

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
Selection survives switching between List and Map and resizing the viewport.
Unmapped events expose the same details in the list.

No shortlist, geolocation, itinerary or persisted/shareable filter state is
implemented by this design change. Event identity uses the official URL in
application state; it does not imply browser-URL persistence.

## Checks

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Tests cover overlap and midnight boundaries, filtered search, duplicate titles,
complete event details, missing links, unmapped selections, result-card metadata,
progressive rendering, empty states and the compact availability controls.

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
