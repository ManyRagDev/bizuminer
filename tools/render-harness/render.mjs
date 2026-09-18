/**
 * Driver de renderização — Garimpa.
 *
 * Pipeline: snapshot canônico do PostSpark (social/specs/post-XX.snapshot.json)
 * -> cópia para client/public/harness-input/snapshot.json do PostSpark
 * -> navega na página harness-export.html do Vite dev
 * -> screenshot elementar de #post-target por slide (deviceScaleFactor 1).
 *
 * Uso:
 *   node render.mjs --snapshot <snapshot.json> --out <dir> \
 *        [--url http://127.0.0.1:5199] [--harness-dir <postspark client/public/harness-input>]
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const snapshotPath = getArg("--snapshot");
const outDir = getArg("--out");
const baseUrl = (getArg("--url") ?? "http://127.0.0.1:5199").replace(/\/+$/, "");
const harnessDir = getArg("--harness-dir");

if (!snapshotPath || !outDir) {
  console.error(
    "Uso: node render.mjs --snapshot <snapshot.json> --out <dir> [--url http://127.0.0.1:5199] [--harness-dir <abs>]"
  );
  process.exit(2);
}

const snapshot = JSON.parse(fs.readFileSync(path.resolve(snapshotPath), "utf8"));
const slideCount =
  snapshot.postMode === "carousel" && Array.isArray(snapshot.slides) && snapshot.slides.length
    ? snapshot.slides.length
    : 1;

fs.mkdirSync(path.resolve(outDir), { recursive: true });

if (harnessDir) {
  fs.mkdirSync(path.resolve(harnessDir), { recursive: true });
  fs.writeFileSync(
    path.resolve(harnessDir, "snapshot.json"),
    JSON.stringify(snapshot),
    "utf8"
  );
  console.log(`snapshot copiado para ${harnessDir}/snapshot.json`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    const candidates = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ];
    for (const exe of candidates) {
      if (fs.existsSync(exe)) {
        console.log(`chromium bundlado indisponível — usando ${exe}`);
        return chromium.launch({ headless: true, executablePath: exe });
      }
    }
    throw new Error("nenhum navegador Chromium disponível");
  }
}

const browser = await launchBrowser();

try {
  for (let i = 0; i < slideCount; i++) {
    const page = await browser.newPage({
      viewport: { width: 1120, height: 1480 },
      deviceScaleFactor: 1,
    });
    try {
      const url = `${baseUrl}/harness-export.html?slide=${i}`;
      await page.goto(url, { waitUntil: "load", timeout: 90000 });

      const renderError = await page.getAttribute("html", "data-render-error");
      if (renderError) throw new Error(`slide ${i + 1}: ${renderError}`);

      await page.waitForSelector('html[data-render-ready="1"]', { timeout: 45000 });
      const target = page.locator("#post-target");
      await target.waitFor({ state: "visible", timeout: 15000 });
      await page.waitForTimeout(400);

      const outPath = path.join(path.resolve(outDir), `slide-${i + 1}.png`);
      await target.screenshot({ path: outPath });
      console.log(`slide ${i + 1}/${slideCount} -> ${outPath}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log("renderização concluída.");
