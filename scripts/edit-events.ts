const playwright = require("playwright");
const randomUseragent = require("random-useragent");
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://culturenight.ie/events/?sf_paged=";
const CREATE_GEOCODE_API_URL = (address) =>
  `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=<API KEY>`;

const getGeocodeData = async (address) => {
  var url = CREATE_GEOCODE_API_URL(address);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Response status: ${response.status}`);
  }

  const json = await response.json();

  const results = json.results;

  if (results.length > 1) {
    console.log(
      "More than 1 geocode result returned, picking the first",
      address
    );
  }

  if (results.length == 0) {
    console.log("No geocode result returned", address);

    return null;
  }

  const result = results[0];

  return result.geometry.location;
};

const readDataFromFile = (filePath) => {
  console.log("Reading data from:", filePath);
  return JSON.parse(fs.readFileSync(filePath));
};

const saveDataToFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log("Data saved to:", filePath);
};

const getGeocodedEvents = async (geocodedFilePath, events) => {
  const geocodedEvents = [];

  const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 5;
  const START_INDEX = Number(process.env.START_INDEX) || 0;

  for (let i = START_INDEX; i < events.length; i += MAX_CONCURRENT) {
    const batch = events.slice(i, i + MAX_CONCURRENT);
    console.log(`Processing batch ${i} - ${i + batch.length - 1}`);

    const promises = batch.map(async (event, j) => {
      const index = i + j;

      console.log("Geocoding", index, "-", event.title, "-", event.fullAddress);

      try {
        var geocode = await getGeocodeData(event.fullAddress);

        return {
          ...event,
          geocode: geocode,
        };
      } catch (err) {
        console.error("Error getting event geocode", index, event.title, event.fullAddress, err);
        return { ...event, geocodeError: String(err) };
      }
    });

    const results = await Promise.all(promises);
    geocodedEvents.push(...results);

    // Periodically save progress
    if (
      geocodedEvents.length % 10 === 0 ||
      i + MAX_CONCURRENT >= events.length
    ) {
      saveDataToFile(geocodedFilePath, geocodedEvents);
    }
  }

  // Final save (in case not saved in loop)
  saveDataToFile(geocodedFilePath, geocodedEvents);

  return geocodedEvents;
};
const main = async () => {
  try {
    const eventsFilePath = path.join(__dirname, "enrichedData.json");
    const events = readDataFromFile(eventsFilePath);

    console.log("Length: ", events.length);
    // await new Promise(res => setTimeout(res, 10000));

    const geocodedFilePath = path.join(__dirname, "geocodedEvents.json");

    const updateEvents = getGeocodedEvents(geocodedFilePath, events);

    saveDataToFile(geocodedFilePath, updateEvents);

    // await browser.close();
  } catch (error) {
    console.error("Error:", error);
    // process.exit(1);
  }
};

main();
