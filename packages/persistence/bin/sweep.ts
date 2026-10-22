/**
 * CLI legado de ML: recusa permanente antes das importações operacionais.
 * Use a extensão BizuMiner ou o bloco manual no painel (OS-032).
 */

import { mlAutomatedCaptureEnabled } from "../../capture/src/automated-capture.ts";
import type { CaptureContext, Credential } from "../../capture/src/types.ts";
import type { OfferStore } from "../src/store.ts";

// Nenhuma flag, consentimento ou argumento reabre esta entrada.
if (!mlAutomatedCaptureEnabled()) {
  console.log("CAPTURE_FAILURE=" + JSON.stringify({
    version: 1,
    marketplace: "mercadolivre",
    kind: "manual_capture_only",
  }));
  console.error("manual_capture_only: use a extensão BizuMiner ou importe o bloco manual no painel.");
  process.exit(1);
}

// Código legado preservado; só seria carregado após o gate, sempre falso.
const { spawn } = await import("node:child_process");
const { default: path } = await import("node:path");
const { MercadoLivreDealsAdapter } = await import("../../capture/src/adapters/mercadolivre/deals.ts");
const { CaptureError } = await import("../../capture/src/errors.ts");
const { sweep } = await import("../src/ingest.ts");
const { InMemoryStore } = await import("../src/store.ts");
const { PostgresStore } = await import("../src/pg-store.ts");

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const pages = Number(flag("pages") ?? 1);
const minDiscount = flag("min-discount") ? Number(flag("min-discount")) : undefined;
const operationBatchId = flag("operation-batch");

const ctx: CaptureContext = {
  runId: `sweep-${Date.now()}`,
  log: (e) => {
    if (e.level === "warn" || e.level === "error") console.error(`[${e.level}] ${e.msg}`);
  },
};

const cred: Credential = { marketplace: "mercadolivre", secret: {} };

// Store: Postgres (Supabase) quando DATABASE_URL está definido; senão memória.
let store: OfferStore;
const mem = process.env.DATABASE_URL ? null : new InMemoryStore();
const pg = process.env.DATABASE_URL
  ? new PostgresStore({ connectionString: process.env.DATABASE_URL })
  : null;
store = pg ?? mem!;
console.log(
  pg ? "store: Postgres (Supabase, schema garimpa)" : "store: memória (DATABASE_URL não definido)",
);
const adapter = new MercadoLivreDealsAdapter();

console.log(`Varrendo /ofertas (páginas: ${pages})...`);
const summary = await sweep(
  adapter,
  cred,
  store,
  {
    tenantId: "local",
    params: { minClaimedDiscount: minDiscount },
    maxPages: pages,
    operationBatchId,
  },
  ctx,
).catch(async (error: unknown) => {
  // Machine contract: no vendor URL, body, session or credential crosses the process boundary.
  console.log("CAPTURE_FAILURE=" + JSON.stringify({
    version: 1,
    marketplace: "mercadolivre",
    kind: error instanceof CaptureError ? error.kind : "internal",
  }));
  if (pg) await pg.close();
  process.exit(1);
});

console.log("\n=== Resumo ===");
console.log(`marketplace:    ${summary.marketplace}`);
console.log(`itens:          ${summary.itemsCaptured}`);
console.log(`novos:          ${summary.itemsNew}`);
console.log(`mudanças preço: ${summary.priceChanges}`);
console.log(`duração:        ${summary.durationMs}ms`);

const activity = await store.productActivity("local", summary.runId);
console.log("\n=== Estado de vida do catálogo (derivado, nunca gravado) ===");
console.log(`ativos (rodagem atual):   ${activity.ativo}`);
console.log(`recentes (últimos 14d):   ${activity.recente}`);
console.log(`dormentes (histórico):    ${activity.dormente}`);

console.log("\n=== Top 10 por desconto ===");
if (pg) {
  const top = await pg.topByClaimedDiscount("local", 10);
  top.forEach((t) => {
    const off = Math.round(t.claimedDiscountRate * 100);
    console.log(
      `${String(off).padStart(3)}% OFF  R$ ${(t.lastPriceCents / 100).toFixed(2).padStart(9)}  ${t.title.slice(0, 70)}`,
    );
  });
  await pg.close();
} else {
  const ranked = await Promise.all(
    mem!.allProducts.map(async (p) => ({
      p,
      latest: await mem!.latestObservation(p.id),
    })),
  );
  ranked
    .filter((r) => (r.latest?.claimedDiscountRate ?? 0) > 0)
    .sort((a, b) => (b.latest!.claimedDiscountRate ?? 0) - (a.latest!.claimedDiscountRate ?? 0))
    .slice(0, 10)
    .forEach(({ p, latest }) => {
      const off = Math.round((latest!.claimedDiscountRate ?? 0) * 100);
      console.log(
        `${String(off).padStart(3)}% OFF  R$ ${(p.lastPriceCents / 100).toFixed(2).padStart(9)}  ${p.title.slice(0, 70)}`,
      );
    });
}

if (args.includes("--trigger-triage")) {
  console.log("\n=== Loop Fechado: Disparando Triagem Editorial Automatizada (--trigger-triage) ===");
  const triageScript = path.resolve(import.meta.dirname, "../../web/bin/run-triage.ts");
  const child = spawn(
    process.execPath,
    ["--env-file=../web/.env.local", "--experimental-strip-types", triageScript, "--limit", "100"],
    { stdio: "inherit", cwd: path.resolve(import.meta.dirname, "..") }
  );
  await new Promise<void>((resolve) => {
    child.on("close", (code) => {
      if (code === 0) {
        console.log("=== Triagem automatizada pós-captura concluída com sucesso ===");
      } else {
        console.warn(`[aviso] Triagem automatizada pós-captura encerrou com código ${code}`);
      }
      resolve();
    });
  });
}
