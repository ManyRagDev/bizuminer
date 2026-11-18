import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {commercialFixture} from './commercial-fixture.ts';
const require=createRequire(import.meta.url);
const {readOperationProgress,readProcessingProgress,readOperationHistory}=require('../../packages/web/lib/operation-progress-db.ts');
const {readCurationAutomation}=require('../../packages/web/lib/curation-automation.ts');
const {inAccountScope}=require('../../packages/web/lib/account-scope.ts');
const {persistManualExtensionBatch}=require('../../packages/web/lib/extension-db.ts');
const {validateBrowserCaptureWithDiagnostics}=require('../../packages/web/lib/browser-capture-contract.ts');
const {enqueueAttributeDeltasBatch,claimAttributeJobs,finishAttributeJob,reconcileAttributeJobs,recoverExpiredAttributeJobs,recordAttributeConfigurationWait}=require('../../packages/web/lib/curation-attributes-db.ts');
const {recomputeCurationScores}=require('../../packages/web/lib/curation-score-db.ts');
const {curationDiagnostic}=require('../../packages/web/lib/curation-diagnostic.ts');
const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');
const {validOperationProgress,progressScope}=require('../../packages/web/lib/operation-progress.ts');
process.env.DATABASE_URL='postgresql://isolated-unused';
const fx=await commercialFixture(),sql=fx.factory();
const account=(id:string,role='owner')=>({tenantId:id,affiliateId:`aff_${id}`,actor:'human',actorAppUserId:`u_${id}`,authenticatedAuthUserId:`auth_${id}`,membershipRole:role,requestId:'phase3'});
const a=account('progress_a'),b=account('progress_b');
const device={deviceId:'dev_progress',tenantId:a.tenantId,affiliateId:a.affiliateId,appUserId:a.actorAppUserId,affiliatePublicSlug:'progress-a',affiliateDisplayName:'A'};
const raw=(requestId:string,ids:number[])=>({version:1,requestId,marketplace:'mercadolivre',clientCapturedAt:new Date().toISOString(),page:{kind:'offers',url:'https://www.mercadolivre.com.br/ofertas'},products:ids.map(i=>({externalId:`MLB${1234567000+i}`,title:`Produto ${i}`,priceCents:9900,currency:'BRL',priceType:'exact',productUrl:`https://produto.mercadolivre.com.br/MLB-${1234567000+i}-produto`}))});
const ingest=async(request:string,ids:number[])=>{const {payload,diagnostics}=validateBrowserCaptureWithDiagnostics(raw(request,ids));return persistManualExtensionBatch(device,payload,fx.factory,diagnostics);};
const progress=(options={},context=a)=>inAccountScope(context,()=>readOperationProgress(context,options,fx.factory));
const history=(after?:string)=>inAccountScope(a,()=>readOperationHistory(a,after,fx.factory));
const rows=async(q:string,values:unknown[]=[])=> (await fx.pg.query(q,values)).rows as any[];
try{
  const directory=new URL('../../packages/persistence/supabase/migrations/',import.meta.url);
  for(const file of (await readdir(directory)).filter(f=>/^\d{14}_/.test(f)&&f>'20261015040727'&&f.endsWith('.sql')).sort())await fx.pg.exec(await readFile(new URL(file,directory),'utf8'));
  await fx.pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_progress_a','progress_a','progress-a','A'),('aff_progress_b','progress_b','progress-b','B');
    insert into garimpa.app_user(id,tenant_id,auth_user_id) values('u_progress_a','progress_a','auth_progress_a'),('u_progress_b','progress_b','auth_progress_b'),('u_progress_op','progress_a','auth_progress_op');
    insert into garimpa.app_user_role(app_user_id,role) values('u_progress_a','afiliado'),('u_progress_b','afiliado'),('u_progress_op','afiliado');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_progress_a','u_progress_a','owner'),('aff_progress_b','u_progress_b','owner'),('aff_progress_a','u_progress_op','operator');
    insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash) values('dev_progress','aff_progress_a','u_progress_a','A','test-progress-token');
    insert into garimpa.curation_policy_v2(tenant_id,enabled,config) values('progress_a',true,'{}');`);
  const first=await ingest('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',[1]);
  const second=await ingest('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',[2]);
  await enqueueAttributeDeltasBatch(sql,a.tenantId,'fixture:model',100);
  let state=await progress();assert.equal(state.evaluation.queued,2);assert.equal(state.evaluation.running,0);assert.equal(state.poll.active,true);
  assert.equal((await progress({productIds:first.productIds})).evaluation.queued,1);assert.equal((await progress({productIds:second.productIds})).evaluation.queued,1);
  const claims=await claimAttributeJobs(sql,a.tenantId,20,1,'fixture:model');assert.equal(claims.length,2);
  const finish=claims.find((j:any)=>j.snapshot.input.productId===first.productIds[0]);
  assert.equal(await finishAttributeJob(sql,a.tenantId,finish,{productId:first.productIds[0],qualidade:8,genuinidade_oferta:8,apelo_whatsapp:8,categoria:'Tecnologia',flags:[],confianca:.9,justificativa:'Oferta útil.',fatos_usados:['titulo'],duvidas:[]}), 'completed');
  const uncertain=claims.filter((j:any)=>j.id!==finish.id);
  const secretError={kind:'credential',message:'SECRET_KEY provider raw body',code:'SECRET_KEY'};
  await reconcileAttributeJobs(sql,a.tenantId,uncertain,curationDiagnostic(secretError,'provider'));
  assert.doesNotMatch(JSON.stringify(await rows('select diagnostic from garimpa.curation_attribute_job')),/SECRET_KEY|raw body/);
  await recomputeCurationScores(sql,a.tenantId,'fixture:model');
  state=await progress();assert.equal(state.evaluation.recorded,1);assert.equal(state.evaluation.compatible,1);assert.equal(state.evaluation.uncertain,1);
  assert.equal(state.evaluation.reused,0);
  await ingest('cccccccc-cccc-4ccc-8ccc-cccccccccccc',[1]);
  await enqueueAttributeDeltasBatch(sql,a.tenantId,'fixture:model',100);
  await recomputeCurationScores(sql,a.tenantId,'fixture:model');
  state=await progress();assert.equal(state.evaluation.compatible,1);assert.equal(state.evaluation.reused,1,'canonical gate proves reuse for a new compatible observation');
  assert.equal(state.evaluation.queued,0);
  const third=await ingest('dddddddd-dddd-4ddd-8ddd-dddddddddddd',[3]);
  await enqueueAttributeDeltasBatch(sql,a.tenantId,'fixture:model',100);
  await fx.pg.exec(`update garimpa.curation_external_budget set configured_limit=1 where tenant_id='progress_a' and kind='ai'`);
  state=await progress();assert.equal(state.evaluation.quota,1);assert.equal(state.evaluation.queued,0);assert.equal(state.poll.active,false);assert.ok(state.poll.nextAt);
  await fx.pg.exec(`update garimpa.curation_external_budget set configured_limit=10 where tenant_id='progress_a' and kind='ai';
    insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,status,started_at,finished_at,metadata)
      values('11111111-1111-4111-8111-111111111111','progress_a',array['shopee'],1,'partial',now(),now(),'{"execution":{"phase":"finished","error":"affiliate_links_pending"}}');`);
  state=await progress();assert.equal(state.evaluation.queued,1);assert.equal(state.evaluation.uncertain,1);assert.equal(state.captures.items.length,1,'a failed/partial receipt does not replace pending work from other imports');
  await recordAttributeConfigurationWait(sql,a.tenantId,'fixture:model');
  state=await progress();assert.equal(state.evaluation.waiting,1);assert.equal(state.evaluation.uncertain,1);assert.equal(state.evaluation.queued,0);
  assert.ok(state.problems.some((p:any)=>p.category==='configuration'));
  const resumed=await claimAttributeJobs(sql,a.tenantId,1,10,'fixture:model');assert.equal(resumed.length,1);
  state=await progress();assert.equal(state.evaluation.running,1);assert.equal(state.evaluation.waiting,0);
  await fx.pg.exec(`update garimpa.curation_attribute_job set lease_until=now()-interval '1 minute' where tenant_id='progress_a' and product_id='${third.productIds[0]}' and status='running'`);
  state=await progress();assert.equal(state.evaluation.expiredLease,1);assert.equal(state.evaluation.running,0);assert.equal(state.poll.active,false);
  await recoverExpiredAttributeJobs(sql,a.tenantId);
  state=await progress();assert.equal(state.evaluation.uncertain,2);assert.ok(state.problems.some((p:any)=>p.message.includes('prazo')));
  const [observation]=await rows('select id,option_key from garimpa.price_observation where product_id=$1 order by observed_at desc,id desc limit 1',[first.productIds[0]]);
  await fx.pg.query(`insert into garimpa.curation_promotion(tenant_id,product_id,option_key,price_type,requested_observation_id,requested_revision,policy_version,reason,status,deadline,result)
    values('progress_a',$1,$2,'exact',$3,'revision',1,'promotion','pending',now()+interval '1 hour','{}')`,[first.productIds[0],observation.option_key,observation.id]);
  state=await progress();assert.equal(state.preparation.browser,1);assert.equal(state.poll.active,false);
  await fx.pg.exec(`insert into garimpa.curation_attribute_job(tenant_id,product_id,observation_id,input_fingerprint,input_snapshot,status)
    select 'progress_a','${first.productIds[0]}','${observation.id}',lpad(i::text,64,'0'),'{}','superseded' from generate_series(1,35) i;`);
  const historical=await history();assert.equal(historical.items.length,30);assert.ok(historical.next);
  const historicalNext=await history(historical.next);assert.ok(historicalNext.items.length>0);
  assert.ok(historical.items.some((e:any)=>e.state==='superseded'));assert.equal(new Set([...historical.items,...historicalNext.items].map((e:any)=>e.id)).size,historical.items.length+historicalNext.items.length);
  await fx.pg.exec(`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,first_seen_at,last_seen_at)
    select 'extra-'||i,'progress_a','aliexpress',(1005000000000000+i)::text,'Oferta extra '||i,'https://www.aliexpress.com/item/'||(1005000000000000+i)::text||'.html',9900,now(),now() from generate_series(1,35) i;
    insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,capture_source) select 'extra-observation-'||i,'progress_a','extra-'||i,9900,now(),'extension' from generate_series(1,35) i;
    insert into garimpa.curation_attribute_job(tenant_id,product_id,observation_id,input_fingerprint,input_snapshot,status)
      select 'progress_a','extra-'||i,'extra-observation-'||i,repeat('f',64),'{}','reconciliation' from generate_series(1,35) i;`);
  state=await progress();assert.equal(state.evaluation.uncertain,37);assert.ok(state.links.missing>=35);
  const pending=await progress({category:'uncertain'});assert.equal(pending.problems.length,30);assert.ok(pending.problemsNext);
  const nextPending=await progress({category:'uncertain',after:pending.problemsNext});assert.equal(nextPending.problems.length,7);
  assert.equal(new Set([...pending.problems,...nextPending.problems].map((p:any)=>p.id)).size,37);
  assert.ok(nextPending.problems.every((p:any)=>p.category==='uncertain'));
  await assert.rejects(progress({category:'link',after:pending.problemsNext}),/invalid_capture_filter/);
  // Inject exactly one read failure, retaining real SQL/RLS for the other sections.
  const failStoriesFactory=()=>{
    const wrap=(base:any):any=>{
      const proxy:any=(parts:any,...values:any[])=>{
        if(parts.join('').includes('from garimpa.pauta_selection_cache c join')&&values.includes('stories'))throw new Error('SECRET dependency error');
        return base(parts,...values);
      };
      proxy.json=base.json;proxy.unsafe=base.unsafe;proxy.end=base.end;
      proxy.begin=(...args:any[])=>base.begin(...args.slice(0,-1),(tx:any)=>args.at(-1)(wrap(tx)));return proxy;
    };return wrap(fx.factory());
  };
  const partial=await inAccountScope(a,()=>readOperationProgress(a,{},failStoriesFactory));
  assert.equal(partial.availability.stories,false);assert.equal(partial.availability.whatsapp,true);assert.equal(partial.evaluation.uncertain,37);assert.equal(partial.poll.active,false);
  assert.doesNotMatch(JSON.stringify(partial),/SECRET/);
  assert.ok(validOperationProgress(state,a.tenantId,progressScope()));
  const initial=await inAccountScope(a,()=>readCurationAutomation(a,fx.factory));assert.equal(initial.uncertain,state.evaluation.uncertain);assert.equal(initial.queued,state.evaluation.queued);
  const foreign=await progress({},b);assert.equal(foreign.evaluation,null);assert.equal(foreign.problems.length,0);assert.equal(foreign.captures.items.length,0);
  assert.equal((await progress({productIds:b.tenantId===a.tenantId?[]:first.productIds},b)).pauta.whatsapp.products.length,0);
  const op={...a,actorAppUserId:'u_progress_op',authenticatedAuthUserId:'auth_progress_op',membershipRole:'operator'};
  const operatorState=await progress({},op);assert.equal(operatorState.evaluation.uncertain,state.evaluation.uncertain,'operator must not see false zero');
  assert.ok((await inAccountScope(op,()=>readOperationHistory(op,undefined,fx.factory))).items.some((i:any)=>i.state==='reconciliation'));
  const privateRows=await withAccountDb(op,(tx:any)=>tx`select id from garimpa.curation_attribute_job`,fx.factory);assert.equal(privateRows.length,0,'raw jobs remain owner-only');
  const columns=await rows(`select column_name from information_schema.columns where table_schema='garimpa' and table_name='curation_operation_job'`);
  assert.ok(!columns.some((c:any)=>['input_snapshot','worker_id','input_fingerprint'].includes(c.column_name)));
  assert.equal((await rows(`select has_table_privilege('anon','garimpa.curation_operation_job','select') exposed`))[0].exposed,false);
  const [job]=await rows(`select id from garimpa.curation_attribute_job where tenant_id='progress_a' and status='reconciliation' limit 1`);
  await assert.rejects(withAccountDb(op,(tx:any)=>tx`select garimpa.release_uncertain_attribute_job(${a.tenantId},${job.id}::uuid,'conferido')`,fx.factory),/reconciliation_forbidden/);
  const snapshot=()=>rows(`select (select count(*) from garimpa.price_observation) observations,(select count(*) from garimpa.publication) publications,
    (select count(*) from garimpa.recommendation_edition_archive) editions,(select sum(consumed) from garimpa.curation_external_budget) consumed,
    (select jsonb_agg(jsonb_build_array(id,status,attempts,updated_at)) from (select * from garimpa.curation_attribute_job order by id) j) jobs`);
  const before=JSON.stringify(await snapshot());await progress();await progress({productIds:first.productIds});await history();assert.equal(JSON.stringify(await snapshot()),before);
  const [release]=await withAccountDb(a,(tx:any)=>tx`select garimpa.release_uncertain_attribute_job(${a.tenantId},${job.id}::uuid,'Conferido no ambiente de teste isolado') as released`,fx.factory);
  assert.equal(release.released,true);
  const [duplicate]=await withAccountDb(a,(tx:any)=>tx`select garimpa.release_uncertain_attribute_job(${a.tenantId},${job.id}::uuid,'Conferência repetida no teste') as released`,fx.factory);
  assert.equal(duplicate.released,false);
  assert.ok((await history()).items.some((i:any)=>i.state==='released'));
  assert.ok(!(await inAccountScope(op,()=>readOperationHistory(op,undefined,fx.factory))).items.some((i:any)=>i.state==='released'));
  assert.equal((await rows(`select count(*)::int n from garimpa.curation_attribute_reconciliation where job_id=$1`,[job.id]))[0].n,1);
  await fx.pg.exec(`update garimpa.affiliate_membership set revoked_at=now() where app_user_id='u_progress_a'`);
  await assert.rejects(inAccountScope(a,()=>readProcessingProgress(a,undefined,fx.factory)),/forbidden/);
  assert.ok(Object.values((await progress()).availability).every(v=>v===false));
  await fx.pg.exec('drop view garimpa.curation_operation_job');
  await assert.rejects(inAccountScope(op,()=>readProcessingProgress(op,undefined,fx.factory)),/operation_reader_unavailable/);
  const oldSchema=await progress({},op);assert.equal(oldSchema.availability.processing,false);assert.equal(oldSchema.evaluation,null);
  console.log('PASS phase 3 SQL/RLS: simultaneous receipts, compatible reused assessment, current versus superseded jobs, quota/lease/browser waits, sanitized uncertain diagnostics, paginated v2 history, owner/operator/foreign/revoked isolation and strictly read-only status.');
}finally{await fx.pg.close();}
