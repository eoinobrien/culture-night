const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseTimeRange, validateEvents } = require("./event-data.cjs");
const { parseMapGeocode, addressKey, sourcePostcode, googleGeocode } = require("./edit-events.ts");

test("parses evening, overnight, and midnight times into the site's shape", () => {
  assert.deepEqual(parseTimeRange("19:30 - 01:15"), {
    startTime: { hour: 19, minute: 30 }, endTime: { hour: 1, minute: 15 },
  });
  assert.deepEqual(parseTimeRange("23:00 - 24:00").endTime, { hour: 0, minute: 0 });
  for (const value of ["TBC", "19:00", "25:00 - 26:00", "19:60 - 20:00", "24:15 - 01:00"]) {
    assert.throws(() => parseTimeRange(value));
  }
});

test("rejects incomplete, duplicated or malformed datasets before publishing", () => {
  const event = {
    title: "Example", url: "https://culturenight.ie/event/example/",
    ...parseTimeRange("18:00 - 21:00"), geocode: { lat: 53.3, lng: -6.2 },
  };
  validateEvents([event]);
  validateEvents([{ ...event, geocode: null }]);
  for (const data of [[], [event, event], [{ ...event, geocode: undefined }],
    [{ ...event, startTime: "18:00" }], [{ ...event, scrapeError: "HTTP 500" }],
    [{ ...event, geocode: { lat: NaN, lng: 0 } }]]) {
    assert.throws(() => validateEvents(data));
  }
});

test("extracts a unique map place rather than the viewport centre", () => {
  const point = ["0x123:0xabc", "Venue, Dublin", [53.3, -6.2]];
  const html = `initEmbed(${JSON.stringify([[[1000, -7, 54]], [point, "Venue"]])});`;
  assert.deepEqual(parseMapGeocode(html), { lat: 53.3, lng: -6.2 });
  assert.equal(parseMapGeocode("initEmbed([[[1000,-7,54]]]);"), null);
  assert.equal(parseMapGeocode(`initEmbed(${JSON.stringify([point, ["0x456:0xdef", "Other", [54, -7]]])});`), null);
  assert.throws(() => parseMapGeocode("<html>Service unavailable</html>"));
  assert.equal(addressKey(" Venue,  Dublin \n"), "venue, dublin");
});

test("accepts co-located source search markers but rejects ambiguous locations", () => {
  const marker = [["5217154745182911471", "11473412142795502676"], "/g/example", null, [533397994, 4232381545]];
  const nearby = [["5217154745182911472", "11473412142795502677"], null, null, [533397995, 4232381546]];
  assert.deepEqual(parseMapGeocode(`initEmbed(${JSON.stringify([marker, nearby])});`), {
    lat: 53.3397994, lng: -6.2585751,
  });

  const distant = [["123", "456"], null, null, [543397994, 4232381545]];
  assert.equal(parseMapGeocode(`initEmbed(${JSON.stringify([marker, distant])});`), null);
});

test("refines an ambiguous map only with a unique postcode supplied by the source", () => {
  assert.equal(sourcePostcode("Macroom Library, Cork, P12 KR25, Ireland"), "P12KR25");
  assert.equal(sourcePostcode("11 Eustace St, Dublin 2 D02FY92"), "D02FY92");
  assert.equal(sourcePostcode("Saltwater Square, Belfast BT12 5AX"), "BT125AX");
  assert.equal(sourcePostcode("Venue, Dublin, D6W NP98"), "D6WNP98");
  assert.equal(sourcePostcode("Cork, Ireland"), null);
  assert.equal(sourcePostcode("P12 KR25 or V93 E221"), null);
});

test("Google API rejects overseas results and never includes the key in failures", async () => {
  const originalFetch = global.fetch;
  const key = "test-key-not-a-real-credential";
  const result = (country, region, lat, lng) => ({
    status: "OK",
    results: [{
      geometry: { location: { lat, lng } },
      formatted_address: "Test venue",
      address_components: [
        { types: ["country"], short_name: country },
        { types: ["administrative_area_level_1"], long_name: region },
      ],
    }],
  });
  const respond = (data) => {
    global.fetch = async () => ({ ok: true, json: async () => data });
  };
  try {
    respond(result("IE", "County Dublin", 53.3, -6.2));
    assert.deepEqual(await googleGeocode("Dublin", key), { lat: 53.3, lng: -6.2 });
    respond(result("GB", "Northern Ireland", 54.6, -5.93));
    assert.deepEqual(await googleGeocode("Belfast", key), { lat: 54.6, lng: -5.93 });
    respond(result("GB", "Scotland", 55.4, -6.4));
    await assert.rejects(() => googleGeocode("Venue", key), /outside Ireland/);
    respond({ status: "ZERO_RESULTS" });
    assert.equal(await googleGeocode("Unknown venue", key), null);
    respond({ status: "REQUEST_DENIED", error_message: key });
    await assert.rejects(() => googleGeocode("Venue", key), (error) =>
      error.message.includes("REQUEST_DENIED") && !error.message.includes(key));
    global.fetch = async () => { throw new Error(key); };
    await assert.rejects(() => googleGeocode("Venue", key), (error) =>
      error.message.includes("request failed") && !error.message.includes(key));
  } finally {
    global.fetch = originalFetch;
  }
});
