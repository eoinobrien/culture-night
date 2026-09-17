import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import events from "../src/api/events.json";
import { programmeYear } from "../src/api/programme";
import { createStateLink, defaultUrlState, readStateLink } from "../src/lib/url-state";
import { myNightStorageKey } from "../src/lib/my-night";

type ClipboardMode = "ok" | "denied" | "missing" | "pending";
type NativeMode = "resolve" | "pending" | "cancel" | "denied" | "sync-failure" | "unexpected";
type Activation = { active: boolean; clickType?: string };

declare global {
  interface Window {
    nativeSharingTest: {
      writes: number;
      originalPlan: string | null;
      shares: (Activation & { data: ShareData })[];
      checks: ShareData[];
      copies: (Activation & { text: string })[];
      resolveShare?: () => void;
      rejectShare?: (name: string) => void;
      resolveCopy?: () => void;
      rejectCopy?: () => void;
    };
  }
}

const key = myNightStorageKey(programmeYear);
const evening = events[0];
const singing = events[1];
const searchShare = (page: Page) => page.getByRole("button", { name: "Share search", exact: true });
const field = (page: Page) => page.getByRole("textbox", { name: "Share link", exact: true });
const copied = (page: Page) => page.getByRole("status").filter({ hasText: "Link copied" });
const readLink = (url: string) => readStateLink(url, events, programmeYear);

async function prepare(page: Page, seed?: string[], clipboard: ClipboardMode = "ok") {
  await page.addInitScript(({ key, seed, clipboard }) => {
    if (seed) localStorage.setItem(key, JSON.stringify(seed));
    window.nativeSharingTest = {
      writes: 0, originalPlan: localStorage.getItem(key), shares: [], checks: [], copies: [],
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) window.nativeSharingTest.writes++;
      setItem.call(this, name, value);
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard === "missing" ? undefined : {
        writeText: (text: string) => {
          window.nativeSharingTest.copies.push({
            text, active: navigator.userActivation.isActive, clickType: window.event?.type,
          });
          if (clipboard === "denied") return Promise.reject(new DOMException("Clipboard denied", "NotAllowedError"));
          if (clipboard === "pending") {
            return new Promise<void>((resolve, reject) => {
              window.nativeSharingTest.resolveCopy = resolve;
              window.nativeSharingTest.rejectCopy = () => reject(new DOMException("Clipboard denied", "NotAllowedError"));
            });
          }
          return Promise.resolve();
        },
      },
    });
  }, { key, seed, clipboard });
}

// Install after navigation so the common fixture always disables real native APIs first.
async function mockNative(page: Page, mode: NativeMode = "resolve", canShare: boolean | "missing" = true) {
  await page.evaluate(({ mode, canShare }) => {
    Object.defineProperties(navigator, {
      canShare: {
        configurable: true,
        value: canShare === "missing" ? undefined : (data: ShareData) => {
          window.nativeSharingTest.checks.push(data);
          return canShare;
        },
      },
      share: {
        configurable: true,
        value: (data: ShareData) => {
          window.nativeSharingTest.shares.push({
            data, active: navigator.userActivation.isActive, clickType: window.event?.type,
          });
          if (mode === "cancel") return Promise.reject(new DOMException("User cancelled", "AbortError"));
          if (mode === "denied") return Promise.reject(new DOMException("Sharing denied", "NotAllowedError"));
          if (mode === "sync-failure") throw new DOMException("Sharing blocked", "NotAllowedError");
          if (mode === "unexpected") return Promise.reject(new Error("Unexpected native sharing failure"));
          if (mode === "pending") {
            return new Promise<void>((resolve, reject) => {
              window.nativeSharingTest.resolveShare = resolve;
              window.nativeSharingTest.rejectShare = (name) => reject(new DOMException("Sharing failed", name));
            });
          }
          return Promise.resolve();
        },
      },
    });
  }, { mode, canShare });
}

async function expectNoSharingFeedback(page: Page) {
  await expect(copied(page)).toHaveCount(0);
  await expect(field(page)).toHaveCount(0);
  await expect(page.locator(".share-control [role='alert']")).toHaveCount(0);
  await expect(page.locator(".share-control [role='status']")).toHaveCount(0);
}

test.afterEach(async ({ page }) => {
  const storage = await page.evaluate((key) => ({
    writes: window.nativeSharingTest.writes,
    current: localStorage.getItem(key),
    original: window.nativeSharingTest.originalPlan,
  }), key);
  expect(storage.writes, "Sharing must never write My Night").toBe(0);
  expect(storage.current).toBe(storage.original);
});

test("the common fixture disables native APIs and unsupported sharing copies within the click", async ({ page, context }) => {
  await prepare(page);
  await page.goto("/");
  expect(await page.evaluate(() => [typeof navigator.share, typeof navigator.canShare])).toEqual(["undefined", "undefined"]);
  const anotherPage = await context.newPage();
  await anotherPage.goto("/");
  expect(await anotherPage.evaluate(() => [typeof navigator.share, typeof navigator.canShare])).toEqual(["undefined", "undefined"]);
  await anotherPage.close();

  await searchShare(page).click();
  await expect(copied(page)).toBeVisible();
  const { shares, copies } = await page.evaluate(() => window.nativeSharingTest);
  expect(shares).toEqual([]);
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatchObject({ active: true, clickType: "click" });
  expect(readLink(copies[0].text).collection).toBe("browse");
});

test("native My Night sharing gets the plan link during the original click without claiming delivery", async ({ page }) => {
  const seed = [evening.url, singing.url];
  await prepare(page, seed);
  await page.goto("/");
  await page.getByRole("button", { name: /^My Night,/ }).click();
  await mockNative(page);
  const share = page.getByRole("button", { name: "Share My Night", exact: true });
  await share.click();
  await expect(share).toBeEnabled();

  const { shares, checks, copies } = await page.evaluate(() => window.nativeSharingTest);
  expect(shares).toHaveLength(1);
  expect(shares[0]).toMatchObject({ active: true, clickType: "click", data: { title: "Culture Night" } });
  expect(Object.keys(shares[0].data).sort()).toEqual(["title", "url"]);
  expect(checks).toEqual([shares[0].data]);
  expect(copies).toEqual([]);
  const url = shares[0].data.url!;
  expect(new URL(url).pathname).toBe(`/1/${programmeYear}/`);
  const state = readLink(url);
  expect(state.collection).toBe("shared");
  expect(new Set(state.sharedUrls)).toEqual(new Set(seed));
  await expectNoSharingFeedback(page);
});

test("native event sharing works without canShare and produces an independent event permalink", async ({ page, baseURL }) => {
  await prepare(page, [singing.url]);
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "shared", sharedUrls: [evening.url, singing.url],
    selectedUrl: evening.url, view: "map",
  }, programmeYear));
  await mockNative(page, "resolve", "missing");
  const share = page.locator(".event-popup").getByRole("button", { name: "Share event", exact: true });
  await share.click();
  await expect(share).toBeEnabled();
  const { shares, checks, copies } = await page.evaluate(() => window.nativeSharingTest);
  expect(shares).toHaveLength(1);
  expect(shares[0]).toMatchObject({ active: true, clickType: "click", data: { title: "Culture Night" } });
  expect(checks).toEqual([]);
  expect(copies).toEqual([]);
  const state = readLink(shares[0].data.url!);
  expect(state.collection).toBe("event");
  expect(state.selectedUrl).toBe(evening.url);
  expect(state.sharedUrls).toEqual([]);
  await expectNoSharingFeedback(page);
});

test("a failed native event share keeps its manual link and copy action usable inside the phone popup", async ({ page, baseURL, isMobile }) => {
  await prepare(page, [singing.url]);
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), selectedUrl: evening.url, view: "map",
  }, programmeYear));
  await mockNative(page, "denied");
  const popup = page.locator(".event-popup");
  await popup.getByRole("button", { name: "Share event", exact: true }).click();
  await expect(field(page)).toBeVisible();
  await field(page).scrollIntoViewIfNeeded();
  await expect(field(page)).toBeInViewport({ ratio: 1 });
  await field(page).focus();
  const link = await field(page).inputValue();
  expect(await field(page).evaluate((input: HTMLInputElement) =>
    input.selectionEnd! - input.selectionStart!)).toBe(link.length);
  const copy = popup.getByRole("button", { name: "Copy link", exact: true });
  await copy.scrollIntoViewIfNeeded();
  await expect(copy).toBeInViewport({ ratio: 1 });
  const bounds = await copy.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  if (isMobile) await copy.tap();
  else await copy.click();
  await expect(copied(page)).toBeVisible();
  expect(await page.evaluate(() => window.nativeSharingTest.copies.map((copy) => copy.text))).toEqual([link]);
  await popup.getByRole("button", { name: "Close popup", exact: true }).click();
  await expect(popup).toHaveCount(0);
});

test("a received shared night can be shared natively without changing the recipient's saved plan", async ({ page, baseURL }) => {
  const sharedUrls = [evening.url, singing.url];
  await prepare(page, [singing.url]);
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), collection: "shared", sharedUrls, sort: "custom",
  }, programmeYear));
  await mockNative(page);
  const share = page.getByRole("button", { name: "Share shared night", exact: true });
  await share.click();
  await expect(share).toBeEnabled();
  const { shares, copies } = await page.evaluate(() => window.nativeSharingTest);
  expect(shares).toHaveLength(1);
  const state = readLink(shares[0].data.url!);
  expect(state.collection).toBe("shared");
  expect(state.sharedUrls).toEqual(sharedUrls);
  expect(state.sort).toBe("custom");
  expect(copies).toEqual([]);
  await expectNoSharingFeedback(page);
});

test("canShare false copies the same search payload without invoking native sharing", async ({ page, baseURL }) => {
  await prepare(page);
  await page.goto(createStateLink(baseURL!, { ...defaultUrlState(), searchTerm: "Belfast" }, programmeYear));
  await mockNative(page, "resolve", false);
  await searchShare(page).click();
  await expect(copied(page)).toBeVisible();
  const { shares, checks, copies } = await page.evaluate(() => window.nativeSharingTest);
  expect(shares).toEqual([]);
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatchObject({ active: true, clickType: "click" });
  expect(checks).toEqual([{ title: "Culture Night", url: copies[0].text }]);
  expect(readLink(copies[0].text).searchTerm).toBe("Belfast");
});

test("a pending native sheet blocks duplicate requests and allows sharing again after completion", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await mockNative(page, "pending");
  const share = searchShare(page);
  await share.click();
  await expect(share).toBeDisabled();
  await expect(share).toHaveAttribute("aria-busy", "true");
  await share.dispatchEvent("click");
  await share.dispatchEvent("click");
  expect(await page.evaluate(() => window.nativeSharingTest.shares.length)).toBe(1);
  expect(await page.evaluate(() => window.nativeSharingTest.copies)).toEqual([]);
  await page.evaluate(() => window.nativeSharingTest.resolveShare!());
  await expect(share).toBeEnabled();
  await expect(share).toHaveAttribute("aria-busy", "false");
  await expectNoSharingFeedback(page);
  await share.click();
  expect(await page.evaluate(() => window.nativeSharingTest.shares.length)).toBe(2);
  await page.evaluate(() => window.nativeSharingTest.resolveShare!());
  await expect(share).toBeEnabled();
});

test("native cancellation is silent and never copies automatically", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await mockNative(page, "cancel");
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await searchShare(page).click();
  await expect(searchShare(page)).toBeEnabled();
  expect(await page.evaluate(() => window.nativeSharingTest.shares.length)).toBe(1);
  expect(await page.evaluate(() => window.nativeSharingTest.copies)).toEqual([]);
  await expectNoSharingFeedback(page);
  expect(errors).toEqual([]);
});

for (const mode of ["denied", "sync-failure", "unexpected"] as const) {
  test(`${mode} native failure offers manual sharing and only copies after an explicit new click`, async ({ page }) => {
    await prepare(page);
    await page.goto("/");
    await mockNative(page, mode);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await searchShare(page).click();
    await expect(field(page)).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Sharing could not be opened" })).toBeVisible();
    const { shares, copies } = await page.evaluate(() => window.nativeSharingTest);
    expect(shares).toHaveLength(1);
    expect(copies).toEqual([]);
    const link = shares[0].data.url!;
    await expect(field(page)).toHaveValue(link);
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(copied(page)).toBeVisible();
    await expect(field(page)).toHaveCount(0);
    const copiedLinks = await page.evaluate(() => window.nativeSharingTest.copies);
    expect(copiedLinks).toEqual([{ text: link, active: true, clickType: "click" }]);
    expect(await page.evaluate(() => window.nativeSharingTest.shares.length)).toBe(1);
    if (mode === "unexpected") {
      expect(errors.some((error) => error.includes("Could not share the Culture Night link."))).toBe(true);
    }
  });
}

for (const clipboard of ["denied", "missing"] as const) {
  test(`native failure followed by ${clipboard} clipboard keeps a selectable manual link`, async ({ page }) => {
    await prepare(page, undefined, clipboard);
    await page.goto("/");
    await mockNative(page, "denied");
    await searchShare(page).click();
    const link = await field(page).inputValue();
    expect(await page.evaluate(() => window.nativeSharingTest.copies)).toEqual([]);
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(field(page)).toHaveValue(link);
    await expect(page.getByRole("alert").filter({ hasText: /copy the link below|copy it below/ })).toBeVisible();
    await expect(copied(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.nativeSharingTest.copies.length)).toBe(clipboard === "missing" ? 0 : 1);
    await field(page).focus();
    expect(await field(page).evaluate((input: HTMLInputElement) =>
      input.selectionEnd! - input.selectionStart!)).toBe(link.length);
    await page.getByRole("button", { name: "Close sharing message", exact: true }).click();
    await expectNoSharingFeedback(page);
  });
}

test("changing search identity discards feedback from an older native request", async ({ page }) => {
  await prepare(page);
  await page.goto("/");
  await mockNative(page, "pending");
  await searchShare(page).click();
  await page.getByRole("combobox", { name: "Search events" }).fill("Belfast");
  await expect(searchShare(page)).toBeDisabled();
  await page.evaluate(() => window.nativeSharingTest.rejectShare!("NotAllowedError"));
  await expect(searchShare(page)).toBeEnabled();
  await expectNoSharingFeedback(page);
  await page.getByRole("combobox", { name: "Search events" }).press("Escape");
  await searchShare(page).click();
  const shares = await page.evaluate(() => window.nativeSharingTest.shares);
  expect(shares).toHaveLength(2);
  expect(readLink(shares[0].data.url!).searchTerm).toBe("");
  expect(readLink(shares[1].data.url!).searchTerm).toBe("Belfast");
  await page.evaluate(() => window.nativeSharingTest.resolveShare!());
  await expect(searchShare(page)).toBeEnabled();
});

for (const result of ["resolve", "reject"] as const) {
  test(`changing search identity discards an older clipboard ${result}`, async ({ page }) => {
    await prepare(page, undefined, "pending");
    await page.goto("/");
    await searchShare(page).click();
    await expect(searchShare(page)).toBeDisabled();
    await page.getByRole("combobox", { name: "Search events" }).fill("Belfast");
    await page.evaluate((result) => {
      if (result === "resolve") window.nativeSharingTest.resolveCopy!();
      else window.nativeSharingTest.rejectCopy!();
    }, result);
    await expect(searchShare(page)).toBeEnabled();
    await expectNoSharingFeedback(page);
  });
}

test("dismissing an event popup ignores its outstanding native failure", async ({ page, baseURL }) => {
  await prepare(page, [singing.url]);
  await page.goto(createStateLink(baseURL!, {
    ...defaultUrlState(), selectedUrl: evening.url, view: "map",
  }, programmeYear));
  await mockNative(page, "pending");
  const popup = page.locator(".event-popup");
  await popup.getByRole("button", { name: "Share event", exact: true }).click();
  await popup.getByRole("button", { name: "Close popup", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await page.evaluate(() => window.nativeSharingTest.rejectShare!("NotAllowedError"));
  await expectNoSharingFeedback(page);
  expect(await page.evaluate(() => window.nativeSharingTest.copies)).toEqual([]);
});
