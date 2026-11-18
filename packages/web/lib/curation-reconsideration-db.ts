import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { hasRestrictedTitle } from "./curation-safety-terms.ts";

/** Bounded, auditable reconsideration. It never approves or clears a human veto. */
export async function reconsiderLegacyLowMerit(sql:Sql,tenantId:string,limit=50,projectionOwner?:string):Promise<number> {
  if(!Number.isInteger(limit) || limit<1 || limit>100) throw new Error("reconsideration_limit_invalid");
  return withMonitoringDb(sql,tenantId,async tx=>{
    const [policy]=await tx<{enabled:boolean}[]>`select enabled from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
    if(!policy?.enabled) return 0;
    const rows=await tx<{product_id:string;title:string;status:string;reason_code:string;reason_detail:string|null;
      event_id:string;actor_type:string;observation_id:string|null;price_cents:number|null;offer_evidence:Record<string,unknown>|null}[]>`
      select p.id as product_id,p.title,c.status,c.reason_code,c.reason_detail,e.id::text as event_id,e.actor_type,
        observation.id as observation_id,observation.price_cents,observation.offer_evidence
      from garimpa.product p join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
      join lateral (select id,actor_type,to_status,reason_code from garimpa.curation_event e
        where e.tenant_id=p.tenant_id and e.product_id=p.id order by e.id desc limit 1) e on true
      left join lateral (select id,price_cents,offer_evidence from garimpa.price_observation o
        where o.tenant_id=p.tenant_id and o.product_id=p.id order by o.observed_at desc,o.id desc limit 1) observation on true
      where p.tenant_id=${tenantId} and c.status='rejected' and c.reviewed_by_app_user_id is null
        and c.reason_code in ('low_utility','audience_mismatch','low_quality_listing')
        and e.to_status='rejected' and e.reason_code=c.reason_code and e.actor_type in ('llm','rule')
        and not exists(select 1 from garimpa.curation_event old where old.tenant_id=p.tenant_id and old.product_id=p.id
          and old.to_status='rejected' and (old.actor_type='human' or old.reason_code in ('adult_sexual','unsafe_restricted','misleading_claim')))
        and not exists(select 1 from garimpa.curation_attribute_assessment a where a.tenant_id=p.tenant_id and a.product_id=p.id
          and coalesce(a.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim'])
        and lower(translate(p.title,'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
          !~ '\\m(erotico|erotica|sexy|vibrador|anabolizante|replica|lingerie sensual|masturbador|dildo|plug anal|fantasia sensual)\\M'
      order by p.id limit ${limit} for update of p,c skip locked`;
    let changed=0;
    for(const row of rows) {
      if(hasRestrictedTitle(row.title)) continue;
      const updated=await tx<{product_id:string}[]>`update garimpa.product_curation set status='pending',reason_code=null,reason_detail=null,
          reviewed_by_app_user_id=null,reviewed_at=null,updated_at=now()
        where tenant_id=${tenantId} and product_id=${row.product_id} and status='rejected' and reason_code=${row.reason_code}
          and reviewed_by_app_user_id is null
          and ${row.event_id}=(select e.id::text from garimpa.curation_event e
            where e.tenant_id=${tenantId} and e.product_id=${row.product_id} order by e.id desc limit 1)
          and not exists(select 1 from garimpa.curation_event e where e.tenant_id=${tenantId} and e.product_id=${row.product_id}
            and e.to_status='rejected' and (e.actor_type='human' or e.reason_code in ('adult_sexual','unsafe_restricted','misleading_claim')))
        returning product_id`;
      if(!updated.length) continue;
      await tx`insert into garimpa.curation_event(tenant_id,product_id,from_status,to_status,from_reason_code,from_reason_detail,
          actor_type,policy_version,metadata)
        values(${tenantId},${row.product_id},'rejected','pending',${row.reason_code},${row.reason_detail},'system','reconsideration-v2',
          ${tx.json({kind:'legacy_low_merit_reconsideration',sourceEventId:row.event_id,sourceActor:row.actor_type,
            snapshot:{title:row.title,observationId:row.observation_id,priceCents:row.price_cents,offerEvidence:row.offer_evidence}} as any)})`;
      changed++;
    }
    if(projectionOwner) {
      const [lease]=await tx<{valid:boolean}[]>`select lease_until>clock_timestamp() as valid from garimpa.curation_projection_job
        where tenant_id=${tenantId} and lease_owner=${projectionOwner}::uuid for update`;
      if(!lease?.valid) throw new Error('curation_projection_lease_lost');
    }
    return changed;
  });
}
