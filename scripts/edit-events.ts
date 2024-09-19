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
    console.log("More than 1 geocode result returned, picking the first", address);
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

const main = async () => {
  try {
    const eventsFilePath = path.join(__dirname, "enrichedData.json");
    const events = readDataFromFile(eventsFilePath);

    console.log("Length: ", events.length);
    // await new Promise(res => setTimeout(res, 10000));

    const updateEvents = [];

    const geocodedFilePath = path.join(__dirname, "geocodedEvents.json");
    for (let i = 0; i < events.length; i++) {
      let event = events[i];

      console.log("Geocoding", i, "-", event.title, "-", event.fullAddress);

      var geocode = await getGeocodeData(event.fullAddress);

      updateEvents.push({
        ...event,
        geocode: geocode,
      });

      if (i % 10 === 0) {
        saveDataToFile(geocodedFilePath, updateEvents);
      }
    }

    saveDataToFile(geocodedFilePath, updateEvents);

    // await browser.close();
  } catch (error) {
    console.error("Error:", error);
    // process.exit(1);
  }
};

main();
