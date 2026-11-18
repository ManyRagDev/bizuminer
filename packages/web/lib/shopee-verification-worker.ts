import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { resolveWorkerCredential } from "../../persistence/src/account-credentials.ts";
import { MonitoringLookup } from "../../persistence/src/monitoring-lookup.ts";
import { PostgresStore } from "../../persistence/src/pg-store.ts";
import { categoryForTitle } from "../../persistence/src/category.ts";
import { familyInfoForTitle } from "../../persistence/src/product-family.ts";
import { isCaptureError } from "../../capture/src/errors.ts";
import { shopeeVerificationTenantEnabled } from "./flags.ts";

type Claim = { attemptId:string; productId:string; externalId:string; tokenHash:string };

/** One account-scoped, quota-reserved lookup. Never invoked by a public read. */
export async function runShopeeVerification(sql:Sql, tenantId:string):Promise<Date | null> {
  if (!shopeeVerificationTenantEnabled(tenantId)) return null;
  const limit=Number(process.env.SHOPEE_LOOKUP_DAILY_LIMIT);
  if (!Number.isSafeInteger(limit) || limit<1 || limit>100_000) throw new Error("shopee_lookup_budget_required");
  if (!process.env.DATABASE_URL) throw new Error("database_url_required");
  // Check credentials before reserving quota, and resolve again immediately
  // before the effect so account suspension is respected.
  const credentialReady=await resolveWorkerCredential(sql,tenantId,"shopee").then(()=>true,()=>false);
  const tokenHash=createHash("sha256").update(randomUUID()).digest("hex");
  const claim=await withMonitoringDb(sql,tenantId,async tx=>{
    await tx`select pg_advisory_xact_lock(hashtextextended(${`shopee-verification:${tenantId}`},0))`;
    const expired=await tx<{claim_token_hash:string;capture_run_id:string|null;state:string}[]>`update garimpa.shopee_lookup_attempt a
      set state=case when exists(select 1 from garimpa.price_observation o where o.tenant_id=a.tenant_id
          and o.product_id=a.product_id and o.capture_run_id=a.capture_run_id and o.offer_evidence->>'observationMethod'='id_lookup')
        then 'observed' else 'uncertain' end,finished_at=now(),result_code='lease_reconciled'
      where a.tenant_id=${tenantId} and a.state='reserved' and a.lease_until<=now() returning a.claim_token_hash,a.capture_run_id,a.state`;
    for(const old of expired) await tx`update garimpa.curation_promotion p set
      status=case when match.id is null then 'pending' else 'confirmed' end,result_observation_id=match.id,
      device_id=null,claim_token_hash=null,lease_until=null,
      next_attempt_at=now()+case when match.id is null and ${old.state}='observed' then interval '24 hours' else interval '1 hour' end,updated_at=now(),
      result=jsonb_build_object('reason',case when match.id is not null then 'observed_recovered'
        when ${old.state}='observed' then 'configuration_mismatch' else 'lookup_outcome_unknown' end)
      from (select p2.id,(select o.id from garimpa.price_observation o where o.tenant_id=p2.tenant_id and o.product_id=p2.product_id
        and o.capture_run_id=${old.capture_run_id} and o.option_key=p2.option_key and o.offer_evidence->>'priceType'=p2.price_type
        and o.offer_evidence->>'observationMethod'='id_lookup'
        and now()<garimpa.current_offer_valid_until(o.tenant_id,o.product_id,o.id)
        and o.id=(select latest.id from garimpa.price_observation latest where latest.tenant_id=o.tenant_id
          and latest.product_id=o.product_id and latest.option_key=o.option_key order by latest.observed_at desc,latest.id desc limit 1)
        limit 1) as observation_id
        from garimpa.curation_promotion p2 where p2.tenant_id=${tenantId} and p2.status='claimed'
          and p2.claim_token_hash=${old.claim_token_hash}) picked
      left join garimpa.price_observation match on match.id=picked.observation_id and match.tenant_id=${tenantId}
      where p.id=picked.id and p.tenant_id=${tenantId} and p.status='claimed' and p.claim_token_hash=${old.claim_token_hash}`;
    await tx`update garimpa.curation_promotion set status='expired',updated_at=now()
      where tenant_id=${tenantId} and status='pending' and deadline<=now()`;
    if(!credentialReady) return null;
    const [busy]=await tx`select id from garimpa.shopee_lookup_attempt where tenant_id=${tenantId} and state='reserved'`;
    if(busy) return null;
    await tx`insert into garimpa.curation_external_budget(tenant_id,local_day,kind,marketplace)
      values(${tenantId},(now() at time zone 'America/Sao_Paulo')::date,'shopee','shopee') on conflict do nothing`;
    const [budget]=await tx<{consumed:number;watch_consumed:number}[]>`select consumed,watch_consumed from garimpa.curation_external_budget
      where tenant_id=${tenantId} and local_day=(now() at time zone 'America/Sao_Paulo')::date
        and kind='shopee' and marketplace='shopee' for update`;
    if(!budget || budget.consumed>=limit) return null;
    const watchPriority=limit-budget.consumed<=Math.max(0,Math.ceil(limit/4)-budget.watch_consumed) || budget.consumed%4===0;
    const [candidate]=await tx<{product_id:string;external_id:string}[]>`select p.product_id,product.external_id
      from garimpa.curation_promotion p join garimpa.product product on product.tenant_id=p.tenant_id and product.id=p.product_id
      where p.tenant_id=${tenantId} and product.marketplace='shopee' and p.status='pending' and p.deadline>now()
        and (p.result->>'reason' is distinct from 'auth' or exists(select 1 from garimpa.affiliate_secret secret
          where secret.tenant_id=p.tenant_id and secret.marketplace='shopee' and secret.status='active'
            and secret.updated_at>coalesce((p.result->>'credentialFailedAt')::timestamptz,'infinity'::timestamptz)))
        and p.next_attempt_at<=now() and (p.reason='watch' or not exists(select 1 from garimpa.product_curation c
          where c.tenant_id=p.tenant_id and c.product_id=p.product_id and c.status='rejected')
        ) and (p.reason<>'watch' or exists(select 1 from garimpa.monitoring_interest_options(${tenantId}) w
          where w.product_id=p.product_id and coalesce(w.option_key,'listing')=p.option_key and w.active_watches>0))
        and p.requested_observation_id=(select o.id from garimpa.price_observation o
          where o.tenant_id=p.tenant_id and o.product_id=p.product_id and o.option_key=p.option_key
          order by o.observed_at desc,o.id desc limit 1)
        and (p.reason='watch' or exists(select 1 from garimpa.curation_policy_v2 policy
          join garimpa.curation_score_projection score on score.tenant_id=policy.tenant_id and score.product_id=p.product_id
            and score.option_key=p.option_key and score.observation_id=p.requested_observation_id and score.source_revision=p.requested_revision
          join garimpa.curation_attribute_assessment assessment on assessment.tenant_id=score.tenant_id
            and assessment.product_id=score.product_id and assessment.id=score.assessment_id
          where policy.tenant_id=p.tenant_id and policy.enabled and policy.version=p.policy_version
            and assessment.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
              where event.tenant_id=p.tenant_id and event.product_id=p.product_id order by event.id desc limit 1)
            and garimpa.has_current_curation_assessment(p.tenant_id,p.product_id,p.requested_observation_id)
            and not (coalesce(assessment.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
            and not garimpa.equivalent_human_veto(p.tenant_id,p.product_id,p.requested_observation_id)))
      order by case when ${watchPriority}=(p.reason='watch') then 0 else 1 end,p.priority desc,p.deadline,p.id limit 1 for update of p skip locked`;
    if(!candidate) return null;
    const attemptId=randomUUID();
    await tx`insert into garimpa.shopee_lookup_attempt(id,tenant_id,product_id,claim_token_hash,lease_until)
      values(${attemptId}::uuid,${tenantId},${candidate.product_id},${tokenHash},now()+interval '3 minutes')`;
    const claimed=await tx<{reason:string}[]>`update garimpa.curation_promotion set status='claimed',claim_token_hash=${tokenHash},
      lease_until=now()+interval '3 minutes',attempts=attempts+1,updated_at=now()
      where tenant_id=${tenantId} and product_id=${candidate.product_id} and status='pending'
        and next_attempt_at<=now() and deadline>now()
        and (result->>'reason' is distinct from 'auth' or exists(select 1 from garimpa.affiliate_secret secret
          where secret.tenant_id=curation_promotion.tenant_id and secret.marketplace='shopee' and secret.status='active'
            and secret.updated_at>coalesce((curation_promotion.result->>'credentialFailedAt')::timestamptz,'infinity'::timestamptz)))
        and (reason<>'watch' or exists(select 1 from garimpa.monitoring_interest_options(${tenantId}) w
          where w.product_id=curation_promotion.product_id and coalesce(w.option_key,'listing')=curation_promotion.option_key and w.active_watches>0))
        and (reason='watch' or not exists(select 1 from garimpa.product_curation c
          where c.tenant_id=curation_promotion.tenant_id and c.product_id=curation_promotion.product_id and c.status='rejected'))
        and requested_observation_id=(select o.id from garimpa.price_observation o
          where o.tenant_id=curation_promotion.tenant_id and o.product_id=curation_promotion.product_id
            and o.option_key=curation_promotion.option_key order by o.observed_at desc,o.id desc limit 1)
        and (reason='watch' or exists(select 1 from garimpa.curation_policy_v2 policy
          join garimpa.curation_score_projection score on score.tenant_id=policy.tenant_id and score.product_id=curation_promotion.product_id
            and score.option_key=curation_promotion.option_key and score.observation_id=curation_promotion.requested_observation_id
            and score.source_revision=curation_promotion.requested_revision
          join garimpa.curation_attribute_assessment assessment on assessment.tenant_id=score.tenant_id
            and assessment.product_id=score.product_id and assessment.id=score.assessment_id
          where policy.tenant_id=curation_promotion.tenant_id and policy.enabled and policy.version=curation_promotion.policy_version
            and assessment.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
              where event.tenant_id=curation_promotion.tenant_id and event.product_id=curation_promotion.product_id order by event.id desc limit 1)
            and garimpa.has_current_curation_assessment(curation_promotion.tenant_id,curation_promotion.product_id,curation_promotion.requested_observation_id)
            and not (coalesce(assessment.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
            and not garimpa.equivalent_human_veto(curation_promotion.tenant_id,curation_promotion.product_id,curation_promotion.requested_observation_id))) returning reason`;
    if(!claimed.length) throw new Error('shopee_claim_changed');
    await tx`update garimpa.curation_external_budget set consumed=consumed+1,
      watch_consumed=watch_consumed+${claimed.some(row=>row.reason==='watch') ? 1 : 0} where tenant_id=${tenantId}
      and local_day=(now() at time zone 'America/Sao_Paulo')::date and kind='shopee' and marketplace='shopee'`;
    return {attemptId,productId:candidate.product_id,externalId:candidate.external_id,tokenHash} satisfies Claim;
  });
  if (!claim) return withMonitoringDb(sql,tenantId,async tx=>{
    const [schedule]=await tx<{due:Date|null}[]>`select least(
      (select min(a.lease_until) from garimpa.shopee_lookup_attempt a where a.tenant_id=${tenantId} and a.state='reserved'),
      (select case when coalesce((select b.consumed from garimpa.curation_external_budget b
        where b.tenant_id=${tenantId} and b.local_day=(now() at time zone 'America/Sao_Paulo')::date
          and b.kind='shopee' and b.marketplace='shopee'),0)>=${limit}
        then (((now() at time zone 'America/Sao_Paulo')::date+1)::timestamp at time zone 'America/Sao_Paulo')
        else greatest(now()+interval '1 minute',min(p.next_attempt_at)) end
        from garimpa.curation_promotion p join garimpa.product product on product.tenant_id=p.tenant_id and product.id=p.product_id
        where p.tenant_id=${tenantId} and product.marketplace='shopee' and p.status='pending' and p.deadline>now()
          and (p.result->>'reason' is distinct from 'auth' or exists(select 1 from garimpa.affiliate_secret secret
            where secret.tenant_id=p.tenant_id and secret.marketplace='shopee' and secret.status='active'
              and secret.updated_at>coalesce((p.result->>'credentialFailedAt')::timestamptz,'infinity'::timestamptz)))
          and p.requested_observation_id=(select o.id from garimpa.price_observation o
            where o.tenant_id=p.tenant_id and o.product_id=p.product_id and o.option_key=p.option_key
            order by o.observed_at desc,o.id desc limit 1)
          and (p.reason='watch' or exists(select 1 from garimpa.curation_policy_v2 policy
            join garimpa.curation_score_projection score on score.tenant_id=policy.tenant_id and score.product_id=p.product_id
              and score.option_key=p.option_key and score.observation_id=p.requested_observation_id and score.source_revision=p.requested_revision
            join garimpa.curation_attribute_assessment assessment on assessment.tenant_id=score.tenant_id
              and assessment.product_id=score.product_id and assessment.id=score.assessment_id
            where policy.tenant_id=p.tenant_id and policy.enabled and policy.version=p.policy_version
              and assessment.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
                where event.tenant_id=p.tenant_id and event.product_id=p.product_id order by event.id desc limit 1)
              and garimpa.has_current_curation_assessment(p.tenant_id,p.product_id,p.requested_observation_id)
              and not (coalesce(assessment.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
              and not garimpa.equivalent_human_veto(p.tenant_id,p.product_id,p.requested_observation_id)))
          and (p.reason='watch' or not exists(select 1 from garimpa.product_curation c
            where c.tenant_id=p.tenant_id and c.product_id=p.product_id and c.status='rejected'))
          and (p.reason<>'watch' or exists(select 1 from garimpa.monitoring_interest_options(${tenantId}) w
            where w.product_id=p.product_id and coalesce(w.option_key,'listing')=p.option_key and w.active_watches>0))
        having count(*)>0)) as due`;
    return schedule?.due ? new Date(Math.max(+new Date(schedule.due),credentialReady ? 0 : Date.now()+300_000)) : null;
  });

  const store=new PostgresStore({connectionString:process.env.DATABASE_URL,maxConnections:1});
  let runId:string | null=null;
  let outcome:"observed"|"absent"|"failed"="failed", resultCode="lookup_failed";
  let retryDelayMs=3_600_000;
  try {
    runId=await store.startCaptureRun({tenantId,marketplace:"shopee",startedAt:new Date(),
      collectorRunId:`verification-${claim.attemptId}`,parameters:{captureMode:"verification",attemptId:claim.attemptId}});
    await withMonitoringDb(sql,tenantId,async tx=>{await tx`update garimpa.shopee_lookup_attempt set capture_run_id=${runId}
      where tenant_id=${tenantId} and id=${claim.attemptId}::uuid and state='reserved' and claim_token_hash=${claim.tokenHash}`;});
    const credential=await resolveWorkerCredential(sql,tenantId,"shopee");
    // The reserved quota represents exactly one transport attempt.
    const result=await new MonitoringLookup({maxAttempts:1}).byIdDetailed(credential,claim.externalId,
      {runId,log:()=>{}});
    if(result.offer) {
      const offer=result.offer;
      await store.upsertProductWithObservation({captureRunId:runId,tenantId,marketplace:"shopee",
        externalId:offer.externalId,title:offer.title,productUrl:offer.productUrl,imageUrl:offer.imageUrl,
        category:categoryForTitle(offer.title),family:familyInfoForTitle(offer.title),priceCents:offer.priceCents,
        originalPriceCents:offer.originalPriceCents,claimedDiscountRate:offer.claimedDiscountRate,ratingStar:offer.ratingStar,
        salesLabel:offer.salesLabel,salesCount:offer.salesCount,observedAt:offer.capturedAt,offerEvidence:offer.offerEvidence});
      await store.finishCaptureRun(runId,{tenantId,finishedAt:new Date(),status:"ok",itemsCaptured:1,itemsNew:0,priceChanges:0});
      outcome="observed";resultCode="observed";
    } else {
      outcome="absent";resultCode=result.reason;
      await store.finishCaptureRun(runId,{tenantId,finishedAt:new Date(),status:"ok",itemsCaptured:0,itemsNew:0,priceChanges:0});
    }
  } catch (error) {
    if(isCaptureError(error)) {
      resultCode=error.kind;
      if(error.kind==="auth") retryDelayMs=0; // A changed credential, not a timer, reopens this request.
      if(typeof error.retryAfterMs==="number" && Number.isFinite(error.retryAfterMs) && error.retryAfterMs>0)
        retryDelayMs=Math.max(retryDelayMs,error.retryAfterMs);
    }
    if(runId) await store.finishCaptureRun(runId,{tenantId,finishedAt:new Date(),status:"error",itemsCaptured:0,itemsNew:0,
      priceChanges:0,error:"verification_failed"}).catch(()=>{});
  } finally { await store.close(); }

  const retryAt=new Date(Math.min(8_640_000_000_000_000,Date.now()+retryDelayMs));
  await withMonitoringDb(sql,tenantId,async tx=>{
    const [owned]=await tx<{id:string}[]>`update garimpa.shopee_lookup_attempt set state=${outcome},result_code=${resultCode},finished_at=now()
      where tenant_id=${tenantId} and id=${claim.attemptId}::uuid and state='reserved'
        and claim_token_hash=${claim.tokenHash} and lease_until>now() returning id`;
    if(!owned) return;
    // A response for a listing or range does not confirm another variant.
    await tx`update garimpa.curation_promotion p set
      status=case when o.id is not null then 'confirmed' else 'pending' end,
      result_observation_id=o.id, result=jsonb_build_object('reason',case when o.id is not null then 'observed'
        when ${outcome}='observed' then 'configuration_mismatch' else ${resultCode} end)
        || case when o.id is null and ${resultCode}='auth' then jsonb_build_object('credentialFailedAt',statement_timestamp()) else '{}'::jsonb end,
      claim_token_hash=null,lease_until=null,device_id=null,
      next_attempt_at=case when o.id is null and ${outcome}='observed' then now()+interval '24 hours' else ${retryAt} end,updated_at=now()
      from (select p2.id,(select ob.id from garimpa.price_observation ob
        where ob.tenant_id=p2.tenant_id and ob.product_id=p2.product_id and ob.capture_run_id=${runId}
          and ob.option_key=p2.option_key and ob.offer_evidence->>'priceType'=p2.price_type
          and ob.offer_evidence->>'observationMethod'='id_lookup'
          and now()<garimpa.current_offer_valid_until(ob.tenant_id,ob.product_id,ob.id)
          and ob.id=(select latest.id from garimpa.price_observation latest where latest.tenant_id=ob.tenant_id
            and latest.product_id=ob.product_id and latest.option_key=ob.option_key order by latest.observed_at desc,latest.id desc limit 1)
          limit 1) as id_observation
        from garimpa.curation_promotion p2 where p2.tenant_id=${tenantId} and p2.claim_token_hash=${claim.tokenHash}
          and p2.status='claimed') picked
      left join garimpa.price_observation o on o.id=picked.id_observation and o.tenant_id=${tenantId}
      where p.id=picked.id and p.tenant_id=${tenantId} and p.status='claimed' and p.claim_token_hash=${claim.tokenHash}`;
  });
  return new Date(Date.now()+1000);
}
