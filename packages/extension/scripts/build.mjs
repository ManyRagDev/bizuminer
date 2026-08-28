/**
 * Build da extensão (E5/E8): esbuild empacota o service worker, o content
 * script e o popup para `dist/`. Content script vira IIFE (não suporta ESM no
 * mundo isolado); service worker e popup também IIFE para simplicidade.
 */

import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outdir = path.join(root, "dist");
const dev = process.argv.includes("--dev");
const apiBase = dev ? "http://localhost:3100" : "https://www.bizuminer.com.br";

await rm(outdir, { recursive: true, force: true });
await mkdir(path.join(outdir, "content"), { recursive: true });
await mkdir(path.join(outdir, "popup"), { recursive: true });

const common = {
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: false,
  define: { __API_BASE__: JSON.stringify(apiBase) },
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
  entryPoints: [path.join(root, "src/popup/popup.ts")],
  outfile: path.join(outdir, "popup/popup.js"),
});

// Manifest: em dev, acrescenta o host local à lista de host_permissions.
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
if (dev) {
  manifest.name = `${manifest.name} (dev)`;
  const hostPermissions = new Set(manifest.host_permissions ?? []);
  hostPermissions.add("http://localhost:3100/*");
  manifest.host_permissions = [...hostPermissions];
}
await writeFile(path.join(outdir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

await cp(path.join(root, "src/popup/index.html"), path.join(outdir, "popup/index.html"));
await cp(path.join(root, "src/popup/popup.css"), path.join(outdir, "popup/popup.css"));

console.log(`extensão construída em dist/ (${dev ? "dev → " + apiBase : "prod → " + apiBase})`);
