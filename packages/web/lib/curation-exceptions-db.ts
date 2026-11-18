import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { db } from "./db.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import { DEFAULT_SCORE_WEIGHTS, validScoreWeights, type ScoreWeights } from "./curation-score-v2.ts";
import { scoreWeightsRevision } from "./curation-score-revision.ts";

/** A bounded advisory queue; it never approves or rejects a product. */
export async function refreshCurationExceptions(sql:Sql,tenantId:string,projectionOwner?:string) {
  return withMonitoringDb(sql,tenantId,async tx=>{
    const fence=async()=>{
      if(!projectionOwner) return;
      const [lease]=await tx<{valid:boolean}[]>`select lease_until>clock_timestamp() as valid from garimpa.curation_projection_job
        where tenant_id=${tenantId} and lease_owner=${projectionOwner}::uuid for update`;
      if(!lease?.valid) throw new Error('curation_projection_lease_lost');
    };
    await tx`select pg_advisory_xact_lock(hashtextextended(${`curation-exceptions:${tenantId}`},0))`;
    await tx`select pg_advisory_xact_lock_shared(hashtextextended(${`curation-policy:${tenantId}`},0))`;
    const [policy]=await tx<{enabled:boolean;config:{capacity?:number;scoreWeights?:ScoreWeights}}[]>`select enabled,config from garimpa.curation_policy_v2
      where tenant_id=${tenantId}`;
    const capacity=Number(policy?.config?.capacity ?? 24);
    if(!policy?.enabled || !Number.isInteger(capacity) || capacity<1 || capacity>24) {
      await tx`update garimpa.curation_exception set status='irrelevant',closed_at=now(),close_reason='policy_inactive'
        where tenant_id=${tenantId} and status='open'`;
      await fence();return {opened:0,open:0};
    }
    const weights=policy.config.scoreWeights ?? DEFAULT_SCORE_WEIGHTS;
    if(!validScoreWeights(weights)) throw new Error('score_weights_invalid');
    const scoreVersion=scoreWeightsRevision(weights);
    await tx`update garimpa.curation_exception e set status=case when e.expires_at<=now() then 'expired' else 'irrelevant' end,
      closed_at=now(),close_reason=case when e.expires_at<=now() then 'deterministic_timeout' else 'facts_or_relevance_changed' end
      where e.tenant_id=${tenantId} and e.status='open' and (e.expires_at<=now() or not exists(
        select 1 from garimpa.curation_score_projection s
        join garimpa.product_curation c on c.tenant_id=s.tenant_id and c.product_id=s.product_id and c.status='approved'
        join garimpa.curation_attribute_assessment a on a.tenant_id=s.tenant_id and a.product_id=s.product_id and a.id=s.assessment_id
        join garimpa.price_observation o on o.tenant_id=s.tenant_id and o.product_id=s.product_id and o.id=s.observation_id
        where s.tenant_id=e.tenant_id and s.product_id=e.product_id and s.option_key=e.option_key and s.assessment_id=e.assessment_id
          and s.policy_version=e.score_version and s.policy_version=${scoreVersion} and o.price_cents::text=e.snapshot->>'priceCents'
          and o.id=(select latest.id from garimpa.price_observation latest where latest.tenant_id=o.tenant_id and latest.product_id=o.product_id
            and latest.option_key=o.option_key order by latest.observed_at desc,latest.id desc limit 1)
          and a.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
            where event.tenant_id=e.tenant_id and event.product_id=e.product_id order by event.id desc limit 1)
          and now()<garimpa.current_offer_valid_until(o.tenant_id,o.product_id,o.id)
          and not (coalesce(a.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
      ))`;
    await tx`with ranked as materialized (
      select s.product_id,s.option_key,s.assessment_id,s.score_vitrine,
        row_number() over(order by s.score_vitrine desc,s.product_id,s.option_key) as position
      from garimpa.curation_score_projection s
      join garimpa.product_curation c on c.tenant_id=s.tenant_id and c.product_id=s.product_id and c.status='approved'
      join garimpa.price_observation o on o.tenant_id=s.tenant_id and o.product_id=s.product_id and o.id=s.observation_id
      join garimpa.curation_attribute_assessment a on a.tenant_id=s.tenant_id and a.product_id=s.product_id and a.id=s.assessment_id
      where s.tenant_id=${tenantId} and s.policy_version=${scoreVersion} and o.id=(select latest.id from garimpa.price_observation latest
        where latest.tenant_id=s.tenant_id and latest.product_id=s.product_id and latest.option_key=s.option_key order by latest.observed_at desc,latest.id desc limit 1)
        and s.option_key=coalesce((select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=s.tenant_id and choice.product_id=s.product_id),
          (select latest.option_key from garimpa.price_observation latest where latest.tenant_id=s.tenant_id and latest.product_id=s.product_id
            order by latest.observed_at desc,latest.id desc limit 1))
        and a.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
          where event.tenant_id=s.tenant_id and event.product_id=s.product_id order by event.id desc limit 1)
        and now()<garimpa.current_offer_valid_until(o.tenant_id,o.product_id,o.id)
        and not (coalesce(a.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
        and exists(select 1 from garimpa.publication pub join garimpa.affiliate_account account on account.id=pub.affiliate_id
          and account.tenant_id=pub.tenant_id and account.status='active'
          where pub.tenant_id=s.tenant_id and pub.product_id=s.product_id and pub.channel='web' and pub.status='active')
    ), boundary as (select score_vitrine as cutoff from ranked where position=${capacity})
    update garimpa.curation_exception e set status='irrelevant',closed_at=now(),close_reason='outside_boundary'
      where e.tenant_id=${tenantId} and e.status='open' and not exists(select 1 from ranked r cross join boundary b
        where r.product_id=e.product_id and r.option_key=e.option_key and r.assessment_id=e.assessment_id
          and abs(r.score_vitrine-b.cutoff)<=greatest(5,b.cutoff*0.1))`;
    const [counts]=await tx<{open:number;today:number}[]>`select count(*) filter(where status='open')::int as open,
      count(*) filter(where opened_day=(now() at time zone 'America/Sao_Paulo')::date)::int as today
      from garimpa.curation_exception where tenant_id=${tenantId}`;
    const remaining=Math.max(0,Math.min(15-counts.open,15-counts.today));
    if(!remaining) {await fence();return {opened:0,open:counts.open};}
    const inserted=await tx<{id:string}[]>`with pool as materialized (
      select s.product_id,s.option_key,s.observation_id,s.assessment_id,s.policy_version,s.source_revision,
        s.score_vitrine,s.potential_score,o.price_cents,a.attributes,
        garimpa.current_offer_valid_until(o.tenant_id,o.product_id,o.id) as valid_until
      from garimpa.curation_score_projection s
      join garimpa.product p on p.tenant_id=s.tenant_id and p.id=s.product_id
      join garimpa.product_curation c on c.tenant_id=s.tenant_id and c.product_id=s.product_id and c.status='approved'
      join garimpa.price_observation o on o.tenant_id=s.tenant_id and o.product_id=s.product_id and o.id=s.observation_id
      join garimpa.curation_attribute_assessment a on a.tenant_id=s.tenant_id and a.product_id=s.product_id and a.id=s.assessment_id
      where s.tenant_id=${tenantId} and s.policy_version=${scoreVersion} and o.id=(select latest.id from garimpa.price_observation latest
        where latest.tenant_id=p.tenant_id and latest.product_id=p.id and latest.option_key=s.option_key order by latest.observed_at desc,latest.id desc limit 1)
        and s.option_key=coalesce((select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id),
          (select latest.option_key from garimpa.price_observation latest where latest.tenant_id=p.tenant_id and latest.product_id=p.id
            order by latest.observed_at desc,latest.id desc limit 1))
        and a.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
          where event.tenant_id=p.tenant_id and event.product_id=p.id order by event.id desc limit 1)
        and now()<garimpa.current_offer_valid_until(o.tenant_id,o.product_id,o.id)
        and exists(select 1 from garimpa.publication pub join garimpa.affiliate_account account on account.id=pub.affiliate_id
          and account.tenant_id=pub.tenant_id and account.status='active'
          where pub.tenant_id=p.tenant_id and pub.product_id=p.id and pub.channel='web' and pub.status='active')
        and not (coalesce(a.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
    ), ranked as materialized (
      select pool.*,row_number() over(order by score_vitrine desc,product_id,option_key) as position from pool
    ), boundary as (select score_vitrine as cutoff from ranked where position=${capacity})
    insert into garimpa.curation_exception(tenant_id,product_id,option_key,assessment_id,score_version,basis_fingerprint,
      observation_id,source_revision,opened_day,expires_at,priority,snapshot)
    select ${tenantId},r.product_id,r.option_key,r.assessment_id,r.policy_version,
      md5(r.price_cents::text||':'||r.option_key||':'||r.assessment_id::text),r.observation_id,r.source_revision,
      (now() at time zone 'America/Sao_Paulo')::date,least(now()+interval '24 hours',r.valid_until),
      100-abs(r.score_vitrine-b.cutoff)+greatest(0,r.potential_score-r.score_vitrine)/10,
      jsonb_build_object('score',r.score_vitrine,'potentialScore',r.potential_score,'cutoff',b.cutoff,
        'confidence',r.attributes->'confianca','priceCents',r.price_cents,'attributes',r.attributes,'validUntil',r.valid_until)
    from ranked r cross join boundary b
    where jsonb_typeof(r.attributes->'confianca')='number' and (r.attributes->>'confianca')::numeric between 0.4 and 0.7
      and abs(r.score_vitrine-b.cutoff)<=greatest(5,b.cutoff*0.1)
      and not exists(select 1 from garimpa.curation_exception existing where existing.tenant_id=${tenantId}
        and existing.product_id=r.product_id and existing.option_key=r.option_key and existing.assessment_id=r.assessment_id
        and existing.score_version=r.policy_version
        and existing.basis_fingerprint=md5(r.price_cents::text||':'||r.option_key||':'||r.assessment_id::text))
    order by (100-abs(r.score_vitrine-b.cutoff)+greatest(0,r.potential_score-r.score_vitrine)/10) desc,r.product_id
    limit ${remaining}
    on conflict(tenant_id,product_id,option_key,assessment_id,score_version,basis_fingerprint) do nothing returning id`;
    await fence();return {opened:inserted.length,open:counts.open+inserted.length};
  });
}

export async function readCurationExceptions(context:AccountContext,sqlFactory:typeof db=db) {
  return withAccountDb(context,async tx=>{
    const [schema]=await tx<{ready:boolean}[]>`select to_regclass('garimpa.curation_exception') is not null as ready`;
    if(!schema?.ready) return [];
    const rows=await tx<Array<{id:string;product_id:string;title:string;priority:string;expires_at:Date;snapshot:{score:number;cutoff:number;confidence:number}}>>`
      select e.id,e.product_id,p.title,e.priority,e.expires_at,e.snapshot from garimpa.curation_exception e
      join garimpa.product p on p.tenant_id=e.tenant_id and p.id=e.product_id
      where e.tenant_id=${context.tenantId} and e.status='open' and e.expires_at>now()
      order by e.priority desc,e.expires_at,e.id limit 15`;
    return rows.map(row=>({id:row.id,productId:row.product_id,title:row.title,priority:Number(row.priority),
      expiresAt:new Date(row.expires_at).toISOString(),snapshot:row.snapshot}));
  },sqlFactory);
}
