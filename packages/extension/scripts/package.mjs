/** Production-only artifact. Existing releases are never overwritten or removed. */
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildExtension } from "./build.mjs";
import { PRODUCTION_ORIGIN, manifestFailures } from "./build-config.mjs";
if (process.argv.length > 2) throw new Error("Package is production-only and accepts no mode flags");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid release version");
const name = `bizuminer-extension-v${version}`;
const releaseRoot = path.join(root, "release");
const releaseDir = path.join(releaseRoot, name);
const zipPath = `${releaseDir}.zip`;
const staging = path.join(releaseRoot, `.${name}-${process.pid}.tmp`);
const temporaryZip = `${staging}.zip`;
for (const destination of [releaseDir, zipPath, `${zipPath}.sha256`]) {
  try { await stat(destination); throw new Error(`Release already exists: ${path.basename(destination)}; use a new version`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
const hasZip = spawnSync("zip", ["-v"], { stdio: "ignore" }).status === 0;
const built = await buildExtension("prod");
const manifest = JSON.parse(await readFile(path.join(built.outdir, "manifest.json"), "utf8"));
const failures = manifestFailures(manifest, "prod", version);
if (failures.length) throw new Error(failures.join("; "));
await mkdir(releaseRoot, { recursive: true });
async function listFiles(directory, prefix = "") {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error("Release may not contain symlinks");
    if (entry.isDirectory()) result.push(...await listFiles(path.join(directory, entry.name), rel));
    else {
      const bytes = await readFile(path.join(directory, entry.name));
      result.push({ path: rel, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
  return result;
}
try {
  await cp(built.outdir, staging, { recursive: true, force: false, errorOnExist: true });
  const files = await listFiles(staging);
  await writeFile(path.join(staging, "release-manifest.json"), JSON.stringify({ version, mode: "prod", apiOrigin: PRODUCTION_ORIGIN, files }, null, 2) + "\n");
  await writeFile(path.join(staging, "RELEASE.txt"), [
    `BizuMiner extension v${version}`, `mode: production`, `API: ${PRODUCTION_ORIGIN}`,
    "Chromium / Vivaldi: extract the ZIP and use Load unpacked with the folder containing manifest.json.",
    "For an existing unpacked install, update its files and reload it manually in the browser extensions page.",
    "A different folder can change the extension ID. Check the actual browser ID before changing the server allowlist.",
    "This package contains no identity key and does not update the browser or server automatically.",
    "Imports require human confirmation and remain pending editorial review. No automatic AI triage.", "",
    ...files.map(file => `${file.sha256}  ${file.bytes}  ${file.path}`), "",
  ].join("\n"));
  if (hasZip) {
    const zipFiles = (await listFiles(staging)).map(file => file.path);
    const result = spawnSync("zip", ["-X", "-q", temporaryZip, ...zipFiles], { cwd: staging, stdio: "pipe" });
    if (result.status !== 0) throw new Error("ZIP creation failed");
  }
  await rename(staging, releaseDir);
  if (hasZip) {
    await rename(temporaryZip, zipPath);
    const digest = createHash("sha256").update(await readFile(zipPath)).digest("hex");
    await writeFile(`${zipPath}.sha256`, `${digest}  ${path.basename(zipPath)}\n`);
  }
  console.log(`Production release: release/${name}/ (${files.length} payload files, SHA-256 manifest)`);
  console.log(hasZip ? `ZIP: release/${name}.zip (+ .sha256)` : "ZIP unavailable: install the zip utility; unpacked production folder is ready.");
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  await rm(temporaryZip, { force: true });
  throw error;
}
