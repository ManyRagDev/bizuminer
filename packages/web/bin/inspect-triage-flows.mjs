/** Diagnóstico somente leitura. Não executa captura, IA ou decisões editoriais.
 * Uso em packages/web: node --env-file=.env.local bin/inspect-triage-flows.mjs
 * Não imprime URL do banco, chaves ou dados de usuários.
 */
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
const sql = postgres(process.env.DATABASE_URL, {
  prepare: false, max: 1, connect_timeout: 10,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

try {
  const report = await sql.begin("isolation level repeatable read read only", async (tx) => {
    await tx`set local statement_timeout = '20000ms'`;
    const config = await tx`select tenant_id, guideline, auto_publish, min_score_auto_publish, updated_at
      from garimpa.editorial_guideline where tenant_id='local'`;
    const runs = await tx`select id, status, started_at, finished_at, total_input, approved_count,
      held_count, rejected_count, annotated_count, model_name, pipeline_version
      from garimpa.triage_run where tenant_id='local' order by started_at desc limit 20`;
    const statuses = await tx`select status, reason_code, count(*)::int as count
      from garimpa.product_curation where tenant_id='local' group by status,reason_code order by count desc`;
    const automatedOutcomes = await tx`select actor_type, to_status, reason_code,
      metadata->'automation'->>'aiScore' as ai_score, count(*)::int as count
      from garimpa.curation_event where tenant_id='local' and actor_type in ('rule','llm')
      group by actor_type,to_status,reason_code,metadata->'automation'->>'aiScore' order by count desc`;
    const queue = await tx`select f.status, f.marketplace,
      (f.last_seen_at >= now()-interval '7 days') as fresh,
      exists(select 1 from garimpa.curation_event e where e.tenant_id=f.tenant_id and e.product_id=f.id
        and e.actor_type in ('rule','llm')) as has_automated_event,
      (f.deferred_until is not null and f.deferred_until>now()) as deferred,
      count(*)::int as count
      from garimpa.curation_queue_facts f where f.tenant_id='local'
      group by 1,2,3,4,5 order by 1,2,3,4,5`;
    const latestCaptureRuns = await tx`select id, marketplace, status, started_at, finished_at,
      items_captured, parameters->>'operationBatchId' as operation_batch_id,
      parameters->>'query' as query,parameters->>'captureMode' as capture_mode
      from garimpa.capture_run where tenant_id='local' order by started_at desc limit 30`;
    const recentRunReasons = await tx`select e.triage_run_id,e.actor_type,e.to_status,e.reason_code,
      e.metadata->'automation'->>'aiScore' as ai_score,count(*)::int as count,
      min((e.metadata->'snapshot'->>'priceCents')::int) as min_snapshot_price_cents,
      max((e.metadata->'snapshot'->>'priceCents')::int) as max_snapshot_price_cents
      from garimpa.curation_event e where e.tenant_id='local' and e.triage_run_id in (
        select id from garimpa.triage_run where tenant_id='local' order by started_at desc limit 4)
      group by 1,2,3,4,5 order by 1,2,3,4,5`;
    const captureSourceCounts = await tx`select marketplace,parameters->>'captureMode' as capture_mode,
      (parameters->>'operationBatchId' is not null) as has_operation_batch,status,count(*)::int as runs,
      min(started_at) as first_started_at,max(started_at) as last_started_at,
      sum(items_captured)::int as captured_observations
      from garimpa.capture_run where tenant_id='local' and started_at>=now()-interval '15 days'
      group by 1,2,3,4 order by 1,2,3,4`;
    const tables = await tx`select tablename from pg_tables where schemaname='garimpa'
      and tablename in ('capture_batch','editorial_selection','editorial_assessment','editorial_selection_item')`;
    const hasTable = (name) => tables.some((row) => row.tablename === name);
    const captureBatches = hasTable('capture_batch')
      ? await tx`select id,requested_marketplaces,pages,status,started_at,finished_at
          from garimpa.capture_batch where tenant_id='local' order by started_at desc limit 10` : [];
    const activeBatchChildren = hasTable('capture_batch')
      ? await tx`select b.id,b.requested_marketplaces,b.started_at,count(cr.id)::int as child_runs,
          max(cr.finished_at) as last_child_finished_at
          from garimpa.capture_batch b left join garimpa.capture_run cr on cr.tenant_id=b.tenant_id
          and cr.parameters->>'operationBatchId'=b.id::text
          where b.tenant_id='local' and b.status='running' group by b.id,b.requested_marketplaces,b.started_at` : [];
    const selections = hasTable('editorial_selection')
      ? await tx`select id,status,version,valid_until,created_at
          from garimpa.editorial_selection where tenant_id='local' order by created_at desc limit 10` : [];
    const assessments = hasTable('editorial_assessment')
      ? await tx`select policy_version,count(*)::int as count
          from garimpa.editorial_assessment where tenant_id='local' group by policy_version` : [];
    const recentDecisionSamples = await tx`select e.id,e.triage_run_id,e.created_at,e.actor_type,e.to_status,
      e.reason_code,e.metadata->'automation'->>'aiScore' as ai_score,
      e.metadata->'automation'->>'rationale' as rationale,p.title,p.marketplace,
      e.metadata->'snapshot'->>'priceCents' as snapshot_price_cents
      from garimpa.curation_event e join garimpa.product p on p.id=e.product_id and p.tenant_id=e.tenant_id
      where e.tenant_id='local' and e.actor_type in ('rule','llm') order by e.id desc limit 30`;
    const annotatedHighScores = await tx`select e.id,e.created_at,e.triage_run_id,e.to_status,
      e.metadata->'automation'->>'aiScore' as ai_score,p.title,p.marketplace,c.status as current_status
      from garimpa.curation_event e join garimpa.product p on p.id=e.product_id and p.tenant_id=e.tenant_id
      join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id
      where e.tenant_id='local' and e.actor_type='llm' and e.to_status='pending'
        and e.metadata->'automation'->>'aiScore' in ('4','5') order by e.id desc limit 20`;
    const crossCaptureTriage = await tx`select e.triage_run_id,p.marketplace,
      cr.parameters->>'operationBatchId' as latest_observation_batch,
      count(*)::int as count
      from garimpa.curation_event e join garimpa.product p on p.id=e.product_id and p.tenant_id=e.tenant_id
      left join lateral (select o.capture_run_id from garimpa.price_observation o
        where o.product_id=p.id and o.tenant_id=p.tenant_id and o.observed_at<=e.created_at
        order by o.observed_at desc,o.id desc limit 1) obs on true
      left join garimpa.capture_run cr on cr.id=obs.capture_run_id and cr.tenant_id=p.tenant_id
      where e.tenant_id='local' and e.triage_run_id in (
        select id from garimpa.triage_run where tenant_id='local' order by started_at desc limit 8)
      group by 1,2,3 order by 1,2,3`;
    return { checkedAt: new Date().toISOString(), readOnly: true,
      environment: { geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
        configuredModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
        mlAutomatedCaptureFlag:process.env.ML_AUTOMATED_CAPTURE_ENABLED==='true',
        mlProductionCaptureFlag:process.env.ML_AUTOMATED_CAPTURE_PRODUCTION==='true' },
      config,runs,statuses,automatedOutcomes,queue,latestCaptureRuns,captureBatches,
      selections,assessments,recentDecisionSamples,annotatedHighScores,crossCaptureTriage,
      recentRunReasons,captureSourceCounts,activeBatchChildren };
  });
  console.log(JSON.stringify(report,null,2));
} catch (error) {
  console.error(JSON.stringify({errorName:error.name,errorCode:error.code??null,
    errorMessage:String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]')}));
  process.exitCode=1;
} finally {
  await sql.end({timeout:2});
}
