import { withMonitoringDb } from "../src/monitoring-db.ts";
/**
 * Diagnóstico somente leitura da cobertura do acompanhamento.
 * Não consulta marketplaces nem chama um preço antigo de atual.
 * Uso: node --env-file=../web/.env.local --experimental-strip-types bin/monitoring-plan.ts
 */
import postgres from "postgres";
import {discoveryBudget,loadDiscoveryPolicy} from "../src/editorial-discovery.ts";
import { loadMonitoringCandidates,suppressedMonitoringIds } from "../src/monitoring-candidates.ts";
import {
  monitoringDecision,
  monitoringQueue,
  type MonitorMarketplace,
} from "../src/monitoring-policy.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definido");
const tenantId = process.env.MONITOR_TENANT_ID ?? "local";
const budget = Math.max(0, Math.floor(Number(process.env.MONITOR_PLAN_BUDGET ?? "20")));
if (!Number.isFinite(budget)) throw new Error("MONITOR_PLAN_BUDGET inválido");
const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

try {
  const candidates = await withMonitoringDb(sql,tenantId,tx=>loadMonitoringCandidates(tx,tenantId));
  const policies=await withMonitoringDb(sql,tenantId,async tx=>new Map(await Promise.all(['shopee','aliexpress'].map(async marketplace=>
    [marketplace,await loadDiscoveryPolicy(tx,tenantId,marketplace)] as const))));
  const suppression=await withMonitoringDb(sql,tenantId,async tx=>new Map(await Promise.all((['mercadolivre','shopee','aliexpress'] as const).map(async marketplace=>
    [marketplace,await suppressedMonitoringIds(tx,tenantId,marketplace,candidates)] as const))));
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
      const available=candidates.filter(c=>!suppression.get(marketplace)?.has(c.productId));
      const due=monitoringQueue(available,marketplace,budget,now),policy=policies.get(marketplace);
      const capacity=discoveryBudget(budget,due.filter(d=>d.tier==='watch').length,policy?.items_per_run ?? 0,policy?.enabled===true);
      const queue = monitoringQueue(available, marketplace, capacity.monitoring, now);
      return {
        marketplace,
        lane: marketplace === "mercadolivre" ? "human" : "api",
        catalog: decisions.length,suppressed:suppression.get(marketplace)?.size ?? 0,discoverySlots:capacity.discovery,
        tracked: decisions.filter((d) => d.targetHours !== null).length,
        due: decisions.filter((d) => d.due).length,
        watchedDue: decisions.filter((d) => d.due && d.tier === "watch").length,
        tiers: Object.fromEntries(["watch", "edition", "approved", "engaged", "formation", "candidate", "archive"].map((tier) =>
          [tier, { total: decisions.filter((d) => d.tier === tier).length,
            due: decisions.filter((d) => d.tier === tier && d.due).length }])),
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
