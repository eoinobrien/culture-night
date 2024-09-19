const playwright = require("playwright");
const randomUseragent = require("random-useragent");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://culturenight.ie/events/?sf_paged=";

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

      return {
        title: getInnerText(title),
        image: image.src,
        url: url.href,
        description: getInnerText(description),
        locations: formatArray(locations, getInnerText),
        time: time,
        startTime: times[0],
        endTime: times[2],
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
      const onlineContentLink = eventPage.querySelector("div.link-to-online > a");

      const ageGroup = eventPage.querySelector(
        "div.elementor-element-5f74582 > div > div > span"
      );

      const locations = eventPage.querySelectorAll(
        "div.elementor-element-c5099fa > div > ul > li.elementor-repeater-item-1cb9dcb > span > span > a.elementor-post-info__terms-list-item"
      );
      const description = eventPage.querySelector(
        "div.elementor-element-44020af"
      );

      const FULL_ADDRESS_LENGTH = 14;
      let fullAddress = eventPage.querySelector(
        "div.elementor-element-3a77ce2 > div.elementor-widget-container > div.elementor-heading-title"
      );
      fullAddress = fullAddress && getInnerText(fullAddress);
      fullAddress = fullAddress && fullAddress.substring(FULL_ADDRESS_LENGTH);

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

    // const allEvents = [];
    const page = await context.newPage({ bypassCSP: true });
    await page.setDefaultTimeout(30000);
    await page.setViewportSize({ width: 800, height: 600 });

    const eventsFilePath = path.join(__dirname, "data.json");

    // for (let pageNumber = 1; true; pageNumber++) {
    //   console.log("Page: ", pageNumber);

    //   await page.goto(BASE_URL + pageNumber);

    //   var noResultsVisible = await page
    //     .locator("div.wb-no-results")
    //     .isVisible();

    //   if (noResultsVisible) {
    //     console.log("No events found. Breaking");
    //     break;
    //   }

    //   var pageOfEvents = await scrapeAllEvents(page);
    //   allEvents.push.apply(allEvents, pageOfEvents);

    //   saveDataToFile(eventsFilePath, allEvents);
    // }

    // console.log("Events:", allEvents);
    const allEvents = readDataFromFile(eventsFilePath);

    console.log("Enriching events.", allEvents.length);

    const allEnrichedEvents = [];

    const enrichedFilePath = path.join(__dirname, "enrichedData.json");
    // const allEnrichedEvents = readDataFromFile(enrichedFilePath);
    for (let i = 1551; i < allEvents.length; i++) {
      let event = allEvents[i];

      console.log("Parsing ", i, ": ", event.url);

      await page.goto(event.url);
      var enrichedEvent = await scrapeEvent(page);

      allEnrichedEvents.push({ ...event, ...enrichedEvent });

      if (i % 10 === 0) {
        saveDataToFile(enrichedFilePath, allEnrichedEvents);
      }
    }

    saveDataToFile(enrichedFilePath, allEnrichedEvents);

    await browser.close();
  } catch (error) {
    console.error("Error:", error);
    await new Promise((res) => setTimeout(res, 10000));
    process.exit(1);
  }
};

main();
