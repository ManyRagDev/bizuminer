/** Phase 2: receipts + batches + internal runs, real isolated SQL/RLS. */
import assert from 'node:assert/strict';
import { readFile,readdir,writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { commercialFixture } from './commercial-fixture.ts';
const require=createRequire(import.meta.url);
const {persistManualExtensionBatch,manualExtensionItemRequestId,persistExtensionCapture}=require('../../packages/web/lib/extension-db.ts');
const {validateBrowserCaptureWithDiagnostics}=require('../../packages/web/lib/browser-capture-contract.ts');
const {readCaptureActivities,readCaptureActivity}=require('../../packages/web/lib/capture-activity-db.ts');
const {inAccountScope}=require('../../packages/web/lib/account-scope.ts');
const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');
process.env.DATABASE_URL='postgresql://isolated-fixture-unused';
let listSql='';
const fx=await commercialFixture({onQuery(query){if(!listSql && query.includes('as cursor_at from activities'))listSql=query;}});
const directory=new URL('../../packages/persistence/supabase/migrations/',import.meta.url);
const a={tenantId:'history_a',affiliateId:'aff_history_a',actor:'human',actorAppUserId:'history_owner',authenticatedAuthUserId:'auth_history_owner',membershipRole:'owner',requestId:'history-test'};
const op={...a,actorAppUserId:'history_operator',authenticatedAuthUserId:'auth_history_operator',membershipRole:'operator'};
const b={...a,tenantId:'history_b',affiliateId:'aff_history_b',actorAppUserId:'history_b',authenticatedAuthUserId:'auth_history_b'};
const device=(operator=false)=>({deviceId:operator?'history_dev_operator':'history_dev',tenantId:a.tenantId,affiliateId:a.affiliateId,
  appUserId:operator?op.actorAppUserId:a.actorAppUserId,affiliatePublicSlug:'history-a',affiliateDisplayName:'Histórico A'});
const list=(input:Record<string,unknown>={},context=a)=>inAccountScope(context,()=>readCaptureActivities(context,input,fx.factory));
const detail=(ref:string,input:Record<string,unknown>={},context=a)=>inAccountScope(context,()=>readCaptureActivity(context,ref,input,fx.factory));
try {
  for(const file of (await readdir(directory)).filter(f=>/^\d{14}_/.test(f)&&f>'20261015040727'&&f.endsWith('.sql')).sort()) await fx.pg.exec(await readFile(new URL(file,directory),'utf8'));
  await fx.pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name)
    values('aff_history_a','history_a','history-a','A'),('aff_history_b','history_b','history-b','B');
    insert into garimpa.app_user(id,tenant_id,auth_user_id) values('history_owner','history_a','auth_history_owner'),('history_operator','history_a','auth_history_operator'),('history_b','history_b','auth_history_b');
    insert into garimpa.app_user_role(app_user_id,role) values('history_owner','afiliado'),('history_operator','afiliado'),('history_b','afiliado');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_history_a','history_owner','owner'),('aff_history_a','history_operator','operator'),('aff_history_b','history_b','owner');
    insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash) values('history_dev','aff_history_a','history_owner','A','history-token-a'),('history_dev_operator','aff_history_a','history_operator','Operador','history-token-op');`);
  const imports:any[]=[];
  for(const [store,size,distinct] of [['mercadolivre',60,145],['amazon',60,153],['aliexpress',46,99]] as const) {
    for(const start of [0,Math.floor((distinct-size)/2),distinct-size]) {
      const requestId=`aaaaaaaa-aaaa-4aaa-8aaa-${String(imports.length+1).padStart(12,'0')}`;
      const products=Array.from({length:size},(_,i)=>{
        const index=start+i,externalId=store==='mercadolivre'?`MLB${1234000000+index}`:store==='amazon'?`B0${String(index).padStart(8,'0')}`:String(1005000000000000+index);
        return {externalId,title:`Produto ${store} ${index}`,priceCents:1000+index,productUrl:store==='mercadolivre'?`https://produto.mercadolivre.com.br/MLB-${externalId.slice(3)}-produto`:store==='amazon'?`https://www.amazon.com.br/dp/${externalId}`:`https://www.aliexpress.com/item/${externalId}.html`};
      });
      const raw={version:1,requestId,marketplace:store,clientCapturedAt:new Date().toISOString(),page:{kind:'offers',url:store==='mercadolivre'?'https://www.mercadolivre.com.br/ofertas?token=SECRET':store==='amazon'?'https://www.amazon.com.br/deals?session=SECRET':'https://www.aliexpress.com/w/wholesale.html?session=SECRET'},products:[...products,products[0],{externalId:'bad',title:'bad',priceCents:0}]};
      const {payload,diagnostics}=validateBrowserCaptureWithDiagnostics(raw),d=device(store==='amazon');
      const result=await persistManualExtensionBatch(d,payload,fx.factory,diagnostics);
      assert.equal(result.importedCount,size);assert.equal(result.replayed,false);
      imports.push({payload,diagnostics,device:d,result});
      const [sqlIdentity]=(await fx.pg.query(`select garimpa.manual_extension_item_request_id($1,$2::uuid,$3,$4)::text as id`,[d.deviceId,requestId,store,payload.products[0].externalId])).rows as any[];
      assert.equal(sqlIdentity.id,manualExtensionItemRequestId(d.deviceId,requestId,store,payload.products[0].externalId));
    }
  }
  const [factStats]=(await fx.pg.query(`select count(*)::int observations,count(distinct product_id)::int products from garimpa.price_observation where tenant_id='history_a'`)).rows as any[];
  assert.deepEqual(factStats,{observations:498,products:397});
  const [receiptStats]=(await fx.pg.query(`select sum((result#>>'{counts,productsCreated}')::int)::int created,
    sum((result#>>'{counts,productsUpdated}')::int)::int updated,sum((result#>>'{counts,received}')::int)::int received,
    sum((result#>>'{counts,rejected}')::int)::int rejected,sum((result#>>'{counts,duplicates}')::int)::int duplicates from garimpa.extension_capture_receipt`)).rows as any[];
  assert.deepEqual(receiptStats,{created:397,updated:101,received:516,rejected:9,duplicates:9});
  const beforeReplay=JSON.stringify((await fx.pg.query(`select result,fingerprint from garimpa.extension_capture_receipt order by request_id`)).rows);
  const replay=await persistManualExtensionBatch(imports[0].device,imports[0].payload,fx.factory,{...imports[0].diagnostics,rejected:99});
  assert.equal(replay.importedCount,0);assert.equal(replay.replayed,true);
  assert.equal(JSON.stringify((await fx.pg.query(`select result,fingerprint from garimpa.extension_capture_receipt order by request_id`)).rows),beforeReplay);
  await assert.rejects(persistManualExtensionBatch(imports[0].device,{...imports[0].payload,products:imports[0].payload.products.map((p:any)=>({...p,priceCents:9999}))},fx.factory),/capture_request_conflict/);
  const batchId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await fx.pg.exec(`insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,status,started_at,finished_at,metadata)
    values('${batchId}','history_a',array['shopee'],2,'partial',now()-interval '1 hour',now(),'{"execution":{"phase":"finished","error":"affiliate_links_pending"}}');
    insert into garimpa.capture_run(id,tenant_id,marketplace,started_at,finished_at,status,items_captured,parameters)
      select 'batch-search-'||i,'history_a','shopee',now()-interval '1 hour',now(),'ok',case when i=12 then 22 else 18 end,jsonb_build_object('operationBatchId','${batchId}') from generate_series(1,12) i;
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,first_seen_at,last_seen_at)
      select 'shopee-'||i,'history_a','shopee',i::text,'Shopee '||i,'https://shopee.com.br/product/1/'||i,9900,now(),now() from generate_series(1,216) i;
    insert into garimpa.price_observation(id,tenant_id,product_id,capture_run_id,price_cents,observed_at,title_snapshot,capture_source)
      select 'batch-observation-'||i,'history_a','shopee-'||(case when i>216 then i-216 else i end),'batch-search-'||least(12,1+(i-1)/18),9900,now(),'Shopee recebido '||i,'sweep' from generate_series(1,220) i;
    insert into garimpa.capture_run(id,tenant_id,marketplace,started_at,finished_at,status,items_captured,parameters,error)
      select 'verification-'||i,'history_a','shopee',now()+i*interval '1 second',now(),'ok',0,'{"captureMode":"verification"}',case when i=1 then 'SECRET provider password' end from generate_series(1,71) i;`);
  await fx.pg.exec('analyze garimpa.price_observation; analyze garimpa.product; analyze garimpa.extension_capture_receipt; analyze garimpa.capture_run; analyze garimpa.capture_batch; analyze garimpa.affiliate_account;');
  let page=await list({limite:3}),activities=[...page.items];
  while(page.nextCursor) {page=await list({limite:3,depois:page.nextCursor});activities.push(...page.items);}
  assert.equal(activities.length,10);assert.equal(activities.filter((r:any)=>r.origin==='manual').length,9);assert.ok(activities.some((r:any)=>r.reference===`batch:${batchId}`));
  assert.equal(new Set(activities.map((r:any)=>r.reference)).size,10);
  const plan=await withAccountDb(a,(tx:any)=>tx.unsafe('explain (analyze,buffers,format json) '+listSql,[a.tenantId,null,null,'capturas',null,null,null,null,null,null,4]),fx.factory);
  if(process.env.CAPTURE_HISTORY_EXPLAIN_PATH) await writeFile(process.env.CAPTURE_HISTORY_EXPLAIN_PATH,JSON.stringify(plan,null,2));
  assert.equal((await list({loja:'amazon'})).items.length,3);
  let internal=await list({finalidade:'internas',limite:100});assert.equal(internal.items.length,71);assert.ok(internal.items.every((r:any)=>r.purpose==='internal'));
  assert.doesNotMatch(JSON.stringify(internal),/SECRET/);
  const batch=await detail(`batch:${batchId}`,{limite:5});
  assert.equal(batch.activity.counts.products,216);assert.equal(batch.activity.counts.observationsSaved,220);assert.equal(batch.searchSummary.total,12);assert.equal(batch.searchSummary.reported,220);
  let productCount=batch.products.items.length,pnext=batch.products.nextCursor;
  while(pnext){const next=await detail(`batch:${batchId}`,{limite:5,produtosDepois:pnext});productCount+=next.products.items.length;pnext=next.products.nextCursor;}
  assert.equal(productCount,216);
  let searchCount=batch.searches.items.length,snext=batch.searches.nextCursor;
  while(snext){const next=await detail(`batch:${batchId}`,{limite:5,buscasDepois:snext});searchCount+=next.searches.items.length;snext=next.searches.nextCursor;}
  assert.equal(searchCount,12);
  const manual=await detail(imports[0].result.receiptRef);
  assert.equal(manual.activity.counts.received,62);assert.equal(manual.activity.counts.valid,60);assert.equal(manual.activity.counts.duplicates,1);assert.equal(manual.activity.counts.rejected,1);
  assert.equal(manual.activity.counts.productsCreated,60);assert.equal(manual.activity.counts.observationsSaved,60);
  assert.doesNotMatch(JSON.stringify(manual),/SECRET|history-token/);
  await fx.pg.exec(`update garimpa.extension_capture_receipt set result=jsonb_build_object('productIds',result->'productIds') where request_id='${imports[0].payload.requestId}';`);
  const old=await detail(imports[0].result.receiptRef);
  assert.equal(old.activity.receiptVersion,1);assert.equal(old.activity.counts.received,null);assert.equal(old.activity.counts.productsCreated,null);assert.equal(old.activity.counts.observationsSaved,60);
  const first=old.products.items[0];
  await fx.pg.exec(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,capture_source) values('later-price','history_a','${first.id}',777,now()+interval '5 minutes','legacy')`);
  const changed=await detail(imports[0].result.receiptRef);
  assert.equal(changed.products.items[0].original.priceCents,first.original.priceCents);assert.equal(changed.products.items[0].current.priceCents,777);
  await fx.pg.exec(`insert into garimpa.extension_capture_receipt(tenant_id,device_id,request_id,fingerprint,result) values('history_a','history_dev','cccccccc-cccc-4ccc-8ccc-cccccccccccc',repeat('c',64),jsonb_build_object('productIds',jsonb_build_array('${first.id}')))`);
  const missing=await detail('manual:history_dev:cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert.equal(missing.historicalComplete,false);assert.equal(missing.products.items[0].original,null);assert.equal(missing.activity.counts.observationsSaved,null);assert.equal(missing.products.items[0].current.priceCents,777);
  assert.ok((await list({origem:'individual'})).items.some((r:any)=>r.reference==='individual:later-price'));
  assert.equal((await list({},b)).items.length,0);assert.equal(await detail(imports[0].result.receiptRef,{},b),null);assert.equal(await detail(`batch:${batchId}`,{},b),null);
  await assert.rejects(inAccountScope(b,()=>readCaptureActivities(a,{},fx.factory)),/forbidden_account_scope/);
  await fx.pg.exec(`update garimpa.extension_device set revoked_at=now() where id='history_dev'`);
  assert.ok((await list({},op)).items.some((r:any)=>r.reference===imports[0].result.receiptRef));
  assert.ok(await detail(imports[3].result.receiptRef)); // owner's view of operator's device
  await assert.rejects(persistManualExtensionBatch(imports[0].device,imports[0].payload,fx.factory),/affiliate_access_required/);
  await assert.rejects(withAccountDb(op,(tx:any)=>tx`insert into garimpa.extension_capture_receipt(tenant_id,device_id,request_id,fingerprint,result) values('history_a','history_dev',gen_random_uuid(),${'a'.repeat(64)},'{}')`,fx.factory),/row-level security/);
  const firstPage=await list({limite:2});
  for(const filter of [{limite:0},{limite:101},{loja:'bad'},{de:'2026-02-30'},{depois:'not-a-cursor'},{de:'2026-11-16',ate:'2026-11-15'},{loja:'amazon',limite:2,depois:firstPage.nextCursor}]) await assert.rejects(list(filter),/invalid_capture_filter/);
  const beforeReads=JSON.stringify((await fx.pg.query(`select (select count(*) from garimpa.price_observation) observations,(select count(*) from garimpa.publication) publications,(select count(*) from garimpa.curation_attribute_job) jobs,(select count(*) from garimpa.extension_capture_receipt) receipts,(select count(*) from garimpa.capture_batch) batches`)).rows);
  await list();await detail(`batch:${batchId}`);await detail(imports[0].result.receiptRef);
  assert.equal(JSON.stringify((await fx.pg.query(`select (select count(*) from garimpa.price_observation) observations,(select count(*) from garimpa.publication) publications,(select count(*) from garimpa.curation_attribute_job) jobs,(select count(*) from garimpa.extension_capture_receipt) receipts,(select count(*) from garimpa.capture_batch) batches`)).rows),beforeReads);
  await fx.pg.exec(`update garimpa.affiliate_membership set revoked_at=now() where app_user_id='history_operator'`);
  await assert.rejects(list({},op),/forbidden/);
  const [acl]=(await fx.pg.query(`select has_table_privilege('anon','garimpa.extension_capture_receipt','select') as anon_read,
    has_table_privilege('authenticated','garimpa.extension_capture_receipt','select') as authenticated_read,
    p.prosecdef as definer from pg_proc p where p.oid='garimpa.manual_extension_item_request_id(text,uuid,text,text)'::regprocedure`)).rows as any[];
  assert.deepEqual(acl,{anon_read:false,authenticated_read:false,definer:false});
  await fx.pg.exec(`drop policy extension_capture_receipt_history_read on garimpa.extension_capture_receipt`);
  assert.equal((await list()).available,false);
  console.log('PASS phase 2: 9 imports / 498 observations / 397 products + Shopee 12 searches / 216 products remain discoverable after 71 verifications; cursor pages, immutable replay, historical gaps, retired devices, owner/operator/foreign/revoked RLS and read-only diagnosis verified.');
} finally {await fx.pg.close();}
