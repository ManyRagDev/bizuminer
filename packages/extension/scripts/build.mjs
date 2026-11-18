/**
 * Build da extensão (E5/E8): esbuild empacota o service worker, o content
 * script e o popup para `dist/`. Content script vira IIFE (não suporta ESM no
 * mundo isolado); service worker e popup também IIFE para simplicidade.
 */

import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { apiOrigin, buildMode, manifestFailures, manifestForBuild } from "./build-config.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outdir = path.join(root, "dist");
export async function buildExtension(mode = "prod") {
const apiBase = apiOrigin(mode);
const source = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const sourceFailures = manifestFailures(source, "prod", pkg.version);
if (sourceFailures.length) throw new Error(sourceFailures.join("; "));

await rm(outdir, { recursive: true, force: true });
await mkdir(path.join(outdir, "content"), { recursive: true });
await mkdir(path.join(outdir, "popup"), { recursive: true });

const common = {
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: false,
  define: { __API_BASE__: JSON.stringify(apiBase), __COLLECTOR_VERSION__: JSON.stringify(pkg.version) },
};

await build({
  ...common,
  entryPoints: [path.join(root, "src/background/service-worker.ts")],
  outfile: path.join(outdir, "service-worker.js"),
});

await build({
  ...common,
  entryPoints: [path.join(root, "src/content/activate-catalog.ts")],
  outfile: path.join(outdir, "content/activate-catalog.js"),
});

await build({
  ...common,
  entryPoints: [path.join(root, "src/content/marketplace-page.ts")],
  outfile: path.join(outdir, "content/marketplace-page.js"),
  globalName: "bizuMarketplaceReader",
  footer: { js: "bizuMarketplaceReader.collectMarketplacePage();" },
});

await build({
  ...common,
  entryPoints: [path.join(root, "src/popup/popup.ts")],
  outfile: path.join(outdir, "popup/popup.js"),
});

// Each build has one origin. A development artifact never inherits production access.
const manifest = manifestForBuild(source, mode);
await writeFile(path.join(outdir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

await cp(path.join(root, "src/popup/index.html"), path.join(outdir, "popup/index.html"));
await cp(path.join(root, "src/popup/popup.css"), path.join(outdir, "popup/popup.css"));

console.log(`extensão construída em dist/ (${mode} → ${apiBase})`);
return { mode, apiBase, version: pkg.version, outdir };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildExtension(buildMode(process.argv.slice(2)));
}
