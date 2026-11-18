import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import type { SelectionCandidate } from "./curation-selection-v2.ts";

/** Creates bounded, deduplicated factual work without calling a marketplace. */
export async function requestPromotionChecks(sql: Sql, tenantId: string, candidates: readonly SelectionCandidate[], policyVersion: number, now = new Date(),projectionOwner?:string) {
  if (!Number.isInteger(policyVersion) || policyVersion < 1 || candidates.length > 100 || !Number.isFinite(now.getTime()))
    throw new Error("promotion_request_invalid");
  const unique = new Map(candidates.map(candidate => [candidate.id, candidate]));
  if (unique.size !== candidates.length) throw new Error("promotion_duplicate_product");
  return withMonitoringDb(sql, tenantId, async tx => {
    const fence=async()=>{
      if(!projectionOwner) return;
      const [lease]=await tx<{valid:boolean}[]>`select lease_until>clock_timestamp() as valid from garimpa.curation_projection_job
        where tenant_id=${tenantId} and lease_owner=${projectionOwner}::uuid for update`;
      if(!lease?.valid) throw new Error('curation_projection_lease_lost');
    };
    await tx`select pg_advisory_xact_lock_shared(hashtextextended(${`curation-policy:${tenantId}`},0))`;
    const [policy]=await tx<{version:number;enabled:boolean}[]>`select version,enabled from garimpa.curation_policy_v2
      where tenant_id=${tenantId}`;
    if(!policy?.enabled || policy.version!==policyVersion) return 0;
    await tx`update garimpa.curation_promotion set status='expired',updated_at=now()
      where tenant_id=${tenantId} and status in ('pending','claimed') and deadline<=${now}`;
    await tx`update garimpa.curation_promotion set status='cancelled',result=${tx.json({reason:'policy_changed'})},updated_at=now()
      where tenant_id=${tenantId} and reason='promotion' and status='pending' and policy_version<>${policyVersion}`;
    const input = candidates.map(candidate => ({ product_id:candidate.id,option_key:candidate.optionKey,price_type:candidate.priceType,
      observation_id:candidate.observationId,revision:candidate.revision,priority:candidate.potentialScore }));
    // Pending work is a request to check a current finalist, not a durable
    // entitlement to a future slot. A request already claimed is left for
    // its owner to report; the later competition still decides admission.
    await tx`update garimpa.curation_promotion p set status='cancelled',result=${tx.json({reason:'no_longer_finalist'})},updated_at=now()
      where p.tenant_id=${tenantId} and p.reason='promotion' and p.status='pending'
        and not exists(select 1 from jsonb_to_recordset(${tx.json(input as any)}::jsonb)
          x(product_id text,option_key text,price_type text) where x.product_id=p.product_id
          and x.option_key=p.option_key and x.price_type=p.price_type)`;
    if (!candidates.length) {await fence();return 0;}
    const saved = await tx<{id:string}[]>`insert into garimpa.curation_promotion
      (tenant_id,product_id,option_key,price_type,requested_observation_id,requested_revision,policy_version,reason,priority,deadline,next_attempt_at)
      select ${tenantId},x.product_id,x.option_key,x.price_type,x.observation_id,x.revision,${policyVersion},'promotion',x.priority,
        ${new Date(now.getTime()+24*3_600_000)},${now}
      from jsonb_to_recordset(${tx.json(input as any)}::jsonb) x(product_id text,option_key text,price_type text,observation_id text,revision text,priority numeric)
      join garimpa.product p on p.tenant_id=${tenantId} and p.id=x.product_id
      join garimpa.price_observation o on o.id=x.observation_id and o.tenant_id=p.tenant_id and o.product_id=p.id
        and o.option_key=x.option_key and o.offer_evidence->>'priceType'=x.price_type
      join garimpa.curation_score_projection s on s.tenant_id=p.tenant_id and s.product_id=p.id and s.option_key=x.option_key
        and s.observation_id=o.id and s.source_revision=x.revision
      join garimpa.curation_attribute_assessment a on a.tenant_id=p.tenant_id and a.product_id=p.id and a.id=s.assessment_id
      where x.priority between 0 and 100 and a.last_curation_event_id is not distinct from
        (select event.id::text from garimpa.curation_event event where event.tenant_id=p.tenant_id and event.product_id=p.id order by event.id desc limit 1)
        and not exists(select 1 from garimpa.product_curation c where c.tenant_id=p.tenant_id and c.product_id=p.id and c.status='rejected')
        -- An expired recovery window cannot be renewed for the same fact by
        -- a score refresh or a policy revision. A new observation may enter
        -- a new contest and receive its own bounded recovery window.
        and not exists(select 1 from garimpa.curation_promotion expired
          where expired.tenant_id=p.tenant_id and expired.product_id=p.id and expired.option_key=x.option_key
            and expired.price_type=x.price_type and expired.reason='promotion' and expired.status='expired'
            and expired.requested_observation_id=x.observation_id)
        and o.id=(select latest.id from garimpa.price_observation latest where latest.tenant_id=p.tenant_id and latest.product_id=p.id
          and latest.option_key=x.option_key order by latest.observed_at desc,latest.id desc limit 1)
      on conflict(tenant_id,product_id,option_key,price_type,reason) where status in ('pending','claimed') do update
        set priority=excluded.priority,requested_observation_id=excluded.requested_observation_id,
            requested_revision=excluded.requested_revision,policy_version=excluded.policy_version,
            deadline=case when garimpa.curation_promotion.requested_observation_id is distinct from excluded.requested_observation_id
              then excluded.deadline else garimpa.curation_promotion.deadline end,
            next_attempt_at=case when garimpa.curation_promotion.requested_observation_id is distinct from excluded.requested_observation_id
              then excluded.next_attempt_at else garimpa.curation_promotion.next_attempt_at end,
            updated_at=now()
        where garimpa.curation_promotion.status='pending' returning id`;
    await fence();
    return saved.length;
  });
}
