import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configurationToken = "/* OFFLINE_CONFIGURATION */";
const staticCode = /^_next\/static\/.+\.(?:js|css|woff2?|ttf|otf|eot)$/i;
const staticIcon = /^_next\/static\/media\/(?:marker-icon(?:-2x)?|marker-shadow|layers(?:-2x)?)\.[\w-]+\.png$/;
const rootIcon = /^(?:favicon\.ico|(?:icon|apple-icon)(?:-\d+)?\.(?:ico|png|svg))$/;

export function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export function stripOfflineStamp(html) {
  return html.replace(/<meta name="culture-night-offline-release" content="[a-f0-9]{64}" data-document="[a-f0-9]{64}">/g, "");
}

export function assetUrl(relativePath) {
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".."
    || /[%\\?#\u0000-\u0020\u007f]/.test(segment))) {
    throw new Error(`Unsafe offline asset path: ${relativePath}`);
  }
  return `/${segments.map(encodeURIComponent).join("/")}`;
}

async function exportFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = `${prefix}${entry.name}`;
    // Never follow a symlink outside the export or silently omit an essential asset.
    if (entry.isSymbolicLink()) throw new Error(`Symlink in offline export: ${relativePath}`);
    if (entry.isDirectory()) {
      result.push(...await exportFiles(join(directory, entry.name), `${relativePath}/`));
    } else if (entry.isFile()) {
      result.push(relativePath);
    }
  }
  return result;
}

export async function createOfflineBuild({
  outDir = join(siteDir, "out"),
  programmePath = join(siteDir, "src/api/programme.json"),
  runtimePath = join(siteDir, "scripts/offline-worker.js"),
} = {}) {
  const [programmeSource, runtime, generatorSource, files] = await Promise.all([
    readFile(programmePath, "utf8"),
    readFile(runtimePath, "utf8"),
    readFile(fileURLToPath(import.meta.url), "utf8"),
    exportFiles(outDir),
  ]);
  const programme = JSON.parse(programmeSource);
  if (!Number.isInteger(programme.year) || programme.year < 2000 || programme.year > 9999
    || typeof programme.fetchedAt !== "string" || !Number.isFinite(Date.parse(programme.fetchedAt))) {
    throw new Error("Offline build requires a valid programme year and fetchedAt.");
  }
  const programmeRoute = `/1/${programme.year}`;
  const required = ["index.html", `1/${programme.year}/index.html`, "404.html"];
  for (const path of required) {
    if (!files.includes(path)) throw new Error(`Missing essential offline export: ${path}`);
  }
  const documents = new Set([...required, "index.txt", `1/${programme.year}/index.txt`]);
  const selected = files.filter((path) => documents.has(path)
    || staticCode.test(path) || staticIcon.test(path) || rootIcon.test(path)).sort();
  if (!selected.some((path) => path.startsWith("_next/static/") && path.endsWith(".js"))) {
    throw new Error("Offline export has no application JavaScript.");
  }
  const htmlDocuments = [];
  const manifest = await Promise.all(selected.map(async (path) => {
    const url = assetUrl(path);
    const contents = await readFile(join(outDir, path));
    if (!path.endsWith(".html")) return { url, sha256: sha256(contents) };
    const html = stripOfflineStamp(contents.toString("utf8"));
    if (!/<head(?:\s[^>]*)?>[\s\S]*<\/head\s*>/i.test(html)) {
      throw new Error(`Offline HTML has no document head: ${path}`);
    }
    const hash = sha256(html);
    htmlDocuments.push({ path, html, hash });
    return { url, sha256: hash, html: true };
  }));
  const version = sha256(JSON.stringify({
    generatorSource, runtime, programmeSource, manifest,
  }));
  const config = {
    version,
    year: programme.year,
    fetchedAt: programme.fetchedAt,
    manifest,
    navigations: {
      "/": "/index.html",
      "/index.html": "/index.html",
      [programmeRoute]: `${programmeRoute}/index.html`,
      [`${programmeRoute}/`]: `${programmeRoute}/index.html`,
      [`${programmeRoute}/index.html`]: `${programmeRoute}/index.html`,
    },
    fallback: "/404.html",
    timeoutMs: 18000,
  };
  if (runtime.split(configurationToken).length !== 2) {
    throw new Error("Offline worker must have exactly one configuration placeholder.");
  }
  const worker = runtime.replace(configurationToken, () => `const OFFLINE = ${JSON.stringify(config)};`);
  const stampedDocuments = htmlDocuments.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    .map(({ path, html, hash }) => ({
      path,
      contents: html.replace(/<head(?:\s[^>]*)?>/i, (head) => (
        `${head}<meta name="culture-night-offline-release" content="${version}" data-document="${hash}">`
      )),
    }));
  return { config, worker, stampedDocuments };
}

export async function buildOffline(options = {}) {
  const result = await createOfflineBuild(options);
  const outDir = options.outDir ?? join(siteDir, "out");
  await Promise.all(result.stampedDocuments.map(({ path, contents }) => writeFile(join(outDir, path), contents)));
  await writeFile(join(outDir, "sw.js"), result.worker);
  return result;
}

async function main() {
  if (process.argv.length > 2) throw new Error("Usage: node scripts/build-offline.mjs");
  const { config } = await buildOffline();
  console.log(`Offline guide ${config.year}: ${config.manifest.length} assets, release ${config.version}.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error("Offline build failed:", error);
    process.exitCode = 1;
  });
}
