/** Check source and built manifests separately, with exact allowed origins. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildMode, manifestFailures } from "./build-config.mjs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const sourceOnly = args.includes("--source-only");
const mode = buildMode(args.filter(value => value !== "--source-only"));
if (args.filter(value => value === "--source-only").length > 1) throw new Error("Duplicate source-only flag");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const targets = [["manifest.json", "prod"]];
if (!sourceOnly) targets.push(["dist/manifest.json", mode]);
let failures = 0;
for (const [file, expectedMode] of targets) {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, file), "utf8"));
    const errors = manifestFailures(manifest, expectedMode, pkg.version);
    for (const error of errors) console.error(`FAIL ${file}: ${error}`);
    failures += errors.length;
    if (!errors.length) console.log(`PASS ${file}: v${pkg.version}, ${expectedMode}, exact permissions and origin`);
  } catch {
    console.error(`FAIL ${file}: missing or invalid JSON; build the requested mode first`);
    failures++;
  }
}
process.exitCode = failures ? 1 : 0;
