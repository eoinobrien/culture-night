# Culture Night web application

The site is published at <https://culturenight.eoin.co/>.

From this directory:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The static export is written to `out/`.

## Search and availability

The map, search suggestions and Go action use the same event-type, booking,
age and availability filters. Search matches titles, places, venues, hosts and
genres. Go selects the first matching event; typing a query does not further
filter the map.

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
Popups show supplied attendance details and links, with internally scrollable
content on small screens. Unmapped events expose the same details beside search.

## Checks

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Tests cover overlap and midnight boundaries, filtered search, duplicate titles,
complete event details, missing links and unmapped selections.

For browser changes, also check Go, Enter, suggestions, excluding filters,
Clear and popup dismissal. Exercise long titles and descriptions at 320, 360
and 390 CSS pixels, including resizing an open popup. Its title and close action
must stay accessible, and another visible marker must remain selectable without
a modal dismissal. Touch emulation is not a substitute for physical-phone or
screen-reader testing.

See the [project README](../README.md) for the application overview, event data
refresh, and GitHub Pages deployment.

---
_Drafted by Wilson, Eoin's agent ("wow!")._
