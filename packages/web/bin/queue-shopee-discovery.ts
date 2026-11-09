import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { resolveWorkerCredential } from "../../persistence/src/account-credentials.ts";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { monitoringScheduleDecision, recordMonitoringSkip } from "../../persistence/src/monitoring-schedule.ts";
import { captureBatches } from "../lib/capture-batch-db.ts";
import { inAccountScope } from "../lib/account-scope.ts";

// Scheduled discovery belongs to the house. Other accounts are never enumerated.
const tenantId = "local";
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ mode: "dry-run", tenantId, marketplace: "shopee", plan: "departments", pages: 2, pageSize: 20, departments: 12 }));
} else {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1,
    ssl: process.env.DATABASE_URL!.includes("localhost") ? false : { rejectUnauthorized: false } });
  try {
    const decision = await withMonitoringDb(sql, tenantId, tx =>
      monitoringScheduleDecision(tx, tenantId, "shopee", process.env.GITHUB_EVENT_NAME));
    if (!decision.allowed) {
      if (decision.affiliateId && decision.reason && process.env.GITHUB_RUN_ID) {
        await withMonitoringDb(sql, tenantId, tx => recordMonitoringSkip(tx, decision.affiliateId!, "shopee", process.env.GITHUB_RUN_ID!, decision.reason!));
      }
      console.log(JSON.stringify({ skipped: decision.reason }));
    } else {
      await resolveWorkerCredential(sql, tenantId, "shopee");
      if (!decision.affiliateId) throw new Error("account_unavailable");
      await inAccountScope({ tenantId, affiliateId: decision.affiliateId, actor: "worker",
        actorAppUserId: null, authenticatedAuthUserId: null, membershipRole: null, requestId: randomUUID() }, async () => {
        try {
          const batch = await captureBatches.create(tenantId, ["shopee"], 2, "github", false);
          if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `batch_id=${batch.id}\n`);
          console.log(JSON.stringify({ batchId: batch.id, tenantId, pages: 2 }));
        } catch (error) {
          if ((error as { code?: string; constraint_name?: string }).code === "23505"
            && (error as { constraint_name?: string }).constraint_name === "uq_capture_batch_one_running_per_tenant") {
            console.log(JSON.stringify({ skipped: "capture_already_running" }));
          } else throw error;
        }
      });
    }
  } finally { await sql.end(); }
}
