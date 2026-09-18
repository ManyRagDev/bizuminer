/**
 * CLI de varredura da AliExpress: Open Platform oficial → PostgresStore.
 *
 * Uso: node --experimental-strip-types bin/sweep-aliexpress.ts [--pages N] [--mode directed|exploratory|all]
 *      [--keyword termo --category nome] [--min-discount 0.3] [--dry-run]
 *
 * Espelha `bin/sweep-shopee.ts`, que por sua vez espelha `bin/sweep.ts` (ML).
 * Arquivo próprio, sem tocar nos outros dois (M-R1/M-R5).
 *
 * Gate: `aliexpressCaptureEnabled()` exige flag + appKey + appSecret +
 * **trackingId**. O tracking id é obrigatório porque sem ele a API responde
 * normalmente e devolve links SEM atribuição — a rodagem "funcionaria" e
 * produziria um catálogo que não rende nada. Ver `src/aliexpress-capture.ts`.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { AliExpressAdapter } from "../../capture/src/adapters/aliexpress/index.ts";
import { aliexpressCaptureEnabled } from "../../capture/src/aliexpress-capture.ts";
import { PostgresStore } from "../src/pg-store.ts";
import { ensureAliExpressPublications } from "../src/aliexpress-links.ts";
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

if (!aliexpressCaptureEnabled()) {
  console.error(
    "[bloqueado] A captura da AliExpress está desligada.\n" +
      "Nenhuma requisição foi feita e nenhuma rodagem foi registrada.\n\n" +
      "Exige TODAS as variáveis abaixo:\n" +
      "  ALIEXPRESS_CAPTURE_ENABLED=true\n" +
      "  ALIEXPRESS_APP_KEY\n" +
      "  ALIEXPRESS_APP_SECRET\n" +
      "  ALIEXPRESS_TRACKING_ID   <- sem ele a API responde, mas os links não\n" +
      "                              geram comissão (verificado em 28/08/2026)",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[bloqueado] DATABASE_URL não definido — a captura exige Postgres configurado.");
  process.exit(1);
}

const ctx: CaptureContext = {
  runId: `sweep-aliexpress-${Date.now()}`,
  log: (e) => {
    if (e.level === "warn" || e.level === "error") {
      console.error(`[${e.level}] ${e.msg}${e.data ? " " + JSON.stringify(e.data) : ""}`);
    }
  },
};

const cred: Credential = {
  marketplace: "aliexpress",
  secret: {
    appKey: process.env.ALIEXPRESS_APP_KEY!,
    appSecret: process.env.ALIEXPRESS_APP_SECRET!,
    trackingId: process.env.ALIEXPRESS_TRACKING_ID!,
  },
};

const store = new PostgresStore({ connectionString: process.env.DATABASE_URL });
console.log("store: Postgres (Supabase, schema garimpa)");
const adapter = new AliExpressAdapter();

console.log(`Executando plano ${plan.id} na AliExpress (${entriesForMode(plan, mode).length} consultas, até ${pages} página(s) por consulta)...`);
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

// Diferente da Shopee, NÃO há chamada de API para gerar link: a query já
// devolve `promotion_link` atribuído ao tracking_id. Mas a `publication`
// ainda precisa existir — `click_event` referencia ela, e sem a linha o /go
// devolve 404 e o produto vira link morto (bug real, 28/08/2026).
console.log("\n=== Publicações e link de saída ===");
const links = await ensureAliExpressPublications(
  { connectionString: process.env.DATABASE_URL, tenantId: "local" },
  ctx,
);
console.log(`candidatos:      ${links.candidates}`);
console.log(`publicados:      ${links.linked}`);
console.log(`sem atribuição:  ${links.skippedWithoutLink}`);

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
