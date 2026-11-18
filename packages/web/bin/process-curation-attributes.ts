/** Explicit worker invocation. It never runs a paid evaluation without --execute and a per-account daily cap. */
import { db } from "../lib/db.ts";
import { aiCurationProvider, aiCurationReadiness } from "../lib/ai-curation-provider.ts";
import { evaluateAttributeBatch } from "../lib/ai-curation-v2-service.ts";
import { claimAttributeJobs, enqueueAttributeDeltas, enqueueAttributePolicyRefresh, finishAttributeJob, reconcileAttributeJobs } from "../lib/curation-attributes-db.ts";

const args = process.argv.slice(2);
const flag = (name: string) => { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1]; };
const tenantId = flag("tenant");
const batchSize = Number(flag("limit") ?? "20");
if (!tenantId || !/^[a-z0-9._-]{1,64}$/.test(tenantId)) throw new Error("attributes_tenant_required");
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20) throw new Error("attributes_batch_invalid");
if (!args.includes("--execute")) throw new Error("attributes_execution_requires_execute");
const cap = Number(process.env.CURATION_ATTRIBUTE_DAILY_CALL_LIMIT);
if (!Number.isInteger(cap) || cap < 1 || cap > 1000) throw new Error("attributes_daily_budget_required");
const readiness = aiCurationReadiness();
if (!readiness.ready) throw new Error(readiness.error ?? "ai_curation_not_configured");
const provider = aiCurationProvider();
const model = provider === "openrouter" ? process.env.AI_CURATION_MODEL : process.env.GEMINI_MODEL || "gemini-2.5-flash";
if (!model) throw new Error("attributes_model_required");

const sql = db();
try {
  await enqueueAttributePolicyRefresh(sql, tenantId, `${provider}:${model}`);
  const queued = await enqueueAttributeDeltas(sql, tenantId, `${provider}:${model}`);
  const jobs = await claimAttributeJobs(sql, tenantId, batchSize, cap, `${provider}:${model}`);
  if (!jobs.length) {
    console.log(JSON.stringify({ tenantId, queued, claimed: 0 }));
  } else {
    try {
      const results = await evaluateAttributeBatch(jobs.map(job => job.snapshot.input));
      const byId = new Map(results.map(result => [result.productId, result]));
      let completed = 0, superseded = 0;
      for (const job of jobs) {
        const result = byId.get(job.snapshot.input.productId);
        if (!result) throw new Error("attributes_batch_incomplete");
        if (await finishAttributeJob(sql, tenantId, job, result) === "completed") completed++; else superseded++;
      }
      console.log(JSON.stringify({ tenantId, queued, claimed: jobs.length, completed, superseded }));
    } catch {
      // A timeout, rejected response or partial database failure may have incurred cost.
      await reconcileAttributeJobs(sql, tenantId, jobs);
      console.error(JSON.stringify({ tenantId, error: "attributes_result_unconfirmed", claimed: jobs.length }));
      process.exitCode = 1;
    }
  }
} finally { await sql.end(); }
