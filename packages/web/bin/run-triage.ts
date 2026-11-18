/**
 * CLI para execução de triagem editorial automatizada.
 * Uso: node --env-file=.env.local --experimental-strip-types bin/run-triage.ts [--limit 50] [--tenant local]
 */
import { runPendingAutomatedTriage } from "../lib/curation-db.ts";
import { refreshHomepageAfterChange } from "../lib/homepage-db.ts";
import { aiCurationReadiness } from "../lib/ai-curation-provider.ts";
import { captureDiagnostic, captureDiagnosticLine } from "../../persistence/src/capture-diagnostic.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const limit = Number(flag("limit") ?? 50);
const tenantId = flag("tenant") ?? "local";
const batchId = flag("batch");
const workerId = flag("worker");
const trialSingleProduct = args.includes("--trial-single-product");
if (batchId && !workerId) throw new Error("capture_batch_worker_required");
if (trialSingleProduct && (!batchId || !workerId || limit !== 1)) throw new Error("capture_trial_scope_required");

console.log(`[triage-cli] Iniciando triagem automatizada (limite: ${limit}, tenant: ${tenantId})...`);

try {
  const readiness = aiCurationReadiness();
  if (!readiness.ready) throw new Error(readiness.error ?? "ai_curation_not_configured");
  let totalProcessed = 0;
  let totalApproved = 0;
  let totalHeld = 0;
  let totalRejected = 0;
  let totalAnnotatedPending = 0;
  let lastTriageRunId: string | undefined;

  const drain = !trialSingleProduct && Boolean(batchId || args.includes("--drain"));
  const maxCycles = drain ? 15 : 1;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const summary = await runPendingAutomatedTriage(
      tenantId,
      limit,
      batchId && workerId ? { captureBatch: { id: batchId, workerId },
        ...(trialSingleProduct ? { autoPublish: false, autoDismissScore3: false } : {}) } : undefined,
    );

    if (summary.processed === 0) {
      if (cycle === 1) {
        console.log(`[triage-cli] Nenhum candidato pendente para triagem.`);
      }
      break;
    }

    totalProcessed += summary.processed;
    totalApproved += summary.approved;
    totalHeld += summary.held;
    totalRejected += summary.rejected;
    totalAnnotatedPending += summary.annotatedPending;
    if (summary.triageRunId) lastTriageRunId = summary.triageRunId;

    console.log(
      `[triage-cli] Ciclo ${cycle}: ${summary.processed} processados (${summary.approved} aprovados, ${summary.held} em espera, ${summary.rejected} rejeitados, ${summary.annotatedPending} pendentes).`,
    );

    if (!drain) break;
  }

  // Sempre atualiza a vitrine após a triagem para refletir os produtos aprovados
  if (!trialSingleProduct) await refreshHomepageAfterChange(tenantId);

  console.log(`[triage-cli] Triagem concluída:`);
  console.log(`  Processados: ${totalProcessed}`);
  console.log(`  Aprovados:   ${totalApproved}`);
  console.log(`  Em Espera:   ${totalHeld}`);
  console.log(`  Rejeitados:  ${totalRejected}`);
  console.log(`  Pendentes:   ${totalAnnotatedPending}`);
  if (lastTriageRunId) {
    console.log(`  Triage Run ID: ${lastTriageRunId}`);
  }

  const aggregatedSummary = {
    processed: totalProcessed,
    approved: totalApproved,
    held: totalHeld,
    rejected: totalRejected,
    annotatedPending: totalAnnotatedPending,
    triageRunId: lastTriageRunId,
  };
  console.log(`TRIAGE_SUMMARY=${JSON.stringify(aggregatedSummary)}`);
  process.exit(0);
} catch (err) {
  console.log(captureDiagnosticLine(captureDiagnostic(err, "cli")));
  console.error("[triage-cli] A triagem não foi concluída; confira o diagnóstico da execução.");
  process.exit(1);
}
