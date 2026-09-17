/* OFFLINE_CONFIGURATION */

const CACHE_PREFIX = "culture-night:offline:";
const CACHE_NAME = `${CACHE_PREFIX}${OFFLINE.version}`;
const READY_URL = new URL(`/.culture-night-offline-ready/${OFFLINE.version}`, self.location.origin).href;
const entries = new Map(OFFLINE.manifest.map((entry) => [entry.url, entry]));
let saving;
let repairRequested = false;

function absolute(path) {
  return new URL(path, self.location.origin).href;
}

function canonicalPath(path) {
  try {
    return `/${path.slice(1).split("/").map((segment) => {
      const decoded = decodeURIComponent(segment);
      if (decoded === "." || decoded === ".." || /[%/\\?#\u0000-\u0020\u007f]/.test(decoded)) {
        throw new Error("Unsafe asset URL");
      }
      return encodeURIComponent(decoded);
    }).join("/")}`;
  } catch {
    return null;
  }
}

async function broadcast(message) {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) client.postMessage(message);
    }
  } catch (error) {
    console.error("Could not report offline guide status:", error);
  }
}

function errorMessage(error) {
  return {
    type: "OFFLINE_ERROR",
    version: OFFLINE.version,
    message: `Offline guide could not be saved: ${error instanceof Error ? error.message : String(error)}. Retry saving or check for a newer guide.`,
  };
}

async function reportError(error) {
  console.error("Offline guide failed:", error);
  const message = errorMessage(error);
  await broadcast(message);
  return message;
}

async function inspect() {
  let completed = 0;
  let markedReady = false;
  // A status check must not create an empty cache after browser storage eviction.
  if (await caches.has(CACHE_NAME)) {
    const cache = await caches.open(CACHE_NAME);
    for (const entry of OFFLINE.manifest) {
      const response = await cache.match(absolute(entry.url));
      if (response && response.status === 200) completed++;
    }
    const marker = await cache.match(READY_URL);
    markedReady = Boolean(marker && await marker.text() === OFFLINE.version);
  }
  return {
    type: "OFFLINE_STATUS",
    version: OFFLINE.version,
    ready: markedReady && completed === OFFLINE.manifest.length,
    completed,
    total: OFFLINE.manifest.length,
    year: OFFLINE.year,
    fetchedAt: OFFLINE.fetchedAt,
  };
}

function validHtmlStamp(html, entry) {
  const head = html.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head\s*>/i)?.[1];
  const stamps = [];
  for (const tag of head?.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map(Array.from(
      tag.matchAll(/([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi),
      ([, name, doubleQuoted, singleQuoted, unquoted]) => [name.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted],
    ));
    if (attributes.get("name") === "culture-night-offline-release") stamps.push(attributes);
  }
  return stamps.length === 1 && stamps[0].get("content") === OFFLINE.version
    && stamps[0].get("data-document") === entry.sha256;
}

async function verifiedFetch(entry) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Download timed out for ${entry.url}`));
    }, OFFLINE.timeoutMs);
  });
  try {
    // The timeout covers headers, the complete body and integrity verification.
    return await Promise.race([
      (async () => {
        const response = await fetch(absolute(entry.url), {
          cache: "reload", credentials: "same-origin", redirect: "error", signal: controller.signal,
        });
        if (response.status !== 200 || response.type === "opaque" || response.redirected) {
          throw new Error(`Download failed for ${entry.url} (${response.status})`);
        }
        if (entry.html) {
          // The CDN may inject analytics into HTML. Check its release and document identity instead.
          const contentType = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
          if (contentType !== "text/html" || !validHtmlStamp(await response.clone().text(), entry)) {
            throw new Error(`Release content changed for ${entry.url} (HTML release stamp or content type)`);
          }
        } else {
          const body = await response.clone().arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", body);
          const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
          if (hash !== entry.sha256) throw new Error(`Release content changed for ${entry.url}`);
        }
        return response;
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function save(mode) {
  if (mode === "repair") repairRequested = true;
  if (saving) return saving;
  saving = (async () => {
    let created = false;
    try {
      const before = await inspect();
      if (before.ready) return before;
      created = !await caches.has(CACHE_NAME);
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(READY_URL);
      let completed = before.completed;
      const progress = () => broadcast({
        type: "OFFLINE_PROGRESS", version: OFFLINE.version, completed, total: OFFLINE.manifest.length,
      });
      await progress();
      const missing = [];
      for (const entry of OFFLINE.manifest) {
        const response = await cache.match(absolute(entry.url));
        if (!response || response.status !== 200) missing.push(entry);
      }
      // Settle all writers before cleanup so a late download cannot recreate a failed cache.
      let next = 0;
      let failure;
      const download = async () => {
        while (next < missing.length && !failure) {
          const entry = missing[next++];
          try {
            await cache.put(absolute(entry.url), await verifiedFetch(entry));
            completed++;
            await progress();
          } catch (error) {
            failure = error;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, missing.length) }, download));
      if (failure) throw failure;
      if ((await inspect()).completed !== OFFLINE.manifest.length) {
        throw new Error("Browser storage removed part of the download");
      }
      await cache.put(READY_URL, new Response(OFFLINE.version));
      const status = await inspect();
      if (!status.ready) throw new Error("Browser storage did not retain the complete guide");
      await broadcast(status);
      return status;
    } catch (error) {
      // Repairs always retain usable entries. Failed installs only own a newly created cache.
      if (mode === "install" && created && !repairRequested) {
        try {
          if (!(await inspect()).ready) await caches.delete(CACHE_NAME);
        } catch (cleanupError) {
          console.error("Could not remove incomplete offline cache:", cleanupError);
        }
      }
      await reportError(error);
      throw error;
    }
  })();
  try {
    return await saving;
  } finally {
    saving = undefined;
    repairRequested = false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(save("install"));
  // Updates deliberately wait for every old client to close.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const status = await inspect();
    if (!status.ready) {
      const error = new Error("The offline guide is incomplete at activation");
      await reportError(error);
      throw error;
    }
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
    await broadcast(status);
  })());
});

self.addEventListener("message", (event) => {
  if (!["OFFLINE_STATUS", "OFFLINE_REPAIR"].includes(event.data?.type)) return;
  if (event.source?.url && new URL(event.source.url).origin !== self.location.origin) return;
  event.waitUntil((async () => {
    let message;
    try {
      message = event.data.type === "OFFLINE_REPAIR" ? await save("repair") : await inspect();
    } catch (error) {
      // save() already broadcasts repair errors; inspection failures must also be explicit.
      message = event.data.type === "OFFLINE_REPAIR" ? errorMessage(error) : await reportError(error);
    }
    event.ports?.[0]?.postMessage(message);
  })());
});

async function cachedEntry(path) {
  if (await caches.has(CACHE_NAME)) {
    const response = await (await caches.open(CACHE_NAME)).match(absolute(path));
    if (response && response.status === 200) return response;
  }
  await broadcast(await inspect());
  try {
    return await verifiedFetch(entries.get(path));
  } catch (error) {
    await reportError(error);
    throw error;
  }
}

async function unknownNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    try {
      const fallback = await cachedEntry(OFFLINE.fallback);
      return new Response(fallback.body, {
        status: 404, statusText: "Not Found", headers: fallback.headers,
      });
    } catch {
      return new Response("Not found. The offline guide is incomplete; reconnect and retry saving.", {
        status: 404, statusText: "Not Found", headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    const path = OFFLINE.navigations[url.pathname];
    event.respondWith(path ? cachedEntry(path) : unknownNavigation(request));
    return;
  }
  if (url.search || url.hash || request.headers.has("range")) return;
  const path = canonicalPath(url.pathname);
  if (entries.has(path)) event.respondWith(cachedEntry(path));
});
