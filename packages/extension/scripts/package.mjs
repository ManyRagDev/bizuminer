/**
 * Empacotamento reproduzível (E8): gera `release/bizuminer-extension-v<versão>/`
 * com o conteúdo de `dist/` e um `RELEASE.txt` com a lista de arquivos e hashes
 * SHA-256 (evidência derivada por máquina, não montada à mão). O ZIP final
 * pode ser criado a partir desta pasta com `Compress-Archive` (Windows) ou
 * `zip -r` (unix) — a pasta já é carregável como "unpacked" no Chrome.
 */

import { build } from "esbuild";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const distDir = path.join(root, "dist");
const releaseDir = path.join(root, "release", `bizuminer-extension-v${version}`);

await rm(path.join(root, "release"), { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

// Rebuild garantido (idempotente).
await import("./build.mjs");

async function copyTree(src, dest) {
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyTree(from, to);
    } else {
      await cp(from, to);
    }
  }
}
await copyTree(distDir, releaseDir);

async function listFiles(dir, base = "") {
  const out = [];
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listFiles(path.join(dir, entry.name), rel)));
    } else {
      const bytes = await readFile(path.join(dir, entry.name));
      out.push({ rel, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
  return out;
}

const files = await listFiles(releaseDir);
const lines = [
  `BizuMiner extension release v${version}`,
  `generated: ${new Date().toISOString()}`,
  `files: ${files.length}`,
  "",
  ...files.map((f) => `${f.sha256}  ${f.bytes}  ${f.rel}`),
];
await writeFile(path.join(releaseDir, "RELEASE.txt"), lines.join("\n") + "\n");

console.log(`release em release/bizuminer-extension-v${version}/ (${files.length} arquivos + RELEASE.txt)`);
