import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
import { replacementRollout } from './replacement-rollout.ts';
import { PostgresStore } from '../../packages/persistence/src/pg-store.ts';
import { withMonitoringDb } from '../../packages/persistence/src/monitoring-db.ts';
import { publishCaptureBatch } from '../../packages/persistence/src/capture-publication.ts';
const require = createRequire(import.meta.url);
const { randomUUID } = require('node:crypto');
const fx = await nativePostgresFixture();
const store = new PostgresStore({ connectionString:'unused', sqlFactory:()=>fx.clientA });
const second = new PostgresStore({ connectionString:'unused', sqlFactory:()=>fx.clientB });
const tenant = 'capture_test';
const worker = 'worker-a';
const product = (run: string, externalId='one', price=5000, observedAt=new Date()) => ({ captureRunId:run, tenantId:tenant,
  marketplace:'shopee',externalId,title:'Produto '+externalId, productUrl:'https://shopee.com.br/test',priceCents:price, observedAt,
  offerEvidence: {version:2,currency:'BRL',priceType:'exact'} as any });
async function makeBatch() {
  const id = randomUUID();
  await fx.admin`insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,metadata)
    values(${id},${tenant},array['shopee'],1,${fx.admin.json({execution:{version:1,workerId:worker,phase:'capturing',deadline:new Date(Date.now()+600_000).toISOString(),stores:{shopee:{status:'running'}}}})})`;
  return id;
}
async function start(batch?:string, query='q', executor=store, workerId=worker) {
  return executor.startCaptureRun({tenantId:tenant,marketplace:'shopee',collectorRunId:randomUUID(),startedAt:new Date(),
    parameters: {operationBatchId:batch,operationWorkerId:batch?workerId:undefined,captureQueryId:query}});
}
async function finish(run:string, executor=store, ok=true) {
  await executor.finishCaptureRun(run,{tenantId:tenant,finishedAt:new Date(),status:ok?'ok':'error',itemsCaptured:1,itemsNew:1,priceChanges:0,parameterPatch:{itemsSeen:1,pagesRead:1}});
}
const count = async (table:string) => (await fx.admin.unsafe(`select count(*)::int n from garimpa.${table}`))[0].n;
try {
  const {units}=await replacementRollout();
  for(const unit of units) await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
  for(const file of ['20261023041600_optimize_public_link_reads.sql','20261027030237_compose_homepage_editions.sql',
    '20261028041629_durable_product_presentation.sql','20261101125432_renew_editorial_pauta.sql',
    '20261101193221_improve_editorial_recommendations.sql','20261102131234_optimize_price_observation_scope.sql',
    '20261020002440_garimpa_comparative_evidence_event.sql','20261111042204_pauta_versioned_selection.sql',
    '20261112002247_capture_atomic_publication.sql']) await fx.pg.exec(await readFile(new URL('../../packages/persistence/supabase/migrations/'+file,import.meta.url),'utf8'));
  await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('capture-account',${tenant},'capture-test','Capture Test'),('capture-other','capture_other','capture-other','Other')`;
  const batch=await makeBatch(), run=await start(batch);
  const a=await store.upsertProductWithObservation(product(run));
  assert.equal(a.isNew,true);
  const replay=await store.upsertProductWithObservation(product(run));
  assert.equal(replay.product.id,a.product.id);
  assert.equal(replay.isNew,false);
  assert.equal(await count('product'),0);
  assert.equal(await count('price_observation'),0);
  await assert.rejects(()=>publishCaptureBatch(fx.clientA,tenant,batch,worker),/capture_publication_incomplete/);
  await finish(run);
  assert.equal(await count('product'),0,'finished child is still invisible');
  await fx.admin`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,stores,shopee,status}','"ok"') where id=${batch}`;
  const before=(await fx.admin`select revision from garimpa.pauta_source_version where tenant_id=${tenant} order by channel`).map((r:any)=>Number(r.revision));
  const [one,two]=await Promise.all([publishCaptureBatch(fx.clientA,tenant,batch,worker),publishCaptureBatch(fx.clientB,tenant,batch,worker)]);
  assert.deepEqual(one,two);
  assert.equal(await count('product'),1);
  assert.equal(await count('price_observation'),1);
  const after=(await fx.admin`select revision from garimpa.pauta_source_version where tenant_id=${tenant} order by channel`).map((r:any)=>Number(r.revision));
  assert.deepEqual(after,before.map((n:number)=>n+1));
  await assert.rejects(()=>store.upsertProductWithObservation(product(run)),/capture_batch_not_writable/);
  console.log('PASS preparação invisível, confirmação concorrente idempotente e uma revisão por canal');

  await fx.admin`update garimpa.capture_batch set status='ok' where id=${batch}`;
  const next=await makeBatch(), nextRun=await start(next), otherRun=await start(next,'q2');
  await store.upsertProductWithObservation(product(nextRun,'one',4500));
  const repeatedNew=await store.upsertProductWithObservation(product(otherRun,'two',3000));
  const duplicateRun=await start(next,'q3');
  const duplicateNew=await store.upsertProductWithObservation(product(duplicateRun,'two',3000));
  assert.equal(duplicateNew.product.id,repeatedNew.product.id,'identity survives repeated products across prepared queries');
  await finish(duplicateRun);
  await finish(nextRun);await finish(otherRun,store,false);
  await fx.admin`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,stores,shopee,status}','"ok"') where id=${next}`;
  await assert.rejects(()=>publishCaptureBatch(fx.clientA,tenant,next,worker),/capture_publication_incomplete/);
  await assert.rejects(()=>withMonitoringDb(fx.clientA,tenant,tx=>tx`select garimpa.publish_capture_runs(${tenant},${[nextRun]},${worker})`),/capture_publication_incomplete/);
  assert.equal(await count('product'),1);
  assert.equal((await fx.admin`select last_price_cents from garimpa.product where external_id='one'`)[0].last_price_cents,5000);
  const checkpoint=await second.startCaptureRun({tenantId:tenant,marketplace:'shopee',collectorRunId:randomUUID(),startedAt:new Date(),parameters:{operationBatchId:next,operationWorkerId:worker,captureQueryId:'q'}});
  assert.equal(checkpoint,nextRun);
  assert.equal((await second.captureRunCheckpoint(checkpoint,tenant))?.itemsCaptured,1);
  const resumed=await start(next,'q2',second);
  assert.equal(resumed,otherRun);
  await second.upsertProductWithObservation(product(resumed,'two',3000));
  await finish(resumed,second);
  // Human decision made while capture is prepared must survive publication.
  await fx.admin`insert into garimpa.product_curation(tenant_id,product_id,status,reason_code)
    select tenant_id,id,'rejected','weak_offer' from garimpa.product where external_id='one'
    on conflict(tenant_id,product_id) do update set status='rejected',reason_code='weak_offer'`;
  await publishCaptureBatch(fx.clientA,tenant,next,worker);
  assert.equal(await count('price_observation'),3);
  assert.equal((await fx.admin`select status from garimpa.product_curation c join garimpa.product p on p.id=c.product_id where p.external_id='one'`)[0].status,'rejected');
  console.log('PASS falha parcial preserva edição, primitive não publica subconjunto e retomada reutiliza checkpoints');
  await fx.admin`update garimpa.capture_batch set status='ok' where id=${next}`;

  const fenced=await makeBatch(), fencedRun=await start(fenced);
  await store.upsertProductWithObservation(product(fencedRun,'three'));
  await fx.admin`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,workerId}','"worker-b"') where id=${fenced}`;
  const reclaimed=await start(fenced,'q',second,'worker-b');
  assert.equal(reclaimed,fencedRun);
  await assert.rejects(()=>store.upsertProductWithObservation(product(fencedRun,'four')),/capture_batch_ownership_lost/);
  await assert.rejects(()=>finish(fencedRun),/capture_batch_ownership_lost/);
  await assert.rejects(()=>publishCaptureBatch(fx.clientA,tenant,fenced,worker),/capture_batch_ownership_lost/);
  await assert.rejects(()=>publishCaptureBatch(fx.clientB,'capture_other',fenced,'worker-b'),/capture_batch_not_found/);
  assert.equal((await withMonitoringDb(fx.clientB,'capture_other',tx=>tx`select * from garimpa.capture_prepared_offer`)).length,0);
  console.log('PASS lease antiga e outra conta não conseguem preparar/publicar');

  const old=await start(undefined,'old');
  await store.upsertProductWithObservation(product(old,'one',9000,new Date(Date.now()-60_000)));
  await finish(old);
  assert.equal((await fx.admin`select last_price_cents from garimpa.product where external_id='one'`)[0].last_price_cents,4500);
  assert.equal(await count('price_observation'),4,'old observation remains in historical record');
  console.log('PASS operação standalone atômica preserva preço mais novo e histórico');
  const historyCount=await count('price_observation');
  await fx.admin`update garimpa.capture_run set parameters=jsonb_set(parameters,'{publishedAt}',to_jsonb((now()-interval '8 days')::text))
    where tenant_id=${tenant} and parameters->>'publishedAt' is not null`;
  const [pruned]=await withMonitoringDb(fx.clientA,tenant,tx=>tx`select garimpa.prune_capture_preparations(${tenant},1) as n`);
  assert.equal(pruned.n,1);
  assert.equal(await count('price_observation'),historyCount);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.capture_prepared_offer where capture_run_id=${fencedRun}`)[0].n,1);
  assert.deepEqual(await publishCaptureBatch(fx.clientA,tenant,batch,worker),one);
  console.log('PASS limpeza limitada preserva operação ativa, auditoria e histórico');
} finally { await fx.close(); }
