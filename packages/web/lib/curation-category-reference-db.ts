import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { DEFAULT_SCORE_WEIGHTS, validScoreWeights, type ScoreWeights } from "./curation-score-v2.ts";
import { scoreWeightsRevision } from "./curation-score-revision.ts";

/** Materialize one weekly distribution per account, store, category and price band. */
export async function refreshCategoryReferences(sql:Sql,tenantId:string,leaseOwner:string):Promise<boolean> {
  return withMonitoringDb(sql,tenantId,async tx=>{
    const [job]=await tx<{current_week:string;done:boolean}[]>`select
      date_trunc('week',now() at time zone 'America/Sao_Paulo')::date::text as current_week,
      category_reference_week=date_trunc('week',now() at time zone 'America/Sao_Paulo')::date as done
      from garimpa.curation_projection_job where tenant_id=${tenantId} and lease_owner=${leaseOwner}::uuid and lease_until>clock_timestamp()`;
    if(!job) throw new Error('category_reference_lease_lost');
    if(job.done) return false;
    await tx`select pg_advisory_xact_lock_shared(hashtextextended(${`curation-policy:${tenantId}`},0))`;
    const [policy]=await tx<{config:{scoreWeights?:ScoreWeights}}[]>`select config from garimpa.curation_policy_v2
      where tenant_id=${tenantId}`;
    const weights=policy?.config?.scoreWeights ?? DEFAULT_SCORE_WEIGHTS;
    if(!validScoreWeights(weights)) throw new Error('score_weights_invalid');
    const scoreVersion=scoreWeightsRevision(weights);
    await tx`with latest as materialized (
      select distinct on (p.id) p.id,p.marketplace,p.category,s.cohort->>'priceBand' as price_band,o.observed_at,
        s.components#>'{raw,discount,value}' as discount,s.components#>'{raw,historyCoverage,days}' as days,
        s.components#>'{raw,historyCoverage,spanDays}' as span
      from garimpa.curation_score_projection s join garimpa.product p on p.tenant_id=s.tenant_id and p.id=s.product_id
      join garimpa.price_observation o on o.tenant_id=s.tenant_id and o.product_id=s.product_id and o.id=s.observation_id
      left join garimpa.curation_attribute_assessment assessment on assessment.tenant_id=s.tenant_id
        and assessment.product_id=s.product_id and assessment.id=s.assessment_id
      where s.tenant_id=${tenantId} and p.category is not null and p.category<>'Geral' and p.category<>''
        and s.policy_version=${scoreVersion}
        and (s.assessment_id is null or (assessment.id is not null and assessment.last_curation_event_id is not distinct from
          (select event.id::text from garimpa.curation_event event where event.tenant_id=p.tenant_id and event.product_id=p.id order by event.id desc limit 1)))
        and not exists(select 1 from garimpa.product_curation c where c.tenant_id=p.tenant_id and c.product_id=p.id and c.status='rejected')
        and s.components#>>'{raw,discount,source}'='historico_comparavel'
        and jsonb_typeof(s.components#>'{raw,discount,value}')='number'
        and jsonb_typeof(s.components#>'{raw,historyCoverage,days}')='number'
        and jsonb_typeof(s.components#>'{raw,historyCoverage,spanDays}')='number'
        and s.calculated_at>=now()-interval '24 hours'
        and o.id=(select newest.id from garimpa.price_observation newest where newest.tenant_id=p.tenant_id and newest.product_id=p.id
          order by newest.observed_at desc,newest.id desc limit 1)
      order by p.id,s.calculated_at desc,s.option_key
    ), distributions as (
      select marketplace,category,price_band,count(*)::int as sample_size,
        percentile_cont(0.95) within group(order by (discount#>>'{}')::numeric) as p95,
        min((days#>>'{}')::integer) as min_days,min((span#>>'{}')::integer) as min_span,
        min(observed_at) as earliest,max(observed_at) as latest
      from latest where price_band in ('ate_50','50_a_200','acima_200')
      group by marketplace,category,price_band having count(*)>=20
    ) insert into garimpa.curation_category_reference(tenant_id,week_start,marketplace,category,price_band,
       sample_size,percentile_95,min_history_days,min_history_span_days,earliest_evidence,latest_evidence)
      select ${tenantId},${job.current_week}::date,marketplace,category,price_band,sample_size,p95,min_days,min_span,earliest,latest
      from distributions where min_days>=3 and min_span>=7 on conflict do nothing`;
    const [updated]=await tx<{tenant_id:string}[]>`update garimpa.curation_projection_job
      set category_reference_week=${job.current_week}::date where tenant_id=${tenantId} and lease_owner=${leaseOwner}::uuid
        and lease_until>clock_timestamp() returning tenant_id`;
    if(!updated) throw new Error('category_reference_lease_lost');
    return true;
  });
}
