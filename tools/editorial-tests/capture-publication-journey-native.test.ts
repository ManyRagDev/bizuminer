import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
import { replacementRollout } from './replacement-rollout.ts';
import { PostgresStore } from '../../packages/persistence/src/pg-store.ts';
import { publishCaptureBatch } from '../../packages/persistence/src/capture-publication.ts';
const require = createRequire(import.meta.url);
const { CaptureBatchStore } = require('../../packages/web/lib/capture-batch-db.ts');
const { executeCaptureBatch } = require('../../packages/web/lib/capture-batch-worker.ts');
const { readLivePauta, confirmPautaExposure } = require('../../packages/web/lib/pauta-db.ts');
const { defaultChannelPolicy } = require('../../packages/web/lib/recommendation-policy.ts');
process.env.DATABASE_URL = 'postgresql://unused-isolated-fixture';
const fx = await nativePostgresFixture();
let products: PostgresStore | undefined;
const account = (tenant:string) => ({tenantId:tenant,affiliateId:`aff_${tenant}`,actor:'human',actorAppUserId:`user_${tenant}`,
  authenticatedAuthUserId:`auth_${tenant}`,membershipRole:'owner',requestId:'journey'});
const files = ['20261023041600_optimize_public_link_reads.sql','20261027030237_compose_homepage_editions.sql',
  '20261028041629_durable_product_presentation.sql','20261101125432_renew_editorial_pauta.sql',
  '20261101193221_improve_editorial_recommendations.sql','20261102131234_optimize_price_observation_scope.sql',
  '20261020002440_garimpa_comparative_evidence_event.sql','20261111042204_pauta_versioned_selection.sql',
  '20261107185200_fix_price_comparability_and_currency_defaults.sql','20261109120000_amazon_monetized_target.sql',
  '20261112002243_capture_durable_execution.sql','20261112002247_capture_atomic_publication.sql',
  '20261112023232_shared_link_archive.sql'];
const started = performance.now();
try {
  const {units}=await replacementRollout();
  for(const unit of units) await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
  for(const file of files) await fx.pg.exec(await readFile(new URL(`../../packages/persistence/supabase/migrations/${file}`,import.meta.url),'utf8'));
  const [{port}]=await fx.admin`select inet_server_port() as port`;
  products = new PostgresStore({connectionString:`postgresql://garimpa_app@localhost:${port}/postgres`,maxConnections:1});
  for(const tenant of ['a','b']) {
    await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values(${`aff_${tenant}`},${tenant},${tenant},${tenant})`;
    await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id) values(${`user_${tenant}`},${tenant},${`auth_${tenant}`})`;
    await fx.admin`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values(${`aff_${tenant}`},${`user_${tenant}`},'owner')`;
    await fx.admin`insert into garimpa.app_user_role(app_user_id,role) values(${`user_${tenant}`},'afiliado')`;
    await fx.admin`insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id) values(${`aff_${tenant}`},'mercadolivre','fixture','tool')`;
    for(const channel of ['whatsapp','stories']) await fx.admin`insert into garimpa.recommendation_channel
      (tenant_id,channel,version,policy_version,enabled,policy) values(${tenant},${channel},1,'recommendation-v1',true,${fx.admin.json(defaultChannelPolicy(channel))})`;
    await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,image_url,last_price_cents,last_seen_at)
      values(${`old_${tenant}`},${tenant},'mercadolivre',${`MLB12345678${tenant==='a'?'1':'2'}`},'Edição anterior',${`https://produto.mercadolivre.com.br/MLB-12345678${tenant==='a'?'1':'2'}`},'https://http2.mlstatic.com/a.jpg',9900,now())`;
    await fx.admin`insert into garimpa.product_curation(tenant_id,product_id,status) values(${tenant},${`old_${tenant}`},'approved')
      on conflict(tenant_id,product_id) do update set status='approved'`;
    await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence)
      values(${`old_obs_${tenant}`},${tenant},${`old_${tenant}`},9900,now(),'{"version":2,"currency":"BRL","priceType":"exact"}')`;
  }
  const batches=new CaptureBatchStore(fx.factoryA);
  const inspection=await promisify(execFile)(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('../../packages/web/bin/inspect-capture-runtime.ts',import.meta.url))],
    {env:{...process.env,DATABASE_URL:`postgresql://garimpa_app@localhost:${port}/postgres`,CAPTURE_WORKER_TENANTS:'a,b',
      CAPTURE_EXECUTOR:'durable',CAPTURE_LISTEN_DATABASE_URL:`postgresql://garimpa_app@localhost:${port}/postgres`}});
  assert.equal(JSON.parse(inspection.stdout).ready,true);
  const before=await readLivePauta(account('a'),'whatsapp',null,fx.factoryA);
  assert.deepEqual(before.products.map((p:any)=>p.id),['old_a']);
  const requestId=randomUUID();
  const batch=await batches.create('a',['shopee','aliexpress'],1,'durable',false,undefined,{requestId});
  assert.equal((await new CaptureBatchStore(fx.factoryB).create('a',['shopee','aliexpress'],1,'durable',false,undefined,{requestId})).id,batch.id);
  const steps:string[]=[]; let publicationMs=0; let captureCalls=0;
  const runStep=async(step:any)=>{
    steps.push(step.kind);
    if(step.kind==='capture') {
      captureCalls++;
      const runId=await products!.startCaptureRun({tenantId:'a',marketplace:step.marketplace,startedAt:new Date(),collectorRunId:randomUUID(),
        parameters:{operationBatchId:batch.id,operationWorkerId:step.workerId,captureQueryId:'fixture'}});
      for(let i=0;i<20;i++) {
        const offer={captureRunId:runId,tenantId:'a',marketplace:step.marketplace,externalId:`${100000+i}`,title:`Oferta ${step.marketplace} ${i}`,
          productUrl:step.marketplace==='shopee'?`https://shopee.com.br/product/100/${100000+i}`:`https://pt.aliexpress.com/item/${100000+i}.html`,
          imageUrl:'https://example.test/p.jpg',priceCents:5000+i*100,observedAt:new Date(),offerEvidence:{version:2,currency:'BRL',priceType:'exact'}};
        await products!.upsertProductWithObservation(offer as any);
        if(i===0) await products!.upsertProductWithObservation(offer as any); // Technical replay.
      }
      const during=await readLivePauta(account('a'),'whatsapp',null,fx.factoryB);
      assert.deepEqual(during.products.map((p:any)=>p.id),['old_a']);
      assert.equal((await fx.admin`select count(*)::int n from garimpa.product where tenant_id='a'`)[0].n,1);
      await products!.finishCaptureRun(runId,{tenantId:'a',status:'ok',finishedAt:new Date(),itemsCaptured:20,itemsNew:20,priceChanges:0});
      return {ok:true};
    }
    if(step.kind==='publish') {
      const [version]=await fx.admin`select revision from garimpa.pauta_source_version where tenant_id='a' and channel='whatsapp'`;
      const start=performance.now();
      const publication=await publishCaptureBatch(fx.clientA,'a',batch.id,step.workerId);
      publicationMs=performance.now()-start;
      assert.equal(publication.observations,40);
      assert.deepEqual(await publishCaptureBatch(fx.clientA,'a',batch.id,step.workerId),publication);
      assert.equal(Number((await fx.admin`select revision from garimpa.pauta_source_version where tenant_id='a' and channel='whatsapp'`)[0].revision),Number(version.revision)+1);
      assert.equal((await fx.admin`select count(*)::int n from garimpa.price_observation where tenant_id='a'`)[0].n,41);
      return {ok:true};
    }
    if(step.kind==='affiliate') {
      await fx.admin`insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug,affiliate_url)
        select 'pub-'||id,tenant_id,id,'aff_a','web','fixture-'||id,
        case marketplace when 'shopee' then 'https://shopee.ee/fixture' else 'https://s.click.aliexpress.com/e/fixture' end
        from garimpa.product where tenant_id='a' and marketplace=${step.marketplace}
        on conflict(affiliate_id,product_id,channel) do nothing`;
      return {ok:true};
    }
    // Provider/AI boundary is synthetic; actual database decisions remain durable.
    await fx.admin`insert into garimpa.product_curation(tenant_id,product_id,status)
      select tenant_id,id,'approved' from garimpa.product where tenant_id='a'
      on conflict(tenant_id,product_id) do update set status='approved'`;
    return {ok:true,triage:{processed:40,approved:40,held:0,rejected:0,annotatedPending:0}};
  };
  assert.equal(await executeCaptureBatch(batch.id,runStep,batches,'a'),true);
  assert.deepEqual(steps,['capture','capture','publish','affiliate','affiliate','triage']);
  assert.equal((await batches.publicStatus(batch.id,'a')).status,'ok');
  assert.equal(await executeCaptureBatch(batch.id,runStep,batches,'a'),false);
  assert.equal(captureCalls,2);
  const cold=performance.now();
  const published=await readLivePauta(account('a'),'whatsapp',null,fx.factoryB);
  const compositionMs=performance.now()-cold;
  assert.ok(published.products.some((p:any)=>p.id!=='old_a'));
  assert.deepEqual((await readLivePauta(account('b'),'whatsapp',null,fx.factoryA)).products.map((p:any)=>p.id),['old_b']);
  const reopened=await readLivePauta(account('a'),'whatsapp',null,fx.factoryA);
  assert.deepEqual(reopened.products.map((p:any)=>p.id),published.products.map((p:any)=>p.id));
  const chosen=published.products[0];
  assert.equal(await confirmPautaExposure(account('a'),'whatsapp',chosen.confirmationId,chosen.id,fx.factoryA),true);
  assert.equal(await confirmPautaExposure(account('a'),'whatsapp',chosen.confirmationId,chosen.id,fx.factoryB),true);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.recommendation_exposure where tenant_id='a'`)[0].n,1);
  const stable=await readLivePauta(account('a'),'whatsapp',null,fx.factoryA);
  const failed=await batches.create('a',['shopee'],1,'durable',false,undefined,{requestId:randomUUID()});
  await executeCaptureBatch(failed.id,async(step:any)=>{
    assert.equal(step.kind,'capture');
    const runId=await products!.startCaptureRun({tenantId:'a',marketplace:'shopee',startedAt:new Date(),collectorRunId:randomUUID(),parameters:{operationBatchId:failed.id,operationWorkerId:step.workerId}});
    await products!.upsertProductWithObservation({tenantId:'a',captureRunId:runId,marketplace:'shopee',externalId:'failed-product',title:'Não pode aparecer',productUrl:'https://shopee.com.br/failure',priceCents:100,observedAt:new Date()});
    return {ok:false,error:'fixture_provider_failure'};
  },batches,'a');
  assert.deepEqual((await readLivePauta(account('a'),'whatsapp',null,fx.factoryB)).products.map((p:any)=>p.id),stable.products.map((p:any)=>p.id));
  assert.equal((await fx.admin`select count(*)::int n from garimpa.product where external_id='failed-product'`)[0].n,0);
  console.log('PASS jornada nativa: pedido repetido → 2 fontes/40 ofertas → staging invisível → publicação/replay → triagem → pauta/reabertura → divulgação idempotente; conta B isolada e falha preserva edição');
  console.log(JSON.stringify({fixture:'PostgreSQL local; provedores e IA sintéticos',products:40,technicalReplays:2,publicationMs:Math.round(publicationMs),compositionMs:Math.round(compositionMs),responseBytes:Buffer.byteLength(JSON.stringify(published)),totalMs:Math.round(performance.now()-started)}));
} finally { await products?.close(); await fx.close(); }
