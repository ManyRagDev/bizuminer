import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { aiCurationProvider, aiCurationReadiness } from "./ai-curation-provider.ts";
import { ATTRIBUTE_PROMPT_VERSION, evaluateAttributeBatch } from "./ai-curation-v2-service.ts";
import { ATTRIBUTE_POLICY_VERSION, attachAttributePromptContext, claimAttributeJobs, finishAttributeJob, reconcileAttributeJobs, recoverExpiredAttributeJobs,recordAttributeConfigurationWait } from "./curation-attributes-db.ts";
import { getGoldenExamples } from "./editorial-compass.ts";
import { curationDiagnostic, type CurationDiagnostic } from "./curation-diagnostic.ts";

async function nextAttributeWork(sql:Sql,tenantId:string,model:string,cap:number):Promise<Date|null> {
  return withMonitoringDb(sql,tenantId,async tx=>{
    const [schema]=await tx<{ready:boolean}[]>`select exists(select 1 from information_schema.columns where table_schema='garimpa'
      and table_name='curation_external_budget' and column_name='configured_limit') as ready`;
    if(schema?.ready) await tx`insert into garimpa.curation_external_budget(tenant_id,local_day,kind,marketplace,configured_limit)
      values(${tenantId},(now() at time zone 'America/Sao_Paulo')::date,'ai','all',${cap})
      on conflict(tenant_id,local_day,kind,marketplace) do update set configured_limit=excluded.configured_limit`;
    const [row]=await tx<{due:Date|null}[]>`select least(
      (select min(lease_until) from garimpa.curation_attribute_job
        where tenant_id=${tenantId} and status='running'),
      (select case when coalesce((select consumed from garimpa.curation_external_budget where tenant_id=${tenantId}
          and local_day=(now() at time zone 'America/Sao_Paulo')::date and kind='ai' and marketplace='all'),0)>=${cap}
        then (((now() at time zone 'America/Sao_Paulo')::date+1)::timestamp at time zone 'America/Sao_Paulo')
        else min(next_attempt_at) end from garimpa.curation_attribute_job
        where tenant_id=${tenantId} and status='queued' and input_snapshot#>>'{basis,model}'=${model}
          and input_snapshot#>>'{basis,policyVersion}'=${ATTRIBUTE_POLICY_VERSION}
          and input_snapshot#>>'{basis,promptVersion}'=${ATTRIBUTE_PROMPT_VERSION}
          and jsonb_typeof(input_snapshot->'materialSnapshot')='object' having count(*)>0)) as due`;
    return row?.due ? new Date(row.due) : null;
  });
}

/** One explicitly enabled, budgeted provider call; uncertain outcomes are held. */
export async function runAttributeWorker(sql:Sql,tenantId:string):Promise<{due:Date|null;changed:boolean}> {
  if(process.env.CURATION_ATTRIBUTE_WORKER_ENABLED!=='true') return {due:null,changed:false};
  const enabled=await withMonitoringDb(sql,tenantId,async tx=>{
    const [row]=await tx<{enabled:boolean}[]>`select enabled from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
    return row?.enabled===true;
  });
  if(!enabled) return {due:null,changed:false};
  await recoverExpiredAttributeJobs(sql,tenantId);
  const cap=Number(process.env.CURATION_ATTRIBUTE_DAILY_CALL_LIMIT);
  if(!Number.isInteger(cap) || cap<1 || cap>1000) throw new Error('attributes_daily_budget_required');
  const provider=aiCurationProvider();
  const model=provider==='openrouter' ? process.env.AI_CURATION_MODEL : process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if(!model) throw new Error('attributes_model_required');
  const expectedModel=`${provider}:${model}`;
  const next=await nextAttributeWork(sql,tenantId,expectedModel,cap);
  if(!next || +next>Date.now()) return {due:next,changed:false};
  const readiness=aiCurationReadiness();
  if(!readiness.ready) {await recordAttributeConfigurationWait(sql,tenantId,expectedModel,
    ['gemini_key_missing','openrouter_key_missing_or_invalid'].includes(readiness.error??'')?'credential':'permanent');return {due:new Date(Date.now()+300_000),changed:false};}
  const jobs=await claimAttributeJobs(sql,tenantId,20,cap,expectedModel);
  if(!jobs.length) return {due:await nextAttributeWork(sql,tenantId,expectedModel,cap),changed:false};
  let stage:CurationDiagnostic['stage']='context';
  try {
    const batchIds=new Set(jobs.map(job=>job.snapshot.input.productId));
    const humanExamples=await getGoldenExamples(tenantId,20,undefined,true).catch(()=>[]);
    const related=humanExamples.length ? await withMonitoringDb(sql,tenantId,async tx=>{
      const rows=await tx<{product_id:string}[]>`select distinct own.product_id from garimpa.curation_equivalence_member own
        join garimpa.curation_equivalence_group g on g.tenant_id=own.tenant_id and g.id=own.group_id and g.revoked_at is null
        join garimpa.curation_equivalence_member other on other.tenant_id=g.tenant_id and other.group_id=g.id and other.active
        where own.tenant_id=${tenantId} and own.active and own.product_id=any(${humanExamples.map(example=>example.productId)}::text[])
          and other.product_id=any(${[...batchIds]}::text[])`;
      return new Set(rows.map(row=>row.product_id));
    }) : new Set<string>();
    const examples=humanExamples.filter(example=>!batchIds.has(example.productId) && !related.has(example.productId)
      && example.snapshotTitle && example.reasonDetail?.trim())
      .slice(0,5).map(example=>({title:example.snapshotTitle!.slice(0,500),
        rationale:`Decisão humana: ${example.decision}. ${example.reasonDetail!.trim()}`.slice(0,1000)}));
    await attachAttributePromptContext(sql,tenantId,jobs,examples);
    stage='provider';
    const results=await evaluateAttributeBatch(jobs.map(job=>job.snapshot.input),{examples});
    stage='commit';
    const byId=new Map(results.map(result=>[result.productId,result]));
    for(const job of jobs) {
      const result=byId.get(job.snapshot.input.productId);
      if(!result) throw new Error('attributes_batch_incomplete');
      await finishAttributeJob(sql,tenantId,job,result);
    }
  } catch(error) {
    // Includes partial commits: only jobs still owned and running are held.
    await reconcileAttributeJobs(sql,tenantId,jobs,curationDiagnostic(error,stage));
    console.error(JSON.stringify({event:'curation_attributes_reconciliation',tenantId,count:jobs.length}));
  }
  return {due:await nextAttributeWork(sql,tenantId,expectedModel,cap),changed:true};
}
