import { createServer } from "node:http";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildOffline } from "../../scripts/build-offline.mjs";

const temp = await mkdtemp(path.join(os.tmpdir(), "culture-night-offline-test-"));
const programme = JSON.parse(await readFile(new URL("../../src/api/programme.json", import.meta.url), "utf8"));
const events = JSON.parse(await readFile(new URL("../../src/api/events.json", import.meta.url), "utf8"));
const mediaBase = "http://127.0.0.1:3014/__offline-test/media";
const images = new Map([...new Set(events.map((event) => event.image).filter(Boolean))]
  .map((url, index) => [url, `${mediaBase}/photos/${index}.svg`]));
const imagePattern = new RegExp([...images.keys()].map((url) => url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
const decorativeImage = await readFile(new URL("../fixtures/decorative.svg", import.meta.url));
try {
  for (const version of ["a", "b"]) {
    const outDir = path.join(temp, version);
    await cp(new URL("../../out/", import.meta.url), outDir, { recursive: true });
    // Real HTTP responses allow cache-reuse tests without fetching third-party media.
    for (const relative of await readdir(outDir, { recursive: true })) {
      if (!/\.(html|js|txt)$/.test(relative)) continue;
      const file = path.join(outDir, relative);
      const source = await readFile(file, "utf8");
      const fixture = source.replace(imagePattern, (url) => images.get(url))
        .replaceAll("https://tile.openstreetmap.org/", `${mediaBase}/tiles/`);
      if (fixture !== source) await writeFile(file, fixture);
    }
    if (version === "b") {
      for (const page of ["index.html", `1/${programme.year}/index.html`]) {
        const file = path.join(outDir, page);
        await writeFile(file, `${await readFile(file, "utf8")}\n<!-- Offline test release B -->`);
      }
    }
    await buildOffline({ outDir });
  }
} catch (error) {
  await rm(temp, { recursive: true, force: true });
  throw error;
}
const chunkDir = path.join(temp, "a", "_next", "static", "chunks");
const chunks = await Promise.all((await readdir(chunkDir)).filter((name) => name.endsWith(".js"))
  .map(async (name) => ({ name, size: (await stat(path.join(chunkDir, name))).size })));
const criticalAsset = `/_next/static/chunks/${chunks.sort((a, b) => b.size - a.size)[0].name}`;
let current = "a";
let failure = "none";
let requests = [];
const types = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff", ".woff2": "font/woff2", ".png": "image/png", ".ico": "image/x-icon",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:3014");
    if (url.pathname === "/__offline-test/state") {
      if (request.method === "POST") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const change = JSON.parse(body);
        if (change.version !== undefined) {
          if (!["a", "b"].includes(change.version)) throw new Error("Unknown fixture version");
          current = change.version;
        }
        if (change.failure !== undefined) {
          if (!["none", "fail", "hang", "corrupt"].includes(change.failure)) throw new Error("Unknown fixture failure");
          failure = change.failure;
        }
        if (change.clearRequests) requests = [];
      }
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ version: current, failure, criticalAsset, requests }));
      return;
    }
    requests.push({ path: url.pathname, destination: request.headers["sec-fetch-dest"] });
    if (url.pathname.startsWith("/__offline-test/media/")) {
      response.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, immutable",
      });
      response.end(decorativeImage);
      return;
    }
    if (url.pathname === criticalAsset && request.headers["sec-fetch-dest"] === "empty") {
      if (failure === "hang") return;
      if (failure === "fail") {
        response.writeHead(503, { "Cache-Control": "no-store" });
        response.end("Offline fixture: interrupted download");
        return;
      }
      if (failure === "corrupt") {
        response.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
        response.end("// Stale intermediary response, not this release's script");
        return;
      }
    }
    const root = path.join(temp, current);
    let relative = decodeURIComponent(url.pathname);
    if (relative.endsWith("/")) relative += "index.html";
    const file = path.resolve(root, `.${relative}`);
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(400);
      response.end("Invalid path");
      return;
    }
    let body;
    try {
      body = await readFile(file);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
      response.writeHead(404, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      response.end(await readFile(path.join(root, "404.html")));
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch (error) {
    console.error("Offline test server failed.", error);
    response.writeHead(500);
    response.end("Offline test server failed");
  }
});
server.listen(3014, "127.0.0.1");
const close = async () => {
  server.closeAllConnections();
  server.close();
  await rm(temp, { recursive: true, force: true });
  process.exit(0);
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
