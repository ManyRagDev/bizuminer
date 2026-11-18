import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { editorialEvidenceFingerprint } from "./editorial-selection.ts";
import { assessmentNeedsRefresh, type AssessmentBasis, type AttributeAssessment, type AttributeAssessmentInput } from "./ai-curation-v2-contract.ts";
import { ATTRIBUTE_PROMPT_VERSION } from "./ai-curation-v2-service.ts";
import {curationDiagnostic,type CurationDiagnostic} from "./curation-diagnostic.ts";

export const ATTRIBUTE_POLICY_VERSION = "attributes-policy-v2";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type MaterialSnapshot = {title:string;imageUrl:string|null;category:string|null;productUrl:string};
type AttributePromptContext={revision:string;examples:Array<{title:string;rationale:string}>};
type InputSnapshot = { input: AttributeAssessmentInput; basis: AssessmentBasis; latestEventId: string | null; curationStatus: string | null; materialSnapshot:MaterialSnapshot;promptContext?:AttributePromptContext };
type DeltaRow = { id: string; product_id: string; observation_id: string; title: string; product_url: string;
  image_url: string | null; category: string | null; marketplace: string; price_cents: number;
  rating_star: number | null; sales_count:number|null; offer_evidence: Record<string, unknown> | null; latest_event_id: string | null;
  curation_status: string | null; prior: (AssessmentBasis & {lastEventId:string|null;hasMaterialSnapshot:boolean}) | null };

/** Bounded policy/model backfill, including observations predating the delta trigger. */
export async function enqueueAttributePolicyRefresh(sql: Sql, tenantId: string, model: string, limit = 100,projectionOwner?:string): Promise<number> {
  if (!model || model.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("attributes_enqueue_invalid");
  return withMonitoringDb(sql, tenantId, async tx => {
    // Queued work was never sent; rebuild it if the configured model/prompt
    // changes. In-flight and uncertain paid requests are never auto-repeated.
    await tx`with obsolete as (update garimpa.curation_attribute_job set status='superseded',updated_at=now()
      where tenant_id=${tenantId} and status='queued' and (input_snapshot#>>'{basis,model}' is distinct from ${model}
        or input_snapshot#>>'{basis,policyVersion}' is distinct from ${ATTRIBUTE_POLICY_VERSION}
        or input_snapshot#>>'{basis,promptVersion}' is distinct from ${ATTRIBUTE_PROMPT_VERSION}
        or jsonb_typeof(input_snapshot->'materialSnapshot') is distinct from 'object')
      returning product_id,observation_id)
      insert into garimpa.curation_fact_delta(tenant_id,product_id,observation_id)
      select ${tenantId},product_id,observation_id from obsolete
      on conflict(tenant_id,observation_id) do update set processed_at=null`;
    const changed = await tx<{observation_id:string}[]>`
      with stale as (
        select p.id as product_id,o.id as observation_id from garimpa.product p
        join lateral (select id,price_cents,option_key from garimpa.price_observation where tenant_id=p.tenant_id and product_id=p.id
          and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
            or option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
          order by observed_at desc,id desc limit 1) o on true
        left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
        left join lateral (select a.policy_version,a.prompt_version,a.model,a.price_cents,a.last_curation_event_id,a.input_snapshot
          from garimpa.curation_attribute_assessment a join garimpa.price_observation assessed
            on assessed.tenant_id=a.tenant_id and assessed.product_id=a.product_id and assessed.id=a.observation_id
          where a.tenant_id=p.tenant_id and a.product_id=p.id and assessed.option_key=o.option_key
          order by a.created_at desc,a.id desc limit 1) a on true
        where p.tenant_id=${tenantId} and coalesce(c.status,'pending')<>'rejected'
          and not exists(select 1 from garimpa.curation_attribute_job j where j.tenant_id=p.tenant_id and j.product_id=p.id
            and j.status in ('queued','running','reconciliation'))
          and (a.policy_version is distinct from ${ATTRIBUTE_POLICY_VERSION} or a.prompt_version is distinct from ${ATTRIBUTE_PROMPT_VERSION}
            or a.model is distinct from ${model} or a.price_cents<=0
            or jsonb_typeof(a.input_snapshot->'materialSnapshot') is distinct from 'object'
            or a.last_curation_event_id is distinct from (select event.id::text from garimpa.curation_event event
              where event.tenant_id=p.tenant_id and event.product_id=p.id order by event.id desc limit 1)
            or abs(o.price_cents-a.price_cents)::numeric/nullif(a.price_cents,0)>=0.1)
        order by p.id limit ${limit}
      ) insert into garimpa.curation_fact_delta(tenant_id,observation_id,product_id)
        select ${tenantId},observation_id,product_id from stale
      on conflict(tenant_id,observation_id) do update set processed_at=null
      where garimpa.curation_fact_delta.processed_at is not null returning observation_id`;
    if(projectionOwner) {
      const [lease]=await tx<{valid:boolean}[]>`select lease_until>clock_timestamp() as valid from garimpa.curation_projection_job
        where tenant_id=${tenantId} and lease_owner=${projectionOwner}::uuid for update`;
      if(!lease?.valid) throw new Error('curation_projection_lease_lost');
    }
    return changed.length;
  });
}

/** Turn a bounded set of committed facts into deduplicated, tenant-scoped work. */
export async function enqueueAttributeDeltasBatch(sql: Sql, tenantId: string, model: string, limit = 100,projectionOwner?:string): Promise<{queued:number;processed:number}> {
  if (!model || model.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("attributes_enqueue_invalid");
  return withMonitoringDb(sql, tenantId, async tx => {
    const rows = await tx<DeltaRow[]>`
      select d.observation_id as id,p.id as product_id,o.id as observation_id,p.title,p.product_url,p.image_url,p.category,p.marketplace,
        o.price_cents,o.rating_star,o.sales_count,o.offer_evidence,c.status as curation_status,
        (select e.id::text from garimpa.curation_event e where e.tenant_id=p.tenant_id and e.product_id=p.id order by e.id desc limit 1) as latest_event_id,
        (select jsonb_build_object('materialFingerprint',a.material_fingerprint,'priceCents',a.price_cents,
          'policyVersion',a.policy_version,'promptVersion',a.prompt_version,'model',a.model,'lastEventId',a.last_curation_event_id,
          'hasMaterialSnapshot',jsonb_typeof(a.input_snapshot->'materialSnapshot')='object')
         from garimpa.curation_attribute_assessment a join garimpa.price_observation assessed
           on assessed.tenant_id=a.tenant_id and assessed.product_id=a.product_id and assessed.id=a.observation_id
         where a.tenant_id=p.tenant_id and a.product_id=p.id and assessed.option_key=o.option_key
         order by a.created_at desc,a.id desc limit 1) as prior
      from garimpa.curation_fact_delta d join garimpa.product p on p.id=d.product_id and p.tenant_id=d.tenant_id
      join lateral (select * from garimpa.price_observation latest where latest.tenant_id=p.tenant_id and latest.product_id=p.id
        and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
          or latest.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
        order by latest.observed_at desc,latest.id desc limit 1) o on true
      left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
      where d.tenant_id=${tenantId} and d.processed_at is null
        and not exists(select 1 from garimpa.curation_attribute_job active
          where active.tenant_id=d.tenant_id and active.product_id=d.product_id and active.status in ('running','reconciliation'))
      order by d.created_at,d.observation_id
      limit ${limit} for update of d skip locked`;
    let queued = 0, processed = 0;
    for (const row of rows) {
      // Human or safety rejection is not reopened by the queue.
      if (row.curation_status === "rejected") {
        await tx`update garimpa.curation_fact_delta set processed_at=now() where tenant_id=${tenantId} and observation_id=${row.id}`;
        processed++;
        continue;
      }
      const evidence = row.offer_evidence ?? {};
      const material = editorialEvidenceFingerprint({ title: row.title, imageUrl: row.image_url, category: row.category,
        productUrl: row.product_url, ratingStar: row.rating_star, offerEvidence: evidence });
      const basis: AssessmentBasis = { materialFingerprint: hash(material), priceCents: row.price_cents,
        policyVersion: ATTRIBUTE_POLICY_VERSION, promptVersion: ATTRIBUTE_PROMPT_VERSION, model };
      if (!assessmentNeedsRefresh(row.prior, basis) && row.prior?.lastEventId===row.latest_event_id && row.prior?.hasMaterialSnapshot) {
        await tx`update garimpa.curation_fact_delta set processed_at=now() where tenant_id=${tenantId} and observation_id=${row.id}`;
        processed++;
        continue;
      }
      const snapshot: InputSnapshot = { basis, latestEventId: row.latest_event_id, curationStatus: row.curation_status,
        materialSnapshot:{title:row.title,imageUrl:row.image_url,category:row.category,productUrl:row.product_url},
        input: { productId: row.product_id, title: row.title, marketplace: row.marketplace, priceCents: row.price_cents,
          category: row.category, ratingStar:row.rating_star !== null && row.rating_star>=1 && row.rating_star<=5 ? row.rating_star : null,
          salesCount:typeof row.sales_count==='number' && Number.isSafeInteger(row.sales_count) && row.sales_count>=0 ? row.sales_count : null, evidence } };
      const [job] = await tx<{id:string}[]>`insert into garimpa.curation_attribute_job
        (tenant_id,product_id,observation_id,input_fingerprint,input_snapshot)
        values(${tenantId},${row.product_id},${row.observation_id},${hash({basis,latestEventId:row.latest_event_id,materialSnapshotVersion:1})},${tx.json(snapshot as any)})
        on conflict(tenant_id,product_id) where status in ('queued','running','reconciliation') do update
        set observation_id=excluded.observation_id,input_fingerprint=excluded.input_fingerprint,input_snapshot=excluded.input_snapshot,updated_at=now()
        where garimpa.curation_attribute_job.status='queued' returning id`;
      if (job) {
        await tx`update garimpa.curation_fact_delta set processed_at=now() where tenant_id=${tenantId} and observation_id=${row.id}`;
        queued++; processed++;
      }
    }
    if(projectionOwner) {
      const [lease]=await tx<{valid:boolean}[]>`select lease_until>clock_timestamp() as valid from garimpa.curation_projection_job
        where tenant_id=${tenantId} and lease_owner=${projectionOwner}::uuid for update`;
      if(!lease?.valid) throw new Error('curation_projection_lease_lost');
    }
    return {queued,processed};
  });
}

/** Compatibility for callers that report only newly queued work. */
export async function enqueueAttributeDeltas(sql:Sql,tenantId:string,model:string,limit=100):Promise<number> {
  return (await enqueueAttributeDeltasBatch(sql,tenantId,model,limit)).queued;
}

export type ClaimedAttributeJob = { id: string; workerId: string; observationId: string; fingerprint: string; snapshot: InputSnapshot };
/** Persist the exact context before the external request, under its lease. */
export async function attachAttributePromptContext(sql:Sql,tenantId:string,jobs:readonly ClaimedAttributeJob[],examples:Array<{title:string;rationale:string}>):Promise<void> {
  if(!jobs.length || examples.length>5 || examples.some(example=>typeof example.title!=='string' || example.title.length>500
    || typeof example.rationale!=='string' || example.rationale.length>1000)) throw new Error('attributes_prompt_context_invalid');
  const context:AttributePromptContext={revision:hash(examples),examples};
  const workerId=jobs[0]!.workerId;
  if(jobs.some(job=>job.workerId!==workerId)) throw new Error('attributes_claim_invalid');
  await withMonitoringDb(sql,tenantId,async tx=>{
    const rows=await tx<{id:string}[]>`update garimpa.curation_attribute_job set
      input_snapshot=jsonb_set(input_snapshot,'{promptContext}',${tx.json(context as any)}::jsonb,true),updated_at=now()
      where tenant_id=${tenantId} and worker_id=${workerId}::uuid and id=any(${jobs.map(job=>job.id)}::uuid[])
        and status='running' and lease_until>clock_timestamp() returning id`;
    if(rows.length!==jobs.length) throw new Error('attributes_lease_lost');
  });
  for(const job of jobs) job.snapshot.promptContext=context;
}
export async function recoverExpiredAttributeJobs(sql:Sql,tenantId:string):Promise<number> {
  return withMonitoringDb(sql,tenantId,async tx=>{
    const rows=await tx<{id:string}[]>`update garimpa.curation_attribute_job set status='reconciliation',updated_at=now()
      where tenant_id=${tenantId} and status='running' and lease_until<now() returning id`;
    const [schema]=await tx<{ready:boolean}[]>`select exists(select 1 from information_schema.columns where table_schema='garimpa'
      and table_name='curation_attribute_job' and column_name='diagnostic') as ready`;
    if(schema?.ready&&rows.length) await tx`update garimpa.curation_attribute_job set diagnostic=${tx.json(curationDiagnostic(null,'lease'))}::jsonb
      where tenant_id=${tenantId} and id=any(${rows.map(r=>r.id)}::uuid[]) and status='reconciliation'`;
    return rows.length;
  });
}
export async function claimAttributeJobs(sql: Sql, tenantId: string, limit: number, dailyCallLimit: number, expectedModel?:string): Promise<ClaimedAttributeJob[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20 || !Number.isInteger(dailyCallLimit) || dailyCallLimit < 1 || dailyCallLimit > 1000)
    throw new Error("attributes_claim_invalid");
  const workerId = randomUUID();
  return withMonitoringDb(sql, tenantId, async tx => {
    // A worker may have paid for a response before dying. Never auto-repeat it.
    await tx`update garimpa.curation_attribute_job set status='reconciliation',updated_at=now()
      where tenant_id=${tenantId} and status='running' and lease_until<now()`;
    await tx`insert into garimpa.curation_external_budget(tenant_id,local_day,kind)
      values(${tenantId},(now() at time zone 'America/Sao_Paulo')::date,'ai') on conflict do nothing`;
    const [budget] = await tx<{consumed:number}[]>`select consumed from garimpa.curation_external_budget
      where tenant_id=${tenantId} and local_day=(now() at time zone 'America/Sao_Paulo')::date and kind='ai' and marketplace='all' for update`;
    if (!budget || budget.consumed >= dailyCallLimit) return [];
    const jobs = await tx<{id:string;observation_id:string;input_fingerprint:string;input_snapshot:InputSnapshot}[]>`
      with chosen as (select id from garimpa.curation_attribute_job where tenant_id=${tenantId}
        and status='queued' and next_attempt_at<=now()
        and (${expectedModel ?? null}::text is null or input_snapshot#>>'{basis,model}'=${expectedModel ?? null})
        and input_snapshot#>>'{basis,policyVersion}'=${ATTRIBUTE_POLICY_VERSION}
        and input_snapshot#>>'{basis,promptVersion}'=${ATTRIBUTE_PROMPT_VERSION}
        and jsonb_typeof(input_snapshot->'materialSnapshot')='object'
        order by next_attempt_at,id limit ${limit} for update skip locked)
      update garimpa.curation_attribute_job j set status='running',worker_id=${workerId}::uuid,
        lease_until=now()+interval '3 minutes',attempts=j.attempts+1,updated_at=now()
      from chosen where j.tenant_id=${tenantId} and j.id=chosen.id
      returning j.id,j.observation_id,j.input_fingerprint,j.input_snapshot`;
    if (jobs.length) await tx`update garimpa.curation_external_budget set consumed=consumed+1
      where tenant_id=${tenantId} and local_day=(now() at time zone 'America/Sao_Paulo')::date and kind='ai' and marketplace='all'`;
    return jobs.map(job => ({ id: job.id, workerId, observationId: job.observation_id, fingerprint: job.input_fingerprint, snapshot: job.input_snapshot }));
  });
}

/** Persist only while the same option and compatible facts, human decision and lease still match. */
export async function finishAttributeJob(sql: Sql, tenantId: string, job: ClaimedAttributeJob, attributes: AttributeAssessment): Promise<"completed" | "superseded"> {
  if (attributes.productId !== job.snapshot.input.productId) throw new Error("attributes_product_mismatch");
  return withMonitoringDb(sql, tenantId, async tx => {
    // Match the ingestion/curation lock order before comparing snapshots.
    await tx`select id from garimpa.product where tenant_id=${tenantId} and id=${attributes.productId} for update`;
    await tx`select product_id from garimpa.product_curation where tenant_id=${tenantId} and product_id=${attributes.productId} for update`;
    const [current] = await tx<{observation_id:string;option_key:string;original_option_key:string;price_cents:number;latest_event_id:string|null;status:string|null;
      title:string;product_url:string;image_url:string|null;category:string|null;rating_star:number|null;offer_evidence:Record<string,unknown>|null}[]>`
      select latest.id as observation_id,latest.option_key,original.option_key as original_option_key,latest.price_cents,
        p.title,p.product_url,p.image_url,p.category,latest.rating_star,latest.offer_evidence,
        (select e.id::text from garimpa.curation_event e where e.tenant_id=j.tenant_id and e.product_id=j.product_id order by e.id desc limit 1) as latest_event_id,
        c.status from garimpa.curation_attribute_job j join garimpa.product p on p.tenant_id=j.tenant_id and p.id=j.product_id
      join garimpa.price_observation original on original.tenant_id=j.tenant_id and original.product_id=j.product_id and original.id=j.observation_id
      join lateral(select o.id,o.option_key,o.price_cents,o.rating_star,o.offer_evidence from garimpa.price_observation o where o.tenant_id=j.tenant_id and o.product_id=j.product_id
        and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=j.tenant_id and choice.product_id=j.product_id)
          or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=j.tenant_id and choice.product_id=j.product_id))
        order by o.observed_at desc,o.id desc limit 1) latest on true
      left join garimpa.product_curation c on c.tenant_id=j.tenant_id and c.product_id=j.product_id
      where j.id=${job.id}::uuid and j.tenant_id=${tenantId} and j.status='running' and j.worker_id=${job.workerId}::uuid
        and j.lease_until>now() and j.input_fingerprint=${job.fingerprint} for update of j`;
    if (!current) throw new Error("attributes_lease_lost");
    const material=hash(editorialEvidenceFingerprint({title:current.title,productUrl:current.product_url,imageUrl:current.image_url,
      category:current.category,ratingStar:current.rating_star,offerEvidence:current.offer_evidence ?? {}}));
    if (!job.snapshot.materialSnapshot || job.snapshot.basis.policyVersion !== ATTRIBUTE_POLICY_VERSION || job.snapshot.basis.promptVersion !== ATTRIBUTE_PROMPT_VERSION
      || current.option_key !== current.original_option_key || current.latest_event_id !== job.snapshot.latestEventId
      || current.status !== job.snapshot.curationStatus || current.status === "rejected"
      || assessmentNeedsRefresh(job.snapshot.basis,{...job.snapshot.basis,materialFingerprint:material,priceCents:current.price_cents})) {
      await tx`update garimpa.curation_attribute_job set status='superseded',updated_at=now() where id=${job.id}::uuid and tenant_id=${tenantId}`;
      if(current.status!=="rejected") await tx`insert into garimpa.curation_fact_delta(tenant_id,product_id,observation_id)
        values(${tenantId},${attributes.productId},${current.observation_id})
        on conflict(tenant_id,observation_id) do update set processed_at=null`;
      // A delta may already have been pending while the job was running, so
      // reopening it need not fire the processed_at transition trigger.
      await tx`insert into garimpa.curation_projection_job(tenant_id,dirty_revision,next_due_at) values(${tenantId},1,now())
        on conflict(tenant_id) do update set dirty_revision=garimpa.curation_projection_job.dirty_revision+1,
          next_due_at=least(garimpa.curation_projection_job.next_due_at,now())`;
      await tx`select pg_notify('garimpa_curation_ready',json_build_object('tenantId',${tenantId}::text)::text)`;
      return "superseded";
    }
    const basis = job.snapshot.basis;
    const [prior] = await tx<{id:string}[]>`select id from garimpa.curation_attribute_assessment where tenant_id=${tenantId}
      and product_id=${attributes.productId} order by created_at desc,id desc limit 1`;
    const [saved] = await tx<{id:string}[]>`insert into garimpa.curation_attribute_assessment
      (tenant_id,product_id,observation_id,input_fingerprint,material_fingerprint,price_cents,policy_version,prompt_version,model,
       input_snapshot,attributes,last_curation_event_id,previous_assessment_id)
      values(${tenantId},${attributes.productId},${job.observationId},${job.fingerprint},${basis.materialFingerprint},${basis.priceCents},
       ${basis.policyVersion},${basis.promptVersion},${basis.model},${tx.json({...job.snapshot.input,materialSnapshot:job.snapshot.materialSnapshot,promptContext:job.snapshot.promptContext ?? null} as any)},${tx.json(attributes as any)},${current.latest_event_id},${prior?.id ?? null}::uuid)
      on conflict(tenant_id,product_id,input_fingerprint,policy_version,prompt_version,model) do nothing returning id`;
    const assessmentId = saved?.id ?? (await tx<{id:string}[]>`select id from garimpa.curation_attribute_assessment
      where tenant_id=${tenantId} and product_id=${attributes.productId} and input_fingerprint=${job.fingerprint}
        and policy_version=${basis.policyVersion} and prompt_version=${basis.promptVersion} and model=${basis.model}`)[0]?.id;
    if (!assessmentId) throw new Error("attributes_assessment_missing");
    await tx`update garimpa.curation_attribute_job set status='completed',assessment_id=${assessmentId}::uuid,updated_at=now()
      where id=${job.id}::uuid and tenant_id=${tenantId}`;
    // Wake even when the assessment was deduplicated and no insert trigger ran.
    await tx`insert into garimpa.curation_projection_job(tenant_id,dirty_revision,next_due_at) values(${tenantId},1,now())
      on conflict(tenant_id) do update set dirty_revision=garimpa.curation_projection_job.dirty_revision+1,
        next_due_at=least(garimpa.curation_projection_job.next_due_at,now())`;
    await tx`select pg_notify('garimpa_curation_ready',json_build_object('tenantId',${tenantId}::text)::text)`;
    return "completed";
  });
}

export async function reconcileAttributeJobs(sql: Sql, tenantId: string, jobs: readonly ClaimedAttributeJob[],diagnostic?:CurationDiagnostic): Promise<void> {
  if (!jobs.length) return;
  const workerId = jobs[0]!.workerId;
  if (jobs.some(job => job.workerId !== workerId)) throw new Error("attributes_claim_invalid");
  await withMonitoringDb(sql, tenantId, async tx => {
    const held=await tx<{id:string}[]>`update garimpa.curation_attribute_job set status='reconciliation',updated_at=now()
      where tenant_id=${tenantId} and worker_id=${workerId}::uuid and id=any(${jobs.map(job => job.id)}::uuid[]) and status='running' returning id`;
    const [schema]=await tx<{ready:boolean}[]>`select exists(select 1 from information_schema.columns where table_schema='garimpa'
      and table_name='curation_attribute_job' and column_name='diagnostic') as ready`;
    if(schema?.ready && diagnostic && held.length) await tx`update garimpa.curation_attribute_job set diagnostic=${tx.json(diagnostic)}::jsonb
      where tenant_id=${tenantId} and id=any(${held.map(job=>job.id)}::uuid[]) and worker_id=${workerId}::uuid and status='reconciliation'`;
  });
}

/** Observability of an unpaid readiness wait; never releases or touches uncertain calls. */
export async function recordAttributeConfigurationWait(sql:Sql,tenantId:string,model:string,kind:'credential'|'permanent'|'unknown'='unknown'):Promise<void>{
  await withMonitoringDb(sql,tenantId,async tx=>{
    const [schema]=await tx<{ready:boolean}[]>`select exists(select 1 from information_schema.columns where table_schema='garimpa'
      and table_name='curation_attribute_job' and column_name='diagnostic') as ready`;
    if(schema?.ready)await tx`update garimpa.curation_attribute_job set diagnostic=${tx.json(curationDiagnostic({kind},'configuration'))}::jsonb
      where tenant_id=${tenantId} and status='queued' and input_snapshot#>>'{basis,model}'=${model}`;
  });
}
