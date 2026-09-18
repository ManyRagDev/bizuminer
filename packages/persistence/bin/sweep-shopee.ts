/**
 * CLI de varredura da Shopee: Open API oficial → PostgresStore + resumo no console.
 *
 * Uso: node --experimental-strip-types bin/sweep-shopee.ts [--pages N] [--mode directed|exploratory|all]
 *      [--keyword termo --category nome] [--min-discount 0.3] [--dry-run]
 *
 * Espelha `bin/sweep.ts` (ML) na estrutura, mas é um arquivo próprio — não
 * modifica o sweep do ML (M-R1, `docs/tecnico/plano-multiplataforma.md`).
 * Gate: `shopeeCaptureEnabled()` exige `SHOPEE_CAPTURE_ENABLED=true` +
 * `SHOPEE_APP_ID`/`SHOPEE_APP_SECRET`. Sem isso, o processo aborta ANTES de
 * criar `capture_run` e ANTES de qualquer chamada à API (M-R3: gate próprio,
 * nunca reaproveita o kill switch do ML).
 *
 * Diferente do sweep do ML, a Shopee é API oficial autenticada — não há
 * modo "memória" de conveniência sem banco: sem `DATABASE_URL`, o processo
 * aborta (rodar contra uma API paga/rate-limitada só para descartar o
 * resultado não serve a propósito nenhum aqui).
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { ShopeeAdapter } from "../../capture/src/adapters/shopee/index.ts";
import { shopeeCaptureEnabled } from "../../capture/src/shopee-capture.ts";
import { PostgresStore } from "../src/pg-store.ts";
import { ensureShopeeAffiliateLinks } from "../src/shopee-links.ts";
import type { CaptureContext, Credential } from "../../capture/src/types.ts";
import {
  CATEGORY_FIRST_PLAN,
  entriesForMode,
  runCapturePlan,
  type CapturePlan,
  type CapturePlanMode,
} from "../src/capture-plan.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const pages = Number(flag("pages") ?? 1);
const minDiscount = flag("min-discount") ? Number(flag("min-discount")) : undefined;
const keyword = flag("keyword");
const requestedMode = flag("mode") ?? "all";
const dryRun = args.includes("--dry-run");
const operationBatchId = flag("operation-batch");

if (!(["directed", "exploratory", "all"] as const).includes(requestedMode as CapturePlanMode | "all")) {
  console.error('[bloqueado] --mode deve ser "directed", "exploratory" ou "all".');
  process.exit(1);
}

const plan: CapturePlan = keyword
  ? {
      id: "manual-query-v1",
      entries: [
        {
          id: "manual-query",
          mode: "directed",
          category: flag("category") ?? "Consulta manual",
          keyword,
        },
      ],
    }
  : CATEGORY_FIRST_PLAN;
const mode = keyword ? "all" : (requestedMode as CapturePlanMode | "all");

if (dryRun) {
  console.log(`Plano: ${plan.id} (${mode})`);
  for (const entry of entriesForMode(plan, mode)) {
    console.log(`- [${entry.mode}] ${entry.category}${entry.family ? ` / ${entry.family}` : ""}: "${entry.keyword}"`);
  }
  process.exit(0);
}

// Gate M1: aborta antes de instanciar adapter/store e de qualquer rede.
if (!shopeeCaptureEnabled()) {
  console.error(
    "[bloqueado] A captura da Shopee está desligada (SHOPEE_CAPTURE_ENABLED e/ou credencial ausente).\n" +
      "Nenhuma requisição foi feita e nenhuma rodagem foi registrada.\n" +
      "Para liberar: defina SHOPEE_CAPTURE_ENABLED=true, SHOPEE_APP_ID e SHOPEE_APP_SECRET.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[bloqueado] DATABASE_URL não definido — a captura da Shopee exige Postgres configurado.");
  process.exit(1);
}

const ctx: CaptureContext = {
  runId: `sweep-shopee-${Date.now()}`,
  log: (e) => {
    if (e.level === "warn" || e.level === "error") console.error(`[${e.level}] ${e.msg}`);
  },
};

const cred: Credential = {
  marketplace: "shopee",
  secret: {
    appId: process.env.SHOPEE_APP_ID!,
    appSecret: process.env.SHOPEE_APP_SECRET!,
  },
};

const store = new PostgresStore({ connectionString: process.env.DATABASE_URL });
console.log("store: Postgres (Supabase, schema garimpa)");
const adapter = new ShopeeAdapter();

console.log(`Executando plano ${plan.id} na Shopee (${entriesForMode(plan, mode).length} consultas, até ${pages} página(s) por consulta)...`);
const summary = await runCapturePlan(
  adapter,
  cred,
  store,
  {
    tenantId: "local",
    plan,
    mode,
    maxPagesPerQuery: pages,
    minClaimedDiscount: minDiscount,
    operationBatchId,
  },
  ctx,
);

console.log("\n=== Resumo do plano ===");
console.log(`consultas:      ${summary.queriesCompleted}/${summary.queriesPlanned}`);
console.log(`falhas:         ${summary.queriesFailed}`);
console.log(`saturadas:      ${summary.queriesSaturated}`);
console.log(`itens recebidos:${String(summary.itemsSeen).padStart(5)}`);
console.log(`itens gravados: ${summary.itemsCaptured}`);
console.log(`novos:          ${summary.itemsNew}`);
console.log(`mudanças preço: ${summary.priceChanges}`);
console.log(`limitados:      ${summary.itemsSkippedByPolicy}`);
console.log(`duração:        ${summary.durationMs}ms`);

const activity = await store.productActivity("local", null);
console.log("\n=== Estado de vida do catálogo geral após o plano ===");
console.log(`recentes (últimos 14d): ${activity.recente}`);
console.log(`dormentes (histórico):  ${activity.dormente}`);

await store.close();
if (summary.queriesFailed > 0) process.exitCode = 1;

// M3: gera e persiste o link de saída (fora do redirect do /go, ver
// shopee-links.ts). Idempotente — só processa publications sem affiliate_url.
console.log("\n=== Links de afiliado (M3) ===");
const linkSummary = await ensureShopeeAffiliateLinks(
  { connectionString: process.env.DATABASE_URL, tenantId: "local", credential: cred },
  ctx,
);
console.log(`candidatos: ${linkSummary.candidates}`);
console.log(`gerados:    ${linkSummary.generated}`);
console.log(`falhas:     ${linkSummary.failed}`);

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
