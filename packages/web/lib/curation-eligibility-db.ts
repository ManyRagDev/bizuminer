import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { editorialEvidenceFingerprint } from "./editorial-selection.ts";
import { hasRestrictedTitle } from "./curation-safety-terms.ts";
import { ATTRIBUTE_POLICY_VERSION } from "./curation-attributes-db.ts";
import { ATTRIBUTE_PROMPT_VERSION } from "./ai-curation-v2-service.ts";

/** Promote assessed pending candidates, only under both explicit account settings. */
export async function advanceCurationEligibility(sql:Sql,tenantId:string,model:string,leaseOwner:string,limit=50):Promise<{advanced:number;more:boolean}> {
  if(!model || model.length>200 || !/^[0-9a-f-]{36}$/i.test(leaseOwner) || !Number.isInteger(limit) || limit<1 || limit>100) throw new Error("eligibility_input_invalid");
  return withMonitoringDb(sql,tenantId,async tx=>{
    await tx`select pg_advisory_xact_lock_shared(hashtextextended(${`curation-policy:${tenantId}`},0))`;
    const [policy]=await tx<{enabled:boolean;auto_eligibility:boolean}[]>`
      select enabled,config->'autoEligibility'='true'::jsonb as auto_eligibility
      from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
    const [guideline]=await tx<{auto_publish:boolean}[]>`select auto_publish from garimpa.editorial_guideline
      where tenant_id=${tenantId} for share`;
    if(!policy?.enabled || !policy.auto_eligibility || !guideline?.auto_publish) return {advanced:0,more:false};
    const [job]=await tx<{eligibility_cursor:string|null}[]>`select eligibility_cursor from garimpa.curation_projection_job
      where tenant_id=${tenantId} and lease_owner=${leaseOwner}::uuid and lease_until>clock_timestamp()`;
    if(!job) throw new Error("eligibility_lease_lost");
    const rows=await tx<Array<{product_id:string;title:string;product_url:string;image_url:string|null;category:string|null;
      observation_id:string;price_cents:number;rating_star:number|null;offer_evidence:Record<string,unknown>|null;
      assessment_id:string;material_fingerprint:string;assessed_price:number;attributes:{flags?:string[]};last_event_id:string|null;
      input_snapshot:Record<string,unknown>;input_fingerprint:string}>>`
      select p.id as product_id,p.title,p.product_url,p.image_url,p.category,o.id as observation_id,o.price_cents,o.rating_star,o.offer_evidence,
        a.id::text as assessment_id,a.material_fingerprint,a.price_cents as assessed_price,a.attributes,
        a.last_curation_event_id as last_event_id,a.input_snapshot,a.input_fingerprint
      from garimpa.product p join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
      join lateral (select * from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
        and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
          or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
        order by o.observed_at desc,o.id desc limit 1) o on true
      join lateral (select a.* from garimpa.curation_attribute_assessment a join garimpa.price_observation assessed
        on assessed.tenant_id=a.tenant_id and assessed.product_id=a.product_id and assessed.id=a.observation_id
        where a.tenant_id=p.tenant_id and a.product_id=p.id and assessed.option_key=o.option_key
        order by a.created_at desc,a.id desc limit 1) a on true
      where p.tenant_id=${tenantId} and c.status='pending' and c.reviewed_by_app_user_id is null
        and (${job.eligibility_cursor}::text is null or p.id>${job.eligibility_cursor})
        and a.policy_version=${ATTRIBUTE_POLICY_VERSION} and a.prompt_version=${ATTRIBUTE_PROMPT_VERSION} and a.model=${model}
        and jsonb_typeof(a.input_snapshot->'materialSnapshot')='object'
        and a.input_snapshot#>>'{materialSnapshot,title}'=p.title
        and a.input_snapshot#>>'{materialSnapshot,imageUrl}' is not distinct from p.image_url
        and a.input_snapshot#>>'{materialSnapshot,category}' is not distinct from p.category
        and a.input_snapshot#>>'{materialSnapshot,productUrl}'=p.product_url
        and a.price_cents>0 and abs(o.price_cents-a.price_cents)::numeric/a.price_cents<0.1
        and a.last_curation_event_id is not distinct from (select e.id::text from garimpa.curation_event e
          where e.tenant_id=p.tenant_id and e.product_id=p.id order by e.id desc limit 1)
        and not exists(select 1 from garimpa.curation_event e where e.tenant_id=p.tenant_id and e.product_id=p.id
          and e.actor_type='human' and e.to_status in ('rejected','held'))
        and not (coalesce(a.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
        and o.price_cents>0 and o.offer_evidence->>'currency'='BRL' and o.offer_evidence->>'priceType' in ('exact','range','from')
        and lower(translate(p.title,'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
          !~ '\\m(erotico|erotica|sexy|vibrador|anabolizante|replica|lingerie sensual|masturbador|dildo|plug anal|fantasia sensual)\\M'
      order by p.id limit ${limit} for update of p,c skip locked`;
    let advanced=0;
    for(const row of rows) {
      const material=editorialEvidenceFingerprint({title:row.title,productUrl:row.product_url,imageUrl:row.image_url,
        category:row.category,ratingStar:row.rating_star,offerEvidence:row.offer_evidence ?? {}});
      const fingerprint=createHash('sha256').update(JSON.stringify(material)).digest('hex');
      if(hasRestrictedTitle(row.title) || fingerprint!==row.material_fingerprint || row.assessed_price<=0
        || Math.abs(row.price_cents-row.assessed_price)/row.assessed_price>=0.1) continue;
      const updated=await tx<{product_id:string}[]>`update garimpa.product_curation set status='approved',reason_code=null,reason_detail=null,
          reviewed_by_app_user_id=null,reviewed_at=now(),updated_at=now()
        where tenant_id=${tenantId} and product_id=${row.product_id} and status='pending' and reviewed_by_app_user_id is null
          and ${row.last_event_id}::text is not distinct from (select e.id::text from garimpa.curation_event e
            where e.tenant_id=${tenantId} and e.product_id=${row.product_id} order by e.id desc limit 1)
          and not exists(select 1 from garimpa.curation_event e where e.tenant_id=${tenantId} and e.product_id=${row.product_id}
            and e.actor_type='human' and e.to_status in ('rejected','held')) returning product_id`;
      if(!updated.length) continue;
      const [event]=await tx<{id:string}[]>`insert into garimpa.curation_event
        (tenant_id,product_id,from_status,to_status,actor_type,policy_version,metadata)
        values(${tenantId},${row.product_id},'pending','approved','system','eligibility-v2',
          ${tx.json({kind:'v2_eligibility',sourceAssessmentId:row.assessment_id,observationId:row.observation_id,
            snapshot:{title:row.title,priceCents:row.price_cents},reason:'current_attributes_without_blocking_flags'})}) returning id::text`;
      if(!event) throw new Error('eligibility_event_missing');
      const copyFingerprint=createHash('sha256').update(JSON.stringify({source:row.assessment_id,event:event.id,kind:'eligibility-v2'})).digest('hex');
      await tx`insert into garimpa.curation_attribute_assessment
        (tenant_id,product_id,observation_id,input_fingerprint,material_fingerprint,price_cents,policy_version,prompt_version,model,
         input_snapshot,attributes,last_curation_event_id,previous_assessment_id)
        select tenant_id,product_id,observation_id,${copyFingerprint},material_fingerprint,price_cents,policy_version,prompt_version,model,
          input_snapshot,attributes,${event.id},id from garimpa.curation_attribute_assessment
        where tenant_id=${tenantId} and product_id=${row.product_id} and id=${row.assessment_id}::uuid`;
      advanced++;
    }
    const more=rows.length===limit;
    const [updatedJob]=await tx<{tenant_id:string}[]>`update garimpa.curation_projection_job
      set eligibility_cursor=${more ? rows[rows.length-1]!.product_id : null}
      where tenant_id=${tenantId} and lease_owner=${leaseOwner}::uuid and lease_until>clock_timestamp() returning tenant_id`;
    if(!updatedJob) throw new Error("eligibility_lease_lost");
    return {advanced,more};
  });
}
