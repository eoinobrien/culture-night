const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  fetchText,
  parseTimeRange,
  saveJson,
  validateEvents,
} = require("./event-data.cjs");

const BASE_URL = "https://culturenight.ie/events/";

async function scrapeListing(page) {
  const listing = await page.evaluate(() => ({
    pagination: document.querySelector(".wp-pagenavi .pages")?.textContent,
    events: Array.from(document.querySelectorAll(".wb-event-card")).map((card) => {
      const text = (selector) => card.querySelector(selector)?.textContent.trim() || "";
      const image = card.querySelector(".wb-image-container img");
      return {
        title: text(".wb-event-title"),
        image: image?.getAttribute("data-src") || image?.getAttribute("src") || "",
        url: card.querySelector(".wb-event-title-link")?.href,
        description: text(".wb-event-description"),
        locations: Array.from(card.querySelectorAll(".wb-event-location"), (e) => e.textContent.trim()),
        time: text(".wb-event-time"),
        features: Array.from(new Set(Array.from(card.querySelectorAll("img.wb-facility-icon"), (e) => e.alt))),
      };
    }),
  }));
  const pagination = listing.pagination?.match(/Page (\d+) of (\d+)/);
  if (!pagination || !listing.events.length) {
    throw new Error("Missing event cards or pagination; the listing markup may have changed.");
  }
  return {
    page: Number(pagination[1]),
    pages: Number(pagination[2]),
    events: listing.events.map((event) => ({ ...event, ...parseTimeRange(event.time) })),
  };
}

async function scrapeEvent(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".elementor-element-d49263f");
    const descriptions = root?.querySelectorAll(".elementor-element-35d9c75, .elementor-element-5b2edab");
    if (!descriptions?.length) {
      throw new Error("Missing event detail content; the detail markup may have changed.");
    }
    const text = (selector) => root.querySelector(selector)?.innerText.trim() || "";
    const links = (selector) => Array.from(root.querySelectorAll(selector), (e) => ({
      title: e.textContent.trim(),
      url: e.href,
    }));
    const map = root.querySelector(".elementor-widget-google_maps iframe");
    return {
      host: text(".elementor-element-3d84bbf .elementor-shortcode"),
      eventType: text(".elementor-element-c831f54 .elementor-post-info__terms-list"),
      bookingDetails: text(".elementor-element-0543dab .elementor-shortcode"),
      bookingLink: root.querySelector(".booking-link a")?.href || null,
      onlineContentLink: root.querySelector(".link-to-online a")?.href || null,
      ageGroup: text(".elementor-element-5f74582 .elementor-shortcode"),
      description: Array.from(descriptions, (element) => element.innerText.trim()).filter(Boolean).join("\n\n"),
      locations: links(".elementor-element-c5099fa a.elementor-post-info__terms-list-item"),
      venueName: text(".venue-name p") || null,
      fullAddress: text(".elementor-element-fc128eb .elementor-heading-title"),
      genres: links(".elementor-element-109142e a.elementor-post-info__terms-list-item"),
      features: Array.from(new Set(Array.from(root.querySelectorAll(".wb-facility-icons .wb-event-icon"), (e) =>
        e.getAttribute("alt") || e.textContent.trim()).filter(Boolean))),
      mapUrl: map?.getAttribute("data-src") || map?.getAttribute("src") || null,
    };
  });
}

async function main() {
  const date = process.argv.find((arg) => arg.startsWith("--date="))?.slice(7);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error("Supply the official event date, for example --date=2026-09-18.");
  }
  const year = Number(date.slice(0, 4));
  const homepage = await fetchText("https://culturenight.ie/");
  const officialDate = new Intl.DateTimeFormat("en-IE", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(date));
  if (!homepage.includes(officialDate)) {
    throw new Error(`The official homepage does not confirm ${officialDate}; refusing to relabel the programme.`);
  }

  const concurrency = Number(process.env.MAX_CONCURRENT || 3);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("MAX_CONCURRENT must be an integer between 1 and 8.");
  }
  const cacheDir = path.join(__dirname, ".scrape-cache", date);
  fs.mkdirSync(cacheDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    // Parse source HTML without loading images, embeds, analytics, or page scripts.
    await context.route("**/*", (route) => route.abort());
    const pages = await Promise.all(Array.from({ length: concurrency }, () => context.newPage()));
    const load = async (page, url, resume = false) => {
      const cachePath = path.join(cacheDir, createHash("sha256").update(url).digest("hex") + ".html");
      const html = resume && fs.existsSync(cachePath)
        ? fs.readFileSync(cachePath, "utf8")
        : await fetchText(url);
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      return () => fs.writeFileSync(cachePath, html);
    };
    await load(pages[0], BASE_URL);
    const first = await scrapeListing(pages[0]);
    if (first.page !== 1) throw new Error("Expected the first listing page.");
    const events = [...first.events];
    for (let start = 2; start <= first.pages; start += concurrency) {
      const numbers = Array.from({ length: Math.min(concurrency, first.pages - start + 1) }, (_, i) => start + i);
      const batch = await Promise.all(numbers.map(async (number, i) => {
        await load(pages[i], `${BASE_URL}?sf_paged=${number}`);
        const listing = await scrapeListing(pages[i]);
        if (listing.page !== number || listing.pages !== first.pages) {
          throw new Error(`Pagination changed on page ${number}; rerun for a consistent listing.`);
        }
        return listing.events;
      }));
      events.push(...batch.flat());
      console.log(`Listing ${numbers.at(-1)}/${first.pages}: ${events.length} events`);
    }
    validateEvents(events, false);
    const enriched = [];
    for (let start = 0; start < events.length; start += concurrency) {
      const batch = await Promise.all(events.slice(start, start + concurrency).map(async (event, i) => {
        try {
          const cache = await load(pages[i], event.url, process.argv.includes("--resume"));
          const detail = await scrapeEvent(pages[i]);
          cache();
          return { ...event, ...detail };
        } catch (error) {
          throw new Error(`Failed to scrape ${event.url}: ${error.message}`, { cause: error });
        }
      }));
      enriched.push(...batch);
      if (start % (concurrency * 10) === 0 || enriched.length === events.length) {
        console.log(`Details ${enriched.length}/${events.length}`);
      }
    }
    validateEvents(enriched, false);
    saveJson(path.join(__dirname, "data.json"), events);
    saveJson(path.join(__dirname, "enrichedData.json"), enriched);
    saveJson(path.join(__dirname, "programme.json"), {
      year, date, source: BASE_URL, fetchedAt: new Date().toISOString(),
      listingPages: first.pages, eventCount: enriched.length,
    });
    console.log(`Scraped all ${enriched.length} events. Run npm run geocode to update the site dataset.`);
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeListing, scrapeEvent };
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
