/** Real Next + installed Supabase SDK + native disposable PostgreSQL.
 * Auth and assessments are controlled local fixtures; no cloud/store/AI call. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,type ChildProcess} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {nativePostgresFixture} from './native-postgres-fixture.ts';
import {replacementRollout} from './replacement-rollout.ts';
const require=createRequire(import.meta.url);
const {inAccountScope}=require('../../packages/web/lib/account-scope.ts');
const {configureRecommendationChannel}=require('../../packages/web/lib/recommendation-db.ts');
const {defaultChannelPolicy}=require('../../packages/web/lib/recommendation-policy.ts');
const {readLivePauta,readPautaAvailability,readPautaProgress}=require('../../packages/web/lib/pauta-db.ts');
const {runCurationProjectionJob}=require('../../packages/web/lib/curation-scheduler.ts');
const {claimAttributeJobs,finishAttributeJob,attachAttributePromptContext}=require('../../packages/web/lib/curation-attributes-db.ts');
const {validateBrowserCaptureWithDiagnostics}=require('../../packages/web/lib/browser-capture-contract.ts');
const {persistManualExtensionBatch}=require('../../packages/web/lib/extension-db.ts');
const web=fileURLToPath(new URL('../../packages/web/',import.meta.url)),dist=process.env.BIZUMINER_DIST_DIR||'.next-phase45';
await readFile(`${web}/${dist}/BUILD_ID`);
process.env.DATABASE_URL='postgresql://isolated-unused';
process.env.SHOPEE_CAPTURE_ENABLED='false';process.env.ALIEXPRESS_CAPTURE_ENABLED='false';
process.env.CURATION_ATTRIBUTE_WORKER_ENABLED='false';process.env.RECAPTURE_PLANNER_ENABLED='false';
const fx=await nativePostgresFixture();
const ids={owner:'1a111111-1111-4111-8111-111111111111',operator:'2a222222-2222-4222-8222-222222222222',foreign:'3a333333-3333-4333-8333-333333333333'};
const encode=(x:any)=>Buffer.from(JSON.stringify(x)).toString('base64url');
const tokens=new Map<string,any>();let authCalls=0,operationReads=0;
function session(role:keyof typeof ids){const now=Math.floor(Date.now()/1000),user={id:ids[role],email:`${role}@fixture.invalid`,role:'authenticated',aud:'authenticated',user_metadata:{},app_metadata:{},identities:[]};
  const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,aud:'authenticated',exp:now+3600,iat:now})}.fixture-only`;tokens.set(token,user);
  return {access_token:token,refresh_token:`refresh-${role}`,token_type:'bearer',expires_at:now+3600,expires_in:3600,user};}
const auth=createServer(async(req,res)=>{authCalls++;res.setHeader('Content-Type','application/json');
  if(req.url?.startsWith('/auth/v1/token')){let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw),role=Object.keys(ids).find(r=>b.email===`${r}@fixture.invalid`||b.refresh_token===`refresh-${r}`) as keyof typeof ids;
    if(role&&(b.password==='fixture-password'||b.refresh_token)){res.end(JSON.stringify(session(role)));return;}}
  if(req.url?.split('?')[0]==='/auth/v1/user'){const user=tokens.get(req.headers.authorization?.replace(/^Bearer /,'')??'');if(user){res.end(JSON.stringify(user));return;}}
  if(req.url?.startsWith('/auth/v1/logout')){res.end('{}');return;}res.statusCode=401;res.end('{}');});
const account={tenantId:'journey_a',affiliateId:'aff_journey_a',actor:'human',actorAppUserId:'journey_owner',authenticatedAuthUserId:ids.owner,membershipRole:'owner',requestId:'http-journey'};
const model='fixture:model';let child:ChildProcess|undefined;let nextLog='';
async function listen(s:ReturnType<typeof createServer>){await new Promise<void>((ok,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',ok);});return (s.address() as any).port as number;}
async function stop(){if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise<void>(ok=>child!.once('exit',()=>ok())),delay(4000)]);if(child.exitCode===null)child.kill('SIGKILL');}}
try{
  for(const unit of (await replacementRollout()).units)await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
  for(const file of fx.files.filter(f=>f>'20261015040727'))await fx.migrate(file);
  await fx.pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values
    ('aff_journey_a','journey_a','journey-a','Operação A'),('aff_journey_b','journey_b','journey-b','Operação B'),('aff_journey_foreign','journey_foreign','journey-foreign','Conta alheia');
    insert into garimpa.app_user(id,tenant_id,auth_user_id) values('journey_owner','journey_a','${ids.owner}'),('journey_operator','journey_a','${ids.operator}'),('journey_foreign','journey_foreign','${ids.foreign}');
    insert into garimpa.app_user_role(app_user_id,role) values('journey_owner','afiliado'),('journey_operator','afiliado'),('journey_foreign','afiliado');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_journey_a','journey_owner','owner'),('aff_journey_b','journey_owner','owner'),('aff_journey_a','journey_operator','operator'),('aff_journey_foreign','journey_foreign','owner');
    insert into garimpa.workspace_rollout(tenant_id,enabled) values('journey_a',false),('journey_b',false);
    insert into garimpa.editorial_guideline(tenant_id,auto_publish) values('journey_a',true);
    insert into garimpa.curation_policy_v2(tenant_id,enabled,config) values('journey_a',true,'{"autoEligibility":true}'),('journey_b',true,'{}');
    insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status) values('aff_journey_a','mercadolivre','fixture','fixture','active');
    insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash) values('journey_device','aff_journey_a','journey_owner','Fixture','fixture-token');`);
  // Complete configured facts and a controlled assessment, using the actual projection services.
  const evidence={version:2,marketplace:'mercadolivre',currency:'BRL',priceType:'exact',priceMinCents:9900,priceMaxCents:9900,originalPriceKind:'none',originalPriceCents:null,
    observationMethod:'product_page',observedAt:new Date().toISOString(),sourceUrl:'https://produto.mercadolivre.com.br/MLB-777777771?variation=123456',
    variantIdentity:{state:'source_verified',key:'123456',methodVersion:'browser-option-v1'},variantKey:'123456',variantLabel:'Inox',packageQuantity:1,conditions:{},
    fieldStates:{sellerId:'not_applicable',packageContents:'not_applicable',dimensions:'not_applicable',payment:'not_applicable',coupon:'not_applicable',region:'not_applicable'},source:{method:'browser',deviceId:'journey_device'}};
  await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at) values('journey_ready','journey_a','mercadolivre','MLB777777771','Mixer de teste pronto para divulgar',${evidence.sourceUrl},9900,now())`;
  await fx.admin`insert into garimpa.product_curation(tenant_id,product_id,status) values('journey_a','journey_ready','pending')`;
  await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,capture_source,extension_device_id,offer_evidence) values('journey_ready_observation','journey_a','journey_ready',9900,now(),'extension','journey_device',${fx.admin.json(evidence)})`;
  const [{option_key}]=await fx.admin`select option_key from garimpa.price_observation where id='journey_ready_observation'`;
  await fx.admin`insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug) values('journey_publication','journey_a','journey_ready','aff_journey_a','web','journey-mixer')`;
  await fx.admin`insert into garimpa.editorial_offer_choice(tenant_id,product_id,option_key,selected_by) values('journey_a','journey_ready',${option_key},'journey_owner')`;
  await inAccountScope(account,async()=>{for(const channel of ['whatsapp','stories'])await configureRecommendationChannel({expectedTenantId:'journey_a',channel,expectedVersion:null,enabled:true,policy:defaultChannelPolicy(channel),manualOrder:null,validUntil:null},fx.factoryA);});
  const sql=fx.factoryA();await runCurationProjectionJob(sql,'journey_a',model,fx.factoryA);
  const jobs=await claimAttributeJobs(sql,'journey_a',1,10,model);assert.equal(jobs.length,1);await attachAttributePromptContext(sql,'journey_a',jobs,[]);
  assert.equal(await finishAttributeJob(sql,'journey_a',jobs[0],{productId:'journey_ready',qualidade:88,genuinidade_oferta:84,apelo_whatsapp:82,categoria:'Casa',flags:[],confianca:.9,justificativa:'Produto sintético útil.',fatos_usados:['titulo','preco_brl'],duvidas:[]}), 'completed');
  await runCurationProjectionJob(sql,'journey_a',model,fx.factoryA);
  // Persist three receipts per manual store. The large 498/397 fixture is tested separately natively.
  const imports:any[]=[];
  for(const store of ['mercadolivre','amazon','aliexpress'])for(let page=0;page<3;page++){
    const products=Array.from({length:5},(_,i)=>{const n=page*3+i,id=store==='mercadolivre'?`MLB${880000000+n}`:store==='amazon'?`B0${String(n).padStart(8,'0')}`:String(1005000000000000+n);
      return {externalId:id,title:`Recebido ${store} ${n}`,priceCents:9900,currency:'BRL',priceType:'exact',productUrl:store==='mercadolivre'?`https://produto.mercadolivre.com.br/MLB-${id.slice(3)}-fixture`:store==='amazon'?`https://www.amazon.com.br/dp/${id}`:`https://www.aliexpress.com/item/${id}.html`};});
    const raw={version:1,requestId:randomUUID(),marketplace:store,clientCapturedAt:new Date().toISOString(),page:{kind:'offers',url:store==='mercadolivre'?'https://www.mercadolivre.com.br/ofertas':store==='amazon'?'https://www.amazon.com.br/deals':'https://www.aliexpress.com/w/wholesale.html'},products};
    const {payload,diagnostics}=validateBrowserCaptureWithDiagnostics(raw);
    const result=await persistManualExtensionBatch({deviceId:'journey_device',tenantId:'journey_a',affiliateId:'aff_journey_a',appUserId:'journey_owner',affiliatePublicSlug:'journey-a',affiliateDisplayName:'A'},payload,fx.factoryA,diagnostics);imports.push({payload,result});
  }
  await fx.pg.exec(`insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,status,started_at,finished_at,metadata)
    values('77777777-7777-4777-8777-777777777777','journey_a',array['shopee'],2,'partial',now()-interval '1 hour',now(),'{"execution":{"phase":"finished","error":"affiliate_links_pending"}}');
    insert into garimpa.capture_run(id,tenant_id,marketplace,started_at,finished_at,status,items_captured,parameters)
      select 'journey_search_'||i,'journey_a','shopee',now()-interval '1 hour',now(),'ok',18,jsonb_build_object('operationBatchId','77777777-7777-4777-8777-777777777777') from generate_series(1,12) i;
    insert into garimpa.capture_run(id,tenant_id,marketplace,started_at,finished_at,status,items_captured,parameters)
      select 'journey_verify_'||i,'journey_a','shopee',now(),now(),'ok',0,'{"captureMode":"verification"}' from generate_series(1,71) i;
    insert into garimpa.curation_attribute_job(tenant_id,product_id,observation_id,input_fingerprint,input_snapshot,status)
      select 'journey_a',o.product_id,o.id,md5(o.product_id)||md5(o.id),'{}','reconciliation'
      from (select distinct on(product_id) product_id,id from garimpa.price_observation where tenant_id='journey_a' and product_id<>'journey_ready' order by product_id,observed_at desc,id desc limit 13) o;`);
  for(const channel of ['whatsapp','stories']){const pauta=await readLivePauta(account,channel,null,fx.factoryA);assert.ok(pauta.products.some((p:any)=>p.id==='journey_ready'),'prepared_ready_offer_'+channel+': '+JSON.stringify(pauta.recent.find((p:any)=>p.id==='journey_ready')));
    const status=await readPautaProgress(account,channel,undefined,fx.factoryB);assert.equal(status.count,pauta.products.length);assert.equal(status.byStore.mercadolivre,pauta.products.length);}
  const [deadlines]=await fx.admin`select offer_valid_until::text as value from garimpa.pauta_selection_cache where tenant_id='journey_a' and channel='stories'`;
  await fx.admin`update garimpa.pauta_selection_cache set offer_valid_until=array[now()-interval '1 second'] where tenant_id='journey_a' and channel='stories'`;
  const expired=await readPautaProgress(account,'stories',undefined,fx.factoryB);assert.equal(expired.count,0);assert.deepEqual(expired.byStore,{});
  await fx.admin`update garimpa.pauta_selection_cache set offer_valid_until=${deadlines.value}::text::timestamptz[] where tenant_id='journey_a' and channel='stories'`;
  const authPort=await listen(auth),reservation=createServer(),port=await listen(reservation);await new Promise<void>(ok=>reservation.close(()=>ok()));
  const origin=`http://127.0.0.1:${port}`,[{dbport}]=await fx.admin`select inet_server_port() dbport`;
  child=spawn(process.execPath,[`${web}/node_modules/next/dist/bin/next`,'start','-H','127.0.0.1','-p',String(port)],{cwd:web,env:{PATH:process.env.PATH,__NEXT_PROCESSED_ENV:'true',NODE_ENV:'production',BIZUMINER_DIST_DIR:dist,
    DATABASE_URL:`postgresql://garimpa_app@127.0.0.1:${dbport}/postgres?sslmode=disable`,SUPABASE_URL:`http://127.0.0.1:${authPort}`,SUPABASE_PUBLISHABLE_KEY:'fixture',NEXT_PUBLIC_SITE_URL:origin,
    NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${authPort}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture',AUTH_LOGIN_MODE:'password',NEXT_TELEMETRY_DISABLED:'1',
    EXTENSION_CAPTURE_ENABLED:'true',EXTENSION_CAPTURE_MODE:'manual',AMAZON_BROWSER_CAPTURE_ENABLED:'true',ALIEXPRESS_BROWSER_CAPTURE_ENABLED:'true',
    SHOPEE_CAPTURE_ENABLED:'false',ALIEXPRESS_CAPTURE_ENABLED:'false',CURATION_ATTRIBUTE_WORKER_ENABLED:'false',RECAPTURE_PLANNER_ENABLED:'false',GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  child.stdout?.on('data',b=>nextLog+=b.toString());child.stderr?.on('data',b=>nextLog+=b.toString());
  const request=(path:string,init:RequestInit={})=>fetch(origin+path,{...init,redirect:'manual',signal:AbortSignal.timeout(20000)});
  let ready=false;for(let i=0;i<100;i++){try{if((await request('/favicon.svg')).status===200){ready=true;break;}}catch{}await delay(100);}assert.ok(ready);
  const cookies=(role:keyof typeof ids)=>'sb-127-auth-token=base64-'+encode(session(role));
  const get=(path:string,role:keyof typeof ids='owner',extra={})=>{if(path.includes('/operacao'))operationReads++;return request(path,{headers:{Cookie:cookies(role),'x-bm-account':'journey_a',...extra}});};
  const snapshot=async()=>JSON.stringify(await fx.admin`select
    (select count(*) from garimpa.price_observation) observations,(select count(*) from garimpa.publication) publications,
    (select count(*) from garimpa.recommendation_edition_archive) editions,(select sum(consumed) from garimpa.curation_external_budget) consumed,
    (select jsonb_agg(jsonb_build_array(id,status,attempts,updated_at) order by id) from garimpa.curation_attribute_job) jobs`);
  const before=await snapshot();
  assert.equal((await request('/api/admin/operacao')).status,401);
  const statusResponse=await get('/api/admin/operacao');assert.equal(statusResponse.status,200);assert.equal(statusResponse.headers.get('cache-control'),'no-store');
  const status=await statusResponse.json();assert.equal(status.evaluation.uncertain,13);assert.equal(status.pauta.whatsapp.count,1);assert.equal(status.pauta.stories.count,1);assert.equal(status.stores.length,4);assert.equal(status.stores.find((s:any)=>s.store==='mercadolivre').connection,'active');assert.ok(status.stores.find((s:any)=>s.store==='mercadolivre').approvedRecentProducts>=1);
  const scoped=await (await get('/api/admin/operacao?produtos=["journey_ready"]')).json();assert.ok(Object.values(scoped.availability).every(Boolean));assert.equal(scoped.pauta.whatsapp.products[0].selected,true);
  for(const path of ['/admin?conta=journey_a','/admin/capturas?conta=journey_a',`/admin/capturas/${encodeURIComponent(imports[0].result.receiptRef)}?conta=journey_a`,`/admin/capturas/${encodeURIComponent(imports[5].result.receiptRef)}?conta=journey_a&loja=amazon&finalidade=capturas`,'/admin/curadoria?aba=problemas&conta=journey_a','/admin/configuracoes?conta=journey_a','/pauta?conta=journey_a&canal=stories']){const response=await get(path);assert.equal(response.status,200,path);const html=await response.text();assert.ok(!html.includes('NEXT_HTTP_ERROR_FALLBACK;404'),'not_found_digest_'+path);assert.ok(!/Application error:|Internal Server Error|This page could not be found/.test(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')),'rendered_page_'+path);}
  const alternate=await (await get('/admin?conta=journey_b', 'owner',{'x-bm-page-account':'journey_a'})).text();assert.match(alternate,/value="journey_b" selected/);const secondAccount=await (await get('/api/admin/operacao','owner',{'x-bm-account':'journey_b'})).json();assert.equal(secondAccount.evaluation.uncertain,0);assert.deepEqual(secondAccount.recent,[]);
  const invalid=await (await get('/admin?conta=journey_a&conta=journey_b')).text();assert.match(invalid,/Sem acesso/);
  const op=await get('/api/admin/operacao','operator');assert.equal(op.status,200);const opStatus=await op.json();assert.equal(opStatus.evaluation.uncertain,13);assert.equal(opStatus.stores.find((s:any)=>s.store==='mercadolivre').connection,'active');
  assert.equal((await get('/api/admin/extension/devices','operator')).status,403);
  assert.equal((await get('/api/admin/operacao','foreign')).status,403);
  assert.equal((await get('/api/admin/operacao','owner',{'x-bm-account':'journey_foreign'})).status,403);
  assert.equal(await snapshot(),before,'reading pages/status does not change facts/jobs/budget/publication/editions');
  await fx.admin`update garimpa.affiliate_membership set revoked_at=now() where app_user_id='journey_operator'`;
  assert.equal((await get('/api/admin/operacao','operator')).status,403);
  const evidenceResult={postgres:fx.version,auth:'loopback synthetic Auth through installed Supabase SDK',assertions:['ready pauta alongside 13 uncertain evaluations','four store facts, affiliated configuration, approval distinct from channel counts and expiry','scoped status remains available','real Next pages and auth guards','URL account and shell agree, spoofed context stripped','operator,foreign,revoked permissions','read-only status preserves facts/jobs/budget/publications/editions'],operationReads,authCalls,externalProviderCalls:0};
  if(process.env.OPERATION_JOURNEY_EVIDENCE)await writeFile(process.env.OPERATION_JOURNEY_EVIDENCE,JSON.stringify(evidenceResult,null,2)+'\n');
  console.log('PASS operation journey HTTP '+JSON.stringify(evidenceResult));
  if(process.env.OPERATION_JOURNEY_HOLD==='true'){
    await writeFile('/tmp/garimpa-phase45-browser.json',JSON.stringify({origin,login:`${origin}/entrar?next=/admin`,email:'owner@fixture.invalid',password:'fixture-password',readyProduct:'journey_ready',firstReceipt:imports[0].result.receiptRef}));
    console.log('BROWSER_READY '+origin);
    while(!process.exitCode){try{await readFile('/tmp/garimpa-phase45-browser-stop');break;}catch{}await delay(1000);}
  }
}catch(error){console.error('FAIL operation journey HTTP',error instanceof Error?error.stack?.slice(0,1600):'unknown');await writeFile('/tmp/garimpa-phase45-next-error.log',nextLog);process.exitCode=1;}
finally{await stop();auth.closeAllConnections();if(auth.listening)await new Promise<void>(ok=>auth.close(()=>ok()));await fx.close();}
