const playwright = require("playwright");
const randomUseragent = require("random-useragent");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://culturenight.ie/events/?sf_paged=";

const getBasicEvents = async (eventsFilePath, context) => {
  const allEvents = [];

  const LIST_CONCURRENCY = Number(process.env.LIST_CONCURRENCY) || 5;
  let pageNumber = 1;
  let done = false;

  while (!done) {
    const batchNumbers = Array.from(
      { length: LIST_CONCURRENCY },
      (_, i) => pageNumber + i
    );

    const pageResults = await Promise.all(
      batchNumbers.map(async (num) => {
        const p = await context.newPage({ bypassCSP: true });
        try {
          await p.setDefaultTimeout(30000);
          await p.setViewportSize({ width: 800, height: 600 });
          await p.goto(BASE_URL + num);

          const noResultsVisible = await p
            .locator("div.wb-no-results")
            .isVisible();
          if (noResultsVisible) {
            await p.close();
            return { num, events: [], noResults: true };
          }

          const pageOfEvents = await scrapeAllEvents(p);
          await p.close();
          return { num, events: pageOfEvents, noResults: false };
        } catch (err) {
          console.error("Error loading listing page", num, err);
          try {
            await p.close();
          } catch (e) {
            /* ignore */
          }
          return { num, events: [], noResults: true };
        }
      })
    );

    pageResults.sort((a, b) => a.num - b.num);

    for (const res of pageResults) {
      if (res.noResults) {
        done = true;
        break;
      }

      allEvents.push(...res.events);
      // Save after each successful page to persist progress
      saveDataToFile(eventsFilePath, allEvents);
    }

    pageNumber += LIST_CONCURRENCY;
  }

  return allEvents;
};

const getEnrichedEvents = async (enrichedFilePath, context, allEvents) => {
  const allEnrichedEvents = [];

  const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 20;
  const START_INDEX = Number(process.env.START_INDEX) || 0;

  for (let i = START_INDEX; i < allEvents.length; i += MAX_CONCURRENT) {
    const batch = allEvents.slice(i, i + MAX_CONCURRENT);
    console.log(`Processing batch ${i} - ${i + batch.length - 1}`);

    const promises = batch.map(async (event, j) => {
      const index = i + j;
      console.log("Parsing ", index, ": ", event.url);

      const eventPage = await context.newPage({ bypassCSP: true });
      try {
        await eventPage.setDefaultTimeout(30000);
        await eventPage.setViewportSize({ width: 800, height: 600 });
        await eventPage.goto(event.url);
        const enrichedEvent = await scrapeEvent(eventPage);
        await eventPage.close();
        return { ...event, ...enrichedEvent };
      } catch (err) {
        console.error("Error scraping event", index, event.url, err);
        try {
          await eventPage.close();
        } catch (e) {
          /* ignore */
        }
        return { ...event, scrapeError: String(err) };
      }
    });

    const results = await Promise.all(promises);
    allEnrichedEvents.push(...results);

    // Periodically save progress
    if (
      allEnrichedEvents.length % 10 === 0 ||
      i + MAX_CONCURRENT >= allEvents.length
    ) {
      saveDataToFile(enrichedFilePath, allEnrichedEvents);
    }
  }

  // Final save (in case not saved in loop)
  saveDataToFile(enrichedFilePath, allEnrichedEvents);

  return allEnrichedEvents;
};

const splitTimeToObject = (time) => {
  const components = time.split(":");
  return { hour: parseInt(components[0]), minute: parseInt(components[1]) };
};

const scrapeAllEvents = async (page) => {
  return page.$$eval(".wb-event-card", (eventCards) => {
    return eventCards.map((card) => {
      const getInnerText = (element) => element && element.innerText.trim();
      const getImgAlt = (element) => element && element.alt;
      const formatArray = (elements, func) =>
        elements && [...elements].map((element) => func(element));

      const image = card.querySelector("a.wb-image-container img");
      const url = card.querySelector("a.wb-event-title-link");
      const title = card.querySelector("h3.wb-event-title");
      const description = card.querySelector("div.wb-event-description p");
      const locations = card.querySelectorAll("p.wb-event-location");
      const time = getInnerText(card.querySelector("p.wb-event-time"));
      const times = time.split(" ");
      const features = card.querySelectorAll("img.wb-facility-icon");

      console.log(image);

      return {
        title: getInnerText(title),
        image: image.getAttribute("data-src"),
        url: url.href,
        description: getInnerText(description),
        locations: formatArray(locations, getInnerText),
        time: time,
        startTime: splitTimeToObject(times[0]),
        endTime: splitTimeToObject(times[2]),
        features: formatArray(features, getImgAlt),
      };
    });
  });
};

const scrapeEvent = async (page) => {
  return page.$$eval(
    "div.elementor-element-d49263f > div.elementor-widget-wrap",
    (ep) => {
      const eventPage = ep[0];

      const getUrlDetails = (element) =>
        element && { title: getInnerText(element), url: element.href };
      const getInnerText = (element) => element && element.innerText.trim();
      const formatArray = (elements, func) =>
        elements && [...elements].map((element) => func(element));

      const host = eventPage.querySelector(
        "div.elementor-element-3d84bbf > div > div"
      );
      const isOffline = eventPage.querySelector(
        "div.elementor-element-c831f54 > div > ul > li > span > span > span.elementor-post-info__terms-list-item"
      );
      const bookingIsRequired = eventPage.querySelector(
        "div.elementor-element-0543dab > div > div"
      );
      const bookingLink = eventPage.querySelector("div.booking-link > a");
      const onlineContentLink = eventPage.querySelector(
        "div.link-to-online > a"
      );

      const ageGroup = eventPage.querySelector(
        "div.elementor-element-5f74582 > div > div > span"
      );

      const locations = eventPage.querySelectorAll(
        "div.elementor-element-c5099fa > div > ul > li.elementor-repeater-item-1cb9dcb > span > span > a.elementor-post-info__terms-list-item"
      );
      const description = eventPage.querySelector(
        "div.elementor-element-35d9c75"
      );
      let fullAddress = eventPage.querySelector(
        "div.elementor-element-fc128eb > div.elementor-widget-container > div.elementor-heading-title"
      );
      fullAddress = fullAddress && getInnerText(fullAddress);

      let venueName = eventPage.querySelector(
        "div.elementor-element-709165a > div > div > div > div > p"
      );

      const genres = eventPage.querySelectorAll(
        "div.elementor-element-109142e > div > ul > li > span > span > a.elementor-post-info__terms-list-item"
      );

      return {
        host: getInnerText(host),
        eventType: getInnerText(isOffline),
        bookingDetails: getInnerText(bookingIsRequired),
        bookingLink: bookingLink && bookingLink.href,
        onlineContentLink: onlineContentLink && onlineContentLink.href,
        ageGroup: getInnerText(ageGroup),
        description: getInnerText(description),
        locations: formatArray(locations, getUrlDetails),
        venueName: getInnerText(venueName),
        fullAddress: fullAddress,
        genres: formatArray(genres, getUrlDetails),
      };
    }
  );
};

const saveDataToFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log("Data saved to:", filePath);
};

const readDataFromFile = (filePath) => {
  console.log("Reading data from:", filePath);
  return JSON.parse(fs.readFileSync(filePath));
};

const main = async () => {
  try {
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();

    const eventsFilePath = path.join(__dirname, "data.json");
    // const allEvents = await getBasicEvents(eventsFilePath, context);

    // Uncomment below to read from existing scraped data
    const allEvents = readDataFromFile(eventsFilePath);
    // console.log("Events:", allEvents);

    console.log("Enriching events.", allEvents.length);

    const enrichedFilePath = path.join(__dirname, "enrichedData.json");
    const allEnrichedEvents = await getEnrichedEvents(
      enrichedFilePath,
      context,
      allEvents
    );

    saveDataToFile(enrichedFilePath, allEnrichedEvents);

    await browser.close();
  } catch (error) {
    console.error("Error:", error);
    await new Promise((res) => setTimeout(res, 10000));
    process.exit(1);
  }
};

main();
