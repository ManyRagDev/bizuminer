import { databaseSsl } from "../src/database-ssl.ts";
import { classifyCaptureFailure, captureFailureLine } from "../src/capture-failure.ts";
import { captureDiagnostic, captureDiagnosticLine, type CaptureDiagnostic } from "../src/capture-diagnostic.ts";
import postgres from "postgres";
import { resolveWorkerCredential, accountCaptureAdapter } from "../src/account-credentials.ts";
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
  SINGLE_PRODUCT_TRIAL_PLAN,
  entriesForMode,
  runCapturePlan,
  type CapturePlan,
  type CapturePlanMode,
} from "../src/capture-plan.ts";
import {
  buildDepartmentPlan,
  formatDepartmentPlanPreview,
} from "../src/department-plan.ts";
import type { SourceQueryOrder } from "../../capture/src/types.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const tenantId = flag("tenant") ?? "local";
if(!/^[a-z0-9._-]{1,64}$/.test(tenantId)) throw new Error("invalid_capture_tenant");
const trialSingleProduct = args.includes("--trial-single-product");
const pages = trialSingleProduct ? 1 : Number(flag("pages") ?? 2);
const pageSize = trialSingleProduct ? 10 : flag("page-size") ? Number(flag("page-size")) : 20;
const minDiscount = flag("min-discount") ? Number(flag("min-discount")) : undefined;
const keyword = flag("keyword");
const requestedMode = flag("mode") ?? "all";
const requestedPlan = flag("plan") ?? "departments";
const requestedOrder = (flag("order") as SourceQueryOrder | undefined) ?? "sales";
const dryRun = args.includes("--dry-run");
const operationBatchId = flag("operation-batch");
if (trialSingleProduct && (!operationBatchId || !flag("worker"))) throw new Error("capture_trial_requires_owned_shopee_batch");

if (!(["directed", "exploratory", "all"] as const).includes(requestedMode as CapturePlanMode | "all")) {
  console.error('[bloqueado] --mode deve ser "directed", "exploratory" ou "all".');
  process.exit(1);
}

const isDepartmentPlan = !trialSingleProduct && !keyword && (requestedPlan === "departments" || requestedPlan === "department");

const plan: CapturePlan = trialSingleProduct ? SINGLE_PRODUCT_TRIAL_PLAN : keyword
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
  : isDepartmentPlan
    ? buildDepartmentPlan("shopee", { order: requestedOrder })
    : CATEGORY_FIRST_PLAN;
const mode = trialSingleProduct || keyword || isDepartmentPlan ? "all" : (requestedMode as CapturePlanMode | "all");

if (dryRun) {
  if (isDepartmentPlan) {
    console.log(formatDepartmentPlanPreview("shopee", { order: requestedOrder, pages, pageSize }));
    process.exit(0);
  }
  console.log(`Plano: ${plan.id} (${mode})`);
  for (const entry of entriesForMode(plan, mode)) {
    console.log(`- [${entry.mode}] ${entry.category}${entry.family ? ` / ${entry.family}` : ""}: "${entry.keyword ?? entry.sourceQuery?.kind}"`);
  }
  process.exit(0);
}

// Gate M1: aborta antes de instanciar adapter/store e de qualquer rede.
if (process.env.SHOPEE_CAPTURE_ENABLED !== "true") {
  console.log(captureFailureLine("shopee", { kind: "credential" }));
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

const credentialSql=postgres(process.env.DATABASE_URL!,{prepare:false,max:1,ssl:databaseSsl(process.env.DATABASE_URL!)});
let diagnosticPhase: CaptureDiagnostic["phase"] = "credentials";
try {
const ctx: CaptureContext = {
  runId: `sweep-shopee-${Date.now()}`,
  log: (e) => {
    if (e.level === "warn" || e.level === "error") console.error(`[${e.level}] ${e.msg}`);
  },
};

const cred = await resolveWorkerCredential(credentialSql,tenantId,"shopee");

diagnosticPhase = "initialization";
const store = new PostgresStore({ connectionString: process.env.DATABASE_URL });
console.log("store: Postgres (Supabase, schema garimpa)");
const adapter = accountCaptureAdapter(credentialSql,tenantId,new ShopeeAdapter(trialSingleProduct ? { maxAttempts: 1 } : {}));

console.log(`Executando plano ${plan.id} na Shopee (${entriesForMode(plan, mode).length} consultas, até ${pages} página(s) por consulta)...`);
diagnosticPhase = "capture_query";
const summary = await runCapturePlan(
  adapter,
  cred,
  store,
  {
    tenantId,
    plan,
    mode,
    maxPagesPerQuery: pages,
    pageSize,
    minClaimedDiscount: minDiscount,
    operationBatchId,
    operationWorkerId: flag("worker"),
    trialSingleProduct,
  },
  ctx,
);

if (summary.failure) console.log(captureFailureLine("shopee", summary.failure));
if (summary.diagnostic) console.log(captureDiagnosticLine(summary.diagnostic));
if (operationBatchId && summary.queriesFailed > 0) process.exitCode = 1;
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

diagnosticPhase = "activity";
const activity = await store.productActivity(tenantId, null);
console.log("\n=== Estado de vida do catálogo geral após o plano ===");
console.log(`recentes (últimos 14d): ${activity.recente}`);
console.log(`dormentes (histórico):  ${activity.dormente}`);

await store.close();
// Falha o processo apenas se NENHUMA consulta teve sucesso.
// Falhas parciais em categorias pontuais continuam o fluxo para triar e aproveitar os produtos capturados.
if (summary.queriesCompleted === 0) process.exitCode = 1;

// M3: gera e persiste o link de saída (fora do redirect do /go, ver
// shopee-links.ts). Idempotente — só processa publications sem affiliate_url.
if (!operationBatchId) {
console.log("\n=== Links de afiliado (M3) ===");
const linkSummary = await ensureShopeeAffiliateLinks(
  { connectionString: process.env.DATABASE_URL, tenantId, credential: cred },
  ctx,
);
console.log(`candidatos: ${linkSummary.candidates}`);
console.log(`gerados:    ${linkSummary.generated}`);
console.log(`falhas:     ${linkSummary.failed}`);
if (linkSummary.failed > 0) process.exitCode = 1;

}

if (!operationBatchId && args.includes("--trigger-triage")) {
  console.log("\n=== Loop Fechado: Disparando Triagem Editorial Automatizada (--trigger-triage) ===");
  const triageScript = path.resolve(import.meta.dirname, "../../web/bin/run-triage.ts");
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", triageScript, "--limit", "200", "--drain", "--tenant", tenantId],
    { stdio: "inherit", cwd: path.resolve(import.meta.dirname, "..") }
  );
  await new Promise<void>((resolve) => {
    child.on("close", (code) => {
      if (code === 0) {
        console.log("=== Triagem automatizada pós-captura concluída com sucesso ===");
      } else {
        process.exitCode = 1;
        console.warn(`[aviso] Triagem automatizada pós-captura encerrou com código ${code}`);
      }
      resolve();
    });
  });
}

} catch (error) {
  console.log(captureFailureLine("shopee", classifyCaptureFailure(error)));
  console.log(captureDiagnosticLine(captureDiagnostic(error, diagnosticPhase)));
  process.exitCode = 1;
} finally {await credentialSql.end();}
