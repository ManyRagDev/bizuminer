/**
 * CLI para execução de triagem editorial automatizada.
 * Uso: node --env-file=.env.local --experimental-strip-types bin/run-triage.ts [--limit 50] [--tenant local]
 */
import { runPendingAutomatedTriage } from "../lib/curation-db.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const limit = Number(flag("limit") ?? 50);
const tenantId = flag("tenant") ?? "local";
const batchId = flag("batch");
const workerId = flag("worker");
if (batchId && !workerId) throw new Error("capture_batch_worker_required");

console.log(`[triage-cli] Iniciando triagem automatizada (limite: ${limit}, tenant: ${tenantId})...`);

try {
  const summary = await runPendingAutomatedTriage(tenantId, limit,
    batchId && workerId ? { captureBatch: { id: batchId, workerId } } : undefined);
  console.log(`[triage-cli] Triagem concluída:`);
  console.log(`  Processados: ${summary.processed}`);
  console.log(`  Aprovados:   ${summary.approved}`);
  console.log(`  Em Espera:   ${summary.held}`);
  console.log(`  Rejeitados:  ${summary.rejected}`);
  console.log(`  Pendentes:   ${summary.annotatedPending}`);
  if (summary.triageRunId) {
    console.log(`  Triage Run ID: ${summary.triageRunId}`);
  }
  console.log(`TRIAGE_SUMMARY=${JSON.stringify(summary)}`);
  process.exit(0);
} catch (err) {
  console.error(`[triage-cli] Erro durante a triagem:`, err);
  process.exit(1);
}
