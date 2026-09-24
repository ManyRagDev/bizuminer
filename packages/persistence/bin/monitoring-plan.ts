/**
 * Diagnóstico somente leitura da cobertura do acompanhamento.
 * Não consulta marketplaces nem chama um preço antigo de atual.
 * Uso: node --env-file=../web/.env.local --experimental-strip-types bin/monitoring-plan.ts
 */
import postgres from "postgres";
import { loadMonitoringCandidates } from "../src/monitoring-candidates.ts";
import {
  monitoringDecision,
  monitoringQueue,
  type MonitoringCandidate,
  type MonitorMarketplace,
} from "../src/monitoring-policy.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definido");
const tenantId = process.env.MONITOR_TENANT_ID ?? "local";
const budget = Math.max(0, Math.floor(Number(process.env.MONITOR_PLAN_BUDGET ?? "50")));
if (!Number.isFinite(budget)) throw new Error("MONITOR_PLAN_BUDGET inválido");
const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

try {
  const candidates: MonitoringCandidate[] = await loadMonitoringCandidates(sql, tenantId);
  const now = new Date();
  const marketplaces: MonitorMarketplace[] = ["mercadolivre", "shopee", "aliexpress"];
  const report = {
    generatedAt: now.toISOString(),
    tenantId,
    policy: "monitoring-v1",
    budgetPerMarketplace: budget,
    marketplaces: marketplaces.map((marketplace) => {
      const decisions = candidates.filter((candidate) => candidate.marketplace === marketplace)
        .map((candidate) => monitoringDecision(candidate, now));
      const queue = monitoringQueue(candidates, marketplace, budget, now);
      return {
        marketplace,
        lane: marketplace === "mercadolivre" ? "human" : "api",
        catalog: decisions.length,
        tracked: decisions.filter((d) => d.targetHours !== null).length,
        due: decisions.filter((d) => d.due).length,
        watchedDue: decisions.filter((d) => d.due && d.tier === "watch").length,
        selected: queue.length,
        oldestOverdueHours: Math.round(Math.max(0, ...queue.map((d) => d.overdueHours))),
        selectedPreviewIds: queue.slice(0, 5).map((d) => d.productId),
      };
    }),
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end();
}
