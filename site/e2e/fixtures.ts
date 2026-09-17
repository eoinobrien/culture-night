import { readFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect } from "@playwright/test";

const decorativeImage = readFileSync(path.join(__dirname, "fixtures/decorative.svg"));

export const test = base.extend<{ browserChecks: void }>({
  browserChecks: [async ({ context, baseURL }, use) => {
    const pageErrors: string[] = [];
    context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message)));
    if (!baseURL) throw new Error("Browser tests require a configured baseURL.");
    const origin = new URL(baseURL).origin;

    await context.addInitScript(() => {
      Object.defineProperties(navigator, {
        share: { configurable: true, value: undefined },
        canShare: { configurable: true, value: undefined },
      });
    });

    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin && request.resourceType() === "image") {
        await route.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: decorativeImage,
        });
      } else {
        await route.continue();
      }
    });

    await use();
    expect(pageErrors, "Unexpected application pageerrors").toEqual([]);
  }, { auto: true }],
});

export { expect } from "@playwright/test";
