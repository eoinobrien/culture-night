import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { assetUrl, buildOffline, createOfflineBuild, stripOfflineStamp } from "../scripts/build-offline.mjs";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = "https://guide.example";
const prefix = "culture-night:offline:";
const lazyChunk = "_next/static/chunks/app/[version]/[year]/lazy.js";
let fixtureCount = 0;
const page = (body: string) => `<html><head></head><body>${body}</body></html>`;

async function fixture(t: TestContext) {
  const root = join(site, "e2e", ".artifacts", `offline-worker-test-${process.pid}-${++fixtureCount}`);
  const outDir = join(root, "export");
  const programmePath = join(root, "programme.json");
  const runtimePath = join(root, "runtime.js");
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = new Map([
    ["index.html", page("Root")],
    ["1/2026/index.html", page("Programme 2026")],
    ["404.html", page("Not found")],
    ["404/index.html", page("Duplicate 404")],
    ["index.txt", "root RSC"],
    ["1/2026/index.txt", "programme RSC"],
    ["_next/static/chunks/main.js", "main();"],
    [lazyChunk, "all1916Events();"],
    ["_next/static/css/lazy.css", ".lazy { color: red; }"],
    ["_next/static/media/font.woff2", "font"],
    ["_next/static/media/marker-icon.abc123.png", "icon"],
    ["favicon.ico", "favicon"],
    ["_next/static/chunks/main.js.map", "source map"],
    ["_next/static/media/event-photo.jpg", "photo"],
    ["_next/static/media/event-photo.png", "photo"],
    ["photos/venue.jpg", "photo"],
    ["tiles/1/2/3.png", "tile"],
    ["telemetry.json", "telemetry"],
    ["2/2027/index.html", "unrelated programme"],
  ]);
  for (const [path, body] of files) {
    await mkdir(dirname(join(outDir, path)), { recursive: true });
    await writeFile(join(outDir, path), body);
  }
  await writeFile(programmePath, JSON.stringify({
    year: 2026, fetchedAt: "2026-09-16T18:46:59.409Z",
    source: "https://culturenight.ie", eventCount: 1916,
  }));
  await writeFile(runtimePath, await readFile(join(site, "scripts/offline-worker.js")));
  const options = { outDir, programmePath, runtimePath };
  const build = await createOfflineBuild(options);
  for (const { path, contents } of build.stampedDocuments) files.set(path, contents);
  return { ...build, files, options };
}

function key(request: string | { url: string }) {
  return new URL(typeof request === "string" ? request : request.url, origin).href;
}

class MemoryCache {
  data = new Map<string, Response>();
  writes: string[] = [];
  async match(request: string | { url: string }) {
    return this.data.get(key(request))?.clone();
  }
  async put(request: string | { url: string }, response: Response) {
    this.data.set(key(request), response.clone());
    this.writes.push(key(request));
  }
  async delete(request: string | { url: string }) {
    return this.data.delete(key(request));
  }
}

class MemoryStorage {
  data = new Map<string, MemoryCache>();
  async has(name: string) { return this.data.has(name); }
  async keys() { return [...this.data.keys()]; }
  async open(name: string) {
    if (!this.data.has(name)) this.data.set(name, new MemoryCache());
    return this.data.get(name)!;
  }
  async delete(name: string) { return this.data.delete(name); }
}

type Message = Record<string, unknown>;
type Fixture = Awaited<ReturnType<typeof fixture>>;

function harness(build: Fixture, storage = new MemoryStorage()) {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const messages: Message[] = [];
  const externalMessages: Message[] = [];
  const errors: unknown[][] = [];
  const requests: { url: string; options?: RequestInit }[] = [];
  const bodyByUrl = new Map([...build.files].map(([path, body]) => [assetUrl(path), body]));
  const control = {
    offline: false,
    failPath: "",
    stalePath: "",
    hangPath: "",
    hangBodyPath: "",
    wrongTypePath: "",
    transformBody: undefined as ((path: string, body: string) => string) | undefined,
    timeoutMs: undefined as number | undefined,
    claimed: 0,
    skipped: 0,
    beforeFetch: undefined as ((url: string) => Promise<void>) | undefined,
  };
  const messageCopy = (message: Message) => JSON.parse(JSON.stringify(message));
  const clients = [
    { url: `${origin}/1/2026/`, postMessage: (value: Message) => messages.push(messageCopy(value)) },
    { url: "https://other.example/", postMessage: (value: Message) => externalMessages.push(messageCopy(value)) },
  ];
  const fetch = async (request: string | { url: string }, options?: RequestInit) => {
    const url = key(request);
    const path = new URL(url).pathname;
    requests.push({ url, options });
    if (control.beforeFetch) await control.beforeFetch(url);
    if (control.offline || path === control.failPath) throw new Error("Network unavailable");
    if (path === control.hangPath) return await new Promise<Response>(() => {});
    if (path === control.hangBodyPath) {
      return {
        status: 200, type: "basic", redirected: false,
        headers: new Headers({ "Content-Type": "text/html" }),
        clone: () => ({ arrayBuffer: () => new Promise(() => {}), text: () => new Promise(() => {}) }),
      } as unknown as Response;
    }
    let body = path === control.stalePath ? "stale content from CDN" : bodyByUrl.get(path);
    if (body !== undefined && control.transformBody) body = control.transformBody(path, body);
    return new Response(body ?? "Online 404", {
      status: body === undefined ? 404 : 200,
      headers: { "Content-Type": path.endsWith(".html") && path !== control.wrongTypePath ? "text/html" : "application/octet-stream" },
    });
  };
  runInNewContext(build.worker, {
    URL, Request, Response, Headers, AbortController, Uint8Array, crypto: webcrypto,
    caches: storage, fetch,
    setTimeout: (handler: () => void, delay: number) => setTimeout(handler, control.timeoutMs ?? delay),
    clearTimeout,
    console: { error: (...args: unknown[]) => errors.push(args) },
    self: {
      location: new URL(`${origin}/sw.js`),
      clients: {
        matchAll: async (options: { includeUncontrolled: boolean }) => {
          assert.equal(options.includeUncontrolled, true);
          return clients;
        },
        claim: async () => { control.claimed++; },
      },
      skipWaiting: () => { control.skipped++; },
      addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => listeners.set(type, listener),
    },
  }, { filename: "generated-sw.js" });
  async function event(type: string, details: Record<string, unknown> = {}) {
    const promises: Promise<unknown>[] = [];
    listeners.get(type)!({ ...details, waitUntil: (promise: Promise<unknown>) => promises.push(promise) });
    await Promise.all(promises);
  }
  async function message(type: string) {
    let reply: Message | undefined;
    await event("message", {
      data: { type }, source: { url: `${origin}/` },
      ports: [{ postMessage: (value: Message) => { reply = messageCopy(value); } }],
    });
    assert.ok(reply);
    return reply;
  }
  function route(path: string, {
    mode = "cors", method = "GET", headers = {},
  }: { mode?: string; method?: string; headers?: Record<string, string> } = {}) {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: { url: new URL(path, origin).href, mode, method, headers: new Headers(headers) },
      respondWith: (value: Promise<Response>) => { response = value; },
    });
    return response;
  }
  return {
    storage, control, requests, messages, externalMessages, errors, event, message, route,
    cacheName: `${prefix}${build.config.version}`,
    readyUrl: `${origin}/.culture-night-offline-ready/${build.config.version}`,
  };
}

test("generator includes every lazy JS/CSS, safe encoded segments and only essential export assets", async (t) => {
  const build = await fixture(t);
  const urls = build.config.manifest.map((entry: { url: string }) => entry.url);
  assert.deepEqual(urls, [
    "/1/2026/index.html", "/1/2026/index.txt", "/404.html",
    "/_next/static/chunks/app/%5Bversion%5D/%5Byear%5D/lazy.js",
    "/_next/static/chunks/main.js", "/_next/static/css/lazy.css",
    "/_next/static/media/font.woff2", "/_next/static/media/marker-icon.abc123.png",
    "/favicon.ico", "/index.html", "/index.txt",
  ]);
  assert.equal(build.config.year, 2026);
  assert.equal(build.config.fetchedAt, "2026-09-16T18:46:59.409Z");
  assert.equal(build.config.timeoutMs, 18000);
  for (const path of ["../secret.js", "/external.js", "//host/a.js", "a\\b.js", "a%2fb.js", "a?x.js", "a#x.js", "a/\0.js"]) {
    assert.throws(() => assetUrl(path), /Unsafe/);
  }
});

test("build stamps only precached HTML and is idempotent across repeated generation and source changes", async (t) => {
  const build = await fixture(t);
  const written = await buildOffline(build.options);
  assert.equal(await readFile(join(build.options.outDir, "sw.js"), "utf8"), build.worker);
  assert.equal(written.config.version, build.config.version);
  assert.equal((await createOfflineBuild(build.options)).config.version, build.config.version);
  const originalHtml = await readFile(join(build.options.outDir, "index.html"), "utf8");
  assert.match(originalHtml, new RegExp(`name="culture-night-offline-release" content="${build.config.version}"`));
  assert.equal(stripOfflineStamp(originalHtml), page("Root"));
  assert.equal((await buildOffline(build.options)).config.version, build.config.version);
  assert.equal(await readFile(join(build.options.outDir, "index.html"), "utf8"), originalHtml);
  assert.equal((originalHtml.match(/name="culture-night-offline-release"/g) ?? []).length, 1);
  assert.equal(await readFile(join(build.options.outDir, "404/index.html"), "utf8"), page("Duplicate 404"));
  await writeFile(join(build.options.outDir, "index.html"), originalHtml.replace("Root", "Root revision B"));
  const revised = await buildOffline(build.options);
  assert.notEqual(revised.config.version, build.config.version);
  assert.equal((await buildOffline(build.options)).config.version, revised.config.version);
  await writeFile(join(build.options.outDir, "index.html"), originalHtml);
  assert.equal((await buildOffline(build.options)).config.version, build.config.version);
  await writeFile(join(build.options.outDir, "photos/venue.jpg"), "changed excluded photograph");
  assert.equal((await createOfflineBuild(build.options)).config.version, build.config.version);
  await writeFile(join(build.options.outDir, lazyChunk), "changedProgramme();");
  const changedAsset = await createOfflineBuild(build.options);
  assert.notEqual(changedAsset.config.version, build.config.version);
  await writeFile(build.options.runtimePath, `${await readFile(build.options.runtimePath, "utf8")}\n// Runtime change\n`);
  const changedRuntime = await createOfflineBuild(build.options);
  assert.notEqual(changedRuntime.config.version, changedAsset.config.version);
  const programme = JSON.parse(await readFile(build.options.programmePath, "utf8"));
  await writeFile(build.options.programmePath, JSON.stringify({ ...programme, eventCount: 1917 }));
  assert.notEqual((await createOfflineBuild(build.options)).config.version, changedRuntime.config.version);
});

test("generator rejects missing essentials, symlinks, ambiguous paths and invalid metadata", async (t) => {
  const build = await fixture(t);
  await rm(join(build.options.outDir, "index.html"));
  await assert.rejects(createOfflineBuild(build.options), /Missing essential.*index.html/);
  await writeFile(join(build.options.outDir, "index.html"), page("Root"));
  await symlink(join(build.options.outDir, "index.html"), join(build.options.outDir, "symlink.html"));
  await assert.rejects(createOfflineBuild(build.options), /Symlink/);
  await rm(join(build.options.outDir, "symlink.html"));
  const unsafe = join(build.options.outDir, "_next/static/chunks/a%2fb.js");
  await writeFile(unsafe, "unsafe");
  await assert.rejects(createOfflineBuild(build.options), /Unsafe/);
  await rm(unsafe);
  await writeFile(build.options.programmePath, '{"year":"2026","fetchedAt":"yesterday"}');
  await assert.rejects(createOfflineBuild(build.options), /valid programme/);
});

test("status inspects all assets; complete install verifies contents and marks ready last", async (t) => {
  const build = await fixture(t);
  const worker = harness(build);
  assert.deepEqual(await worker.message("OFFLINE_STATUS"), {
    type: "OFFLINE_STATUS", version: build.config.version, ready: false, completed: 0,
    total: build.config.manifest.length, year: 2026, fetchedAt: build.config.fetchedAt,
  });
  assert.deepEqual(await worker.storage.keys(), []);
  await worker.event("install");
  const status = await worker.message("OFFLINE_STATUS");
  assert.equal(status.ready, true);
  assert.equal(status.completed, status.total);
  assert.equal(worker.requests.length, status.total);
  for (const request of worker.requests) {
    assert.equal(new URL(request.url).origin, origin);
    assert.equal(request.options?.cache, "reload");
    assert.equal(request.options?.redirect, "error");
    assert.equal(request.options?.credentials, "same-origin");
    assert.ok(request.options?.signal);
  }
  const cache = await worker.storage.open(worker.cacheName);
  assert.equal(cache.writes.at(-1), worker.readyUrl);
  assert.equal(worker.control.skipped, 0);
  assert.equal(worker.control.claimed, 0);
  assert.equal(worker.externalMessages.length, 0);
  assert.ok(worker.messages.some((message) => message.type === "OFFLINE_PROGRESS" && message.completed === status.total));
  await cache.delete(assetUrl(lazyChunk));
  const missing = await worker.message("OFFLINE_STATUS");
  assert.equal(missing.ready, false);
  assert.equal(missing.completed, Number(missing.total) - 1);
  assert.ok(await cache.match(worker.readyUrl), "a marker alone cannot imply readiness");
});

test("failed and aborted installs remove only their own new cache and explicitly report failure", async (t) => {
  const build = await fixture(t);
  const worker = harness(build);
  const previous = await worker.storage.open(`${prefix}previous-complete`);
  await previous.put("/index.html", new Response("previous complete release"));
  await worker.storage.open("unrelated-cache");
  worker.control.failPath = assetUrl(lazyChunk);
  await assert.rejects(worker.event("install"), /Network unavailable/);
  assert.equal(await worker.storage.has(worker.cacheName), false);
  assert.equal(await (await previous.match("/index.html"))?.text(), "previous complete release");
  assert.equal(await worker.storage.has("unrelated-cache"), true);
  assert.ok(worker.errors.length > 0);
  assert.ok(worker.messages.some((message) => message.type === "OFFLINE_ERROR" && message.version === build.config.version));
  assert.equal((await worker.message("OFFLINE_STATUS")).ready, false);
  // A fresh install attempt can retry the same immutable manifest.
  worker.control.failPath = "";
  worker.control.beforeFetch = async () => { throw new DOMException("Aborted", "AbortError"); };
  await assert.rejects(worker.event("install"), /Aborted/);
  assert.equal(await worker.storage.has(worker.cacheName), false);
  worker.control.beforeFetch = undefined;
  await worker.event("install");
  assert.equal((await worker.message("OFFLINE_STATUS")).ready, true);
});

test("stale HTML is rejected rather than marking a mixed deployment ready", async (t) => {
  const build = await fixture(t);
  const worker = harness(build);
  worker.control.stalePath = "/1/2026/index.html";
  await assert.rejects(worker.event("install"), /Release content changed/);
  assert.equal(await worker.storage.has(worker.cacheName), false);
  assert.ok(worker.messages.some((message) => message.type === "OFFLINE_ERROR" && /Release content changed/.test(String(message.message))));
});

test("HTML release stamps tolerate CDN analytics injection and attribute formatting without caching telemetry", async (t) => {
  const worker = harness(await fixture(t));
  worker.control.transformBody = (path, body) => path.endsWith(".html")
    ? body.replace(
      /<meta name="culture-night-offline-release" content="([^"]+)" data-document="([^"]+)">/,
      (_, version, document) => `<META DATA-DOCUMENT='${document}' content=${version} NAME='culture-night-offline-release' />`,
    ).replace("</body>", '<script defer src="/cdn-cgi/rum"></script></body>')
    : body;
  await worker.event("install");
  assert.equal((await worker.message("OFFLINE_STATUS")).ready, true);
  assert.match(await (await worker.route("/", { mode: "navigate" }))!.text(), /cdn-cgi\/rum/);
  assert.equal(worker.route("/cdn-cgi/rum"), undefined);
  assert.ok(worker.requests.every((request) => !request.url.includes("/cdn-cgi/")));
});

test("HTML validation rejects old stamps, wrong documents, duplicate stamps and non-HTML content types", async (t) => {
  const build = await fixture(t);
  const transformations = [
    (body: string) => stripOfflineStamp(body),
    (body: string) => body.replace(`content="${build.config.version}"`, `content="${"0".repeat(64)}"`),
    () => build.files.get("index.html")!,
    (body: string) => body.replace("</head>", `${body.match(/<meta name="culture-night-offline-release"[^>]+>/)![0]}</head>`),
  ];
  for (const transform of transformations) {
    const worker = harness(build);
    worker.control.transformBody = (path, body) => path === "/1/2026/index.html" ? transform(body) : body;
    await assert.rejects(worker.event("install"), /HTML release stamp or content type/);
    assert.equal((await worker.message("OFFLINE_STATUS")).ready, false);
  }
  const worker = harness(build);
  worker.control.wrongTypePath = "/1/2026/index.html";
  await assert.rejects(worker.event("install"), /HTML release stamp or content type/);
  assert.equal(await worker.storage.has(worker.cacheName), false);
});

test("CDN-tolerant HTML handling retains strict digest validation for code, styles, fonts and icons", async (t) => {
  const build = await fixture(t);
  for (const path of [assetUrl(lazyChunk), "/_next/static/css/lazy.css", "/_next/static/media/font.woff2", "/favicon.ico"]) {
    const worker = harness(build);
    worker.control.stalePath = path;
    await assert.rejects(worker.event("install"), /Release content changed/);
    assert.equal(await worker.storage.has(worker.cacheName), false);
  }
});

test("storage quota failure cannot leave a ready marker or remove the previous release", async (t) => {
  const worker = harness(await fixture(t));
  await worker.storage.open(`${prefix}previous`);
  const open = worker.storage.open.bind(worker.storage);
  worker.storage.open = async (name) => {
    const cache = await open(name);
    if (name === worker.cacheName) {
      cache.put = async () => { throw new DOMException("Storage full", "QuotaExceededError"); };
    }
    return cache;
  };
  await assert.rejects(worker.event("install"), /Storage full/);
  assert.equal(await worker.storage.has(worker.cacheName), false);
  assert.equal(await worker.storage.has(`${prefix}previous`), true);
  assert.ok(worker.messages.some((message) => message.type === "OFFLINE_ERROR"));
});

test("cache access failures return an explicit status error instead of an empty response", async (t) => {
  const worker = harness(await fixture(t));
  worker.storage.has = async () => { throw new Error("Storage denied"); };
  const status = await worker.message("OFFLINE_STATUS");
  assert.equal(status.type, "OFFLINE_ERROR");
  assert.match(String(status.message), /Storage denied/);
  assert.ok(worker.errors.length > 0);
});

for (const stalled of ["hangPath", "hangBodyPath"] as const) {
  test(`install has a finite aborting timeout for ${stalled === "hangPath" ? "headers" : "response bodies"}`, async (t) => {
    const worker = harness(await fixture(t));
    worker.control[stalled] = "/1/2026/index.html";
    worker.control.timeoutMs = 10;
    await assert.rejects(worker.event("install"), /timed out/);
    const request = worker.requests.find((request) => new URL(request.url).pathname === "/1/2026/index.html");
    assert.equal(request?.options?.signal?.aborted, true);
    assert.equal(await worker.storage.has(worker.cacheName), false);
    assert.equal((await worker.message("OFFLINE_STATUS")).ready, false);
  });
}

test("activation claims only a complete release and retires only our old caches, without forced activation", async (t) => {
  const build = await fixture(t);
  const worker = harness(build);
  await worker.storage.open(`${prefix}previous`);
  await worker.storage.open("other-app");
  await worker.event("install");
  assert.equal(await worker.storage.has(`${prefix}previous`), true);
  await worker.event("activate");
  assert.equal(worker.control.claimed, 1);
  assert.equal(worker.control.skipped, 0);
  assert.deepEqual((await worker.storage.keys()).sort(), [worker.cacheName, "other-app"].sort());
  await (await worker.storage.open(worker.cacheName)).delete("/index.html");
  await assert.rejects(worker.event("activate"), /incomplete at activation/);
  assert.equal(worker.control.claimed, 1);
});

test("repair fetches only evicted entries and status never claims a marker-only or absent cache is ready", async (t) => {
  const worker = harness(await fixture(t));
  await worker.event("install");
  const cache = await worker.storage.open(worker.cacheName);
  await cache.delete("/index.html");
  const oldRequests = worker.requests.length;
  const repaired = await worker.message("OFFLINE_REPAIR");
  assert.equal(repaired.type, "OFFLINE_STATUS");
  assert.equal(repaired.ready, true);
  assert.equal(worker.requests.length, oldRequests + 1);
  assert.equal(worker.storage.data.get(worker.cacheName), cache);
  await cache.delete(worker.readyUrl);
  const unmarked = await worker.message("OFFLINE_STATUS");
  assert.equal(unmarked.ready, false);
  assert.equal(unmarked.completed, unmarked.total);
  assert.equal((await worker.message("OFFLINE_REPAIR")).ready, true);
  assert.equal(worker.requests.length, oldRequests + 1);
  await worker.storage.delete(worker.cacheName);
  assert.equal((await worker.message("OFFLINE_STATUS")).completed, 0);
  assert.equal(await worker.storage.has(worker.cacheName), false);
  assert.equal((await worker.message("OFFLINE_REPAIR")).ready, true);
});

test("repair failure retains working entries and reports unavailable old-release assets", async (t) => {
  const worker = harness(await fixture(t));
  await worker.event("install");
  const cache = await worker.storage.open(worker.cacheName);
  await cache.delete("/index.html");
  worker.control.failPath = "/index.html";
  const error = await worker.message("OFFLINE_REPAIR");
  assert.equal(error.type, "OFFLINE_ERROR");
  assert.match(String(error.message), /Retry saving or check for a newer guide/);
  assert.equal(worker.storage.data.get(worker.cacheName), cache);
  assert.ok(await cache.match("/1/2026/index.html"));
  assert.equal(await cache.match(worker.readyUrl), undefined);
  assert.equal((await worker.message("OFFLINE_STATUS")).ready, false);
  worker.control.failPath = "";
  assert.equal((await worker.message("OFFLINE_REPAIR")).ready, true);
});

test("concurrent repair/status and install handlers share writes and cannot delete an existing release", async (t) => {
  const worker = harness(await fixture(t));
  await worker.event("install");
  const cache = await worker.storage.open(worker.cacheName);
  await cache.delete("/index.html");
  let unblock!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { unblock = resolve; });
  const began = new Promise<void>((resolve) => { started = resolve; });
  worker.control.beforeFetch = async () => { started(); await gate; };
  const before = worker.requests.length;
  const repair = worker.message("OFFLINE_REPAIR");
  await began;
  const otherRepair = worker.message("OFFLINE_REPAIR");
  const install = worker.event("install");
  assert.equal((await worker.message("OFFLINE_STATUS")).ready, false);
  unblock();
  assert.equal((await repair).ready, true);
  assert.equal((await otherRepair).ready, true);
  await install;
  assert.equal(worker.requests.length, before + 1);
  assert.equal(worker.storage.data.get(worker.cacheName), cache);
  await cache.delete("/index.html");
  worker.control.failPath = "/index.html";
  await assert.rejects(worker.event("install"), /Network unavailable/);
  assert.equal(worker.storage.data.get(worker.cacheName), cache);
  assert.ok(await cache.match("/1/2026/index.html"));
});

test("known navigation variants ignore queries and hashes, serving this release without any network", async (t) => {
  const worker = harness(await fixture(t));
  await worker.event("install");
  const before = worker.requests.length;
  worker.control.offline = true;
  for (const path of ["/", "/index.html", "/?search=music#saved", "/index.html?plan=one"]) {
    const response = await worker.route(path, { mode: "navigate" });
    assert.equal(response?.status, 200);
    assert.equal(stripOfflineStamp(await response!.text()), page("Root"));
  }
  for (const path of ["/1/2026", "/1/2026/", "/1/2026/index.html", "/1/2026/?search=music#saved"]) {
    const response = await worker.route(path, { mode: "navigate" });
    assert.equal(response?.status, 200);
    assert.equal(stripOfflineStamp(await response!.text()), page("Programme 2026"));
  }
  assert.equal(worker.requests.length, before);
});

test("unknown programmes and routes retain real 404 responses offline instead of the current app", async (t) => {
  const worker = harness(await fixture(t));
  await worker.event("install");
  assert.equal(await (await worker.route("/unknown", { mode: "navigate" }))?.text(), "Online 404");
  worker.control.offline = true;
  for (const path of ["/1/2025/", "/2/2026/", "/1/2026/unknown", "/unknown?q=music", "/404.html", "/404/"]) {
    const response = await worker.route(path, { mode: "navigate" });
    assert.equal(response?.status, 404);
    assert.equal(stripOfflineStamp(await response!.text()), page("Not found"));
    assert.match(response?.headers.get("content-type") ?? "", /text\/html/);
  }
  await (await worker.storage.open(worker.cacheName)).delete("/404.html");
  const missingFallback = await worker.route("/unknown", { mode: "navigate" });
  assert.equal(missingFallback?.status, 404);
  assert.match(await missingFallback!.text(), /offline guide is incomplete/);
  assert.ok(worker.messages.some((message) => message.type === "OFFLINE_ERROR"));
});

test("static manifest assets support encoded Next segments but never ignore query, fragment or range", async (t) => {
  const build = await fixture(t);
  const worker = harness(build);
  await worker.event("install");
  const before = worker.requests.length;
  worker.control.offline = true;
  for (const path of [`/${lazyChunk}`, assetUrl(lazyChunk), assetUrl(lazyChunk).replaceAll("%5B", "%5b").replaceAll("%5D", "%5d")]) {
    assert.equal(await (await worker.route(path))?.text(), "all1916Events();");
  }
  assert.equal(worker.requests.length, before);
  for (const path of [
    `/${lazyChunk}?v=1`, `/${lazyChunk}#fragment`, "/_next/static/chunks/main.js.map",
    "/_next/static/chunks/app/%255Bversion%255D/%255Byear%255D/lazy.js",
    "/_next/static/chunks%2Fmain.js", "/_next/static/chunks/%zz.js",
    "/1/2026/index.txt?_rsc=abc",
  ]) {
    assert.equal(worker.route(path), undefined, path);
  }
  assert.equal(worker.route(`/${lazyChunk}`, { headers: { Range: "bytes=0-10" } }), undefined);
});

test("tiles, photos, telemetry, non-manifest requests, other origins and non-GET are never intercepted", async (t) => {
  const worker = harness(await fixture(t));
  await worker.event("install");
  const before = worker.requests.length;
  for (const path of [
    "https://tile.openstreetmap.org/1/2/3.png",
    "https://culturenight.ie/photos/venue.jpg",
    `https://other.example/_next/static/chunks/main.js`,
    "/photos/venue.jpg", "/tiles/1/2/3.png", "/telemetry.json", "/api/events",
    "/_next/static/media/event-photo.png", "/_next/static/chunks/not-in-manifest.js",
  ]) {
    assert.equal(worker.route(path), undefined);
  }
  assert.equal(worker.route("https://other.example/", { mode: "navigate" }), undefined);
  assert.equal(worker.route("/", { mode: "navigate", method: "POST" }), undefined);
  assert.equal(worker.route("/_next/static/chunks/main.js", { method: "HEAD" }), undefined);
  assert.equal(worker.requests.length, before);
});

test("missing current assets cannot fall back to an old cache or silently return empty results", async (t) => {
  const worker = harness(await fixture(t));
  await worker.event("install");
  const old = await worker.storage.open(`${prefix}old`);
  await old.put("/index.html", new Response("old app"));
  await (await worker.storage.open(worker.cacheName)).delete("/index.html");
  worker.control.offline = true;
  const response = worker.route("/", { mode: "navigate" });
  assert.ok(response);
  await assert.rejects(response, /Network unavailable/);
  assert.ok(worker.messages.some((message) => message.type === "OFFLINE_STATUS" && !message.ready));
  assert.ok(worker.messages.some((message) => message.type === "OFFLINE_ERROR"));
});
