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

console.log(`[triage-cli] Iniciando triagem automatizada (limite: ${limit}, tenant: ${tenantId})...`);

try {
  const summary = await runPendingAutomatedTriage(tenantId, limit);
  console.log(`[triage-cli] Triagem concluída:`);
  console.log(`  Processados: ${summary.processed}`);
  console.log(`  Aprovados:   ${summary.approved}`);
  console.log(`  Em Espera:   ${summary.held}`);
  console.log(`  Rejeitados:  ${summary.rejected}`);
  console.log(`  Pendentes:   ${summary.annotatedPending}`);
  if (summary.triageRunId) {
    console.log(`  Triage Run ID: ${summary.triageRunId}`);
  }
  process.exit(0);
} catch (err) {
  console.error(`[triage-cli] Erro durante a triagem:`, err);
  process.exit(1);
}
