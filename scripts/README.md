# Scraping events from the site

```bash
node scrape-site.ts
```

It should create a `data.json` file with the scraped date, and then a second `enrichedData.json` which will open each event in turn to get more information.

# Getting Geocode information

```bash
node edit-events.ts
```

Will read `enrichedData.json` and query Google's APIs to create `geocodedEvents.json` which can be used in the site app `/site/src/api/events.json`.