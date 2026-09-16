const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { scrapeListing, scrapeEvent } = require("./scrape-site.ts");

test("parses listing and detail HTML without page scripts or external resources", async () => {
  const browser = await chromium.launch({
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(`
      <div class="wb-event-card">
        <a class="wb-image-container"><img data-src="https://example.test/event.jpg"></a>
        <a class="wb-event-title-link" href="https://culturenight.ie/event/example/">
          <h3 class="wb-event-title">Example &amp; Friends</h3>
        </a>
        <div class="wb-event-description"><p>A concert.</p></div>
        <p class="wb-event-location">Dublin</p>
        <p class="wb-event-time">23:00 &#8211; 01:30</p>
      </div>
      <div class="wp-pagenavi"><span class="pages">Page 1 of 2</span></div>`);
    const listing = await scrapeListing(page);
    assert.equal(listing.pages, 2);
    assert.equal(listing.events[0].title, "Example & Friends");
    assert.deepEqual(listing.events[0].endTime, { hour: 1, minute: 30 });
    assert.deepEqual(listing.events[0].features, []);

    await page.setContent(`
      <div class="elementor-element-d49263f">
        <div class="elementor-element-35d9c75"><p>First paragraph.</p><p>Second paragraph.</p></div>
        <div class="elementor-element-3d84bbf"><div class="elementor-shortcode">Host</div></div>
        <div class="elementor-element-c831f54"><span class="elementor-post-info__terms-list">In Person</span></div>
        <div class="venue-name"><p>Venue</p></div>
        <div class="elementor-element-fc128eb"><div class="elementor-heading-title">Venue, Dublin</div></div>
        <div class="booking-link"><a href="https://example.test/book">Book</a></div>
        <div class="elementor-widget-google_maps"><iframe data-src="https://maps.google.com/maps?q=Venue"></iframe></div>
        <div class="wb-facility-icons"><span class="wb-event-icon">Wheelchair accessible</span></div>
      </div>`);
    const detail = await scrapeEvent(page);
    assert.equal(detail.description, "First paragraph.\n\nSecond paragraph.");
    assert.equal(detail.eventType, "In Person");
    assert.equal(detail.venueName, "Venue");
    assert.equal(detail.bookingLink, "https://example.test/book");
    assert.equal(detail.mapUrl, "https://maps.google.com/maps?q=Venue");
    assert.equal(detail.onlineContentLink, null);
    assert.deepEqual(detail.features, ["Wheelchair accessible"]);
    assert.deepEqual(detail.locations, []);

    await page.setContent(`
      <div class="elementor-element-d49263f">
        <div class="elementor-element-5b2edab"><p>Irish-language description.</p></div>
      </div>`);
    assert.equal((await scrapeEvent(page)).description, "Irish-language description.");

    await page.setContent("<html><body>Service unavailable</body></html>");
    await assert.rejects(() => scrapeListing(page), /Missing event cards or pagination/);
    await assert.rejects(() => scrapeEvent(page), /Missing event detail content/);
  } finally {
    await browser.close();
  }
});
