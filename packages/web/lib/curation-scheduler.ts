import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import type { db } from "./db.ts";
import { enqueueAttributeDeltasBatch, enqueueAttributePolicyRefresh } from "./curation-attributes-db.ts";
import { recomputeCurationScores } from "./curation-score-db.ts";
import { planCurationPromotions } from "./curation-promotion-planner.ts";
import { refreshRecapturePlan } from "./recapture-planner.ts";
import { refreshCurationExceptions } from "./curation-exceptions-db.ts";
import { reconsiderLegacyLowMerit } from "./curation-reconsideration-db.ts";
import { advanceCurationEligibility } from "./curation-eligibility-db.ts";
import { refreshCategoryReferences } from "./curation-category-reference-db.ts";
import { recaptureTenantEnabled } from "./flags.ts";
import { prepareCurationPublications } from "./curation-publications.ts";

/** Claims persisted work; no external source, model call or customer action. */
export async function runCurationProjectionJob(sql: Sql, tenantId: string, model: string, sqlFactory?: typeof db): Promise<Date> {
  const owner = randomUUID();
  const claim = await withMonitoringDb(sql, tenantId, async tx => {
    await tx`insert into garimpa.curation_projection_job(tenant_id) values(${tenantId}) on conflict do nothing`;
    const [row] = await tx<{claimed_revision:string}[]>`update garimpa.curation_projection_job
      set lease_owner=${owner}::uuid,lease_until=now()+interval '10 minutes',claimed_revision=dirty_revision
      where tenant_id=${tenantId} and next_due_at<=now() and (lease_until is null or lease_until<now())
      returning claimed_revision::text`;
    return row ?? null;
  });
  if (claim) {
    try {
      const reconsidered = process.env.CURATION_RECONSIDER_LEGACY_ENABLED === "true"
        ? await reconsiderLegacyLowMerit(sql,tenantId,50,owner) : 0;
      const backfill = await enqueueAttributePolicyRefresh(sql, tenantId, model,100,owner);
      const deltas = await enqueueAttributeDeltasBatch(sql, tenantId, model,100,owner);
      const eligible = await advanceCurationEligibility(sql,tenantId,model,owner);
      await prepareCurationPublications(sql,tenantId);
      let score = await recomputeCurationScores(sql, tenantId, model,new Date(),owner);
      // Do not freeze a weekly category sample from an incomplete projection:
      // concurrent facts or unfinished batches must be incorporated first.
      const categoryReferenceUpdated = score.candidates>0 && score.written===score.candidates
        && deltas.processed<100 && backfill<100 && !eligible.more
        ? await refreshCategoryReferences(sql,tenantId,owner) : false;
      if (categoryReferenceUpdated) score = await recomputeCurationScores(sql,tenantId,model,new Date(),owner);
      const promotions=await planCurationPromotions(sql, tenantId,new Date(),owner);
      await refreshCurationExceptions(sql,tenantId,owner);
      if (promotions.enabled) {
        const { refreshRecommendationEditions } = await import("./recommendation-db.ts");
        await refreshRecommendationEditions(tenantId,sqlFactory,false,new Date(),owner);
      }
      if (process.env.RECAPTURE_PLANNER_ENABLED === "true" && recaptureTenantEnabled(tenantId)) await refreshRecapturePlan(sql, tenantId,new Date(),owner);
      const needsAnother = reconsidered >= 50 || deltas.processed >= 100 || backfill >= 100 || eligible.more || score.written !== score.candidates;
      await withMonitoringDb(sql, tenantId, async tx => {
        await tx`update garimpa.curation_projection_job set lease_owner=null,lease_until=null,last_error=null,last_completed_at=now(),
          next_due_at=case when dirty_revision>claimed_revision or ${needsAnother} then now()
            else now()+${promotions.nextIntervalMs}*interval '1 millisecond' end
          where tenant_id=${tenantId} and lease_owner=${owner}::uuid`;
      });
    } catch {
      await withMonitoringDb(sql, tenantId, async tx => {
        await tx`update garimpa.curation_projection_job set lease_owner=null,lease_until=null,
          last_error='projection_failed',next_due_at=now()+interval '60 seconds'
          where tenant_id=${tenantId} and lease_owner=${owner}::uuid`;
      }).catch(() => {});
      throw new Error("curation_projection_failed");
    }
  }
  return withMonitoringDb(sql, tenantId, async tx => {
    const [row] = await tx<{next_due:Date|string}[]>`select greatest(next_due_at,coalesce(lease_until,next_due_at)) as next_due
      from garimpa.curation_projection_job where tenant_id=${tenantId}`;
    return new Date(row?.next_due ?? Date.now()+60_000);
  });
}
