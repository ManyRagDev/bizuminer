/** Native SQL/RLS + real Next HTTP; synthetic Auth, no marketplace/AI calls. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn, type ChildProcess} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {nativePostgresFixture} from './native-postgres-fixture.ts';
import {replacementRollout} from './replacement-rollout.ts';

const web=fileURLToPath(new URL('../../packages/web/',import.meta.url));
const dist=process.env.BIZUMINER_DIST_DIR||'.next-shared-links';
await readFile(new URL(`../../packages/web/${dist}/BUILD_ID`,import.meta.url));
const fx=await nativePostgresFixture();
const extensionOrigin='chrome-extension://'+'a'.repeat(32);
const authId='e27140a7-63e6-4406-bd81-a8ad106c6de4';
const user={id:authId,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',user_metadata:{},app_metadata:{},identities:[]};
const now=Math.floor(Date.now()/1000);
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const accessToken=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:authId,aud:'authenticated',exp:now+3600,iat:now})}.fixture-only`;
const auth=createServer((req,res)=>{
  if(req.url?.split('?')[0]==='/auth/v1/user'&&req.headers.authorization===`Bearer ${accessToken}`){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(user));}
  else {res.statusCode=404;res.end();}
});
let child:ChildProcess|undefined;
let logBytes=0;
const portOf=(server:ReturnType<typeof createServer>)=>(server.address() as {port:number}).port;
async function startServer(server:ReturnType<typeof createServer>){await new Promise<void>((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});return portOf(server);}
async function stopNext(){if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise<void>(ok=>child!.once('exit',()=>ok())),delay(4000)]);if(child.exitCode===null)child.kill('SIGKILL');}}
try {
  const {units}=await replacementRollout();
  for(const unit of units)await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
  // Current schema with the installed version-1 extension protocol. A stale
  // November-12 schema does not represent the current deployed API contract.
  for(const file of fx.files.filter(file=>file>'20261015040727'))await fx.migrate(file);
  for(const [tenant,uid] of [['ext_a',authId],['ext_b','85707a8e-d388-449c-9f87-62a8be082867']]){
    await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values(${`aff_${tenant}`},${tenant},${tenant.replace('_','-')},${tenant})`;
    await fx.admin`insert into garimpa.app_user(id,tenant_id,auth_user_id) values(${`u_${tenant}`},${tenant},${uid})`;
    await fx.admin`insert into garimpa.app_user_role(app_user_id,role) values(${`u_${tenant}`},'afiliado')`;
    await fx.admin`insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values(${`aff_${tenant}`},${`u_${tenant}`},'owner')`;
  }
  // Use a limited role, close PUBLIC EXECUTE, retain explicit runtime entries.
  await fx.pg.exec(`revoke execute on all functions in schema garimpa from public;
    grant execute on function garimpa.active_tenant(text),garimpa.resolve_actor_identity(text),garimpa.resolve_actor_accounts(text),
      garimpa.exchange_extension_pairing(text,text,text),garimpa.authenticate_extension_device(text),garimpa.touch_extension_device(text),
      garimpa.observation_option_key(jsonb),garimpa.offer_configuration_key(jsonb) to garimpa_app;`);
  const authPort=await startServer(auth);
  const reservation=createServer();const port=await startServer(reservation);await new Promise<void>(ok=>reservation.close(()=>ok()));
  const origin=`http://127.0.0.1:${port}`;
  const [{dbport}]=await fx.admin`select inet_server_port() as dbport`;
  child=spawn(process.execPath,[`${web}/node_modules/next/dist/bin/next`,'start','-p',String(port),'-H','127.0.0.1'],{
    cwd:web,env:{PATH:process.env.PATH,__NEXT_PROCESSED_ENV:'true',NODE_ENV:'production',BIZUMINER_DIST_DIR:dist,
      DATABASE_URL:`postgresql://garimpa_app@127.0.0.1:${dbport}/postgres?sslmode=disable`,
      SUPABASE_URL:`http://127.0.0.1:${authPort}`,SUPABASE_PUBLISHABLE_KEY:'fixture',
      NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${authPort}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture',
      NEXT_PUBLIC_SITE_URL:origin,AUTH_LOGIN_MODE:'password',NEXT_PUBLIC_GA_ID:'',
      EXTENSION_CAPTURE_ENABLED:'true',EXTENSION_CAPTURE_MODE:'manual',EXTENSION_ALLOWED_ORIGINS:extensionOrigin,
      SHOPEE_CAPTURE_ENABLED:'false',ALIEXPRESS_CAPTURE_ENABLED:'false',GEMINI_API_KEY:'',CAPTURE_EXECUTOR:'durable'},stdio:['ignore','pipe','pipe']});
  child.stdout?.on('data',b=>{logBytes+=b.length;});child.stderr?.on('data',b=>{logBytes+=b.length;});
  const request=(path:string,options:RequestInit={})=>fetch(`${origin}${path}`,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});
  let ready=false;for(let i=0;i<100;i++){try{if((await request('/favicon.svg')).status===200){ready=true;break;}}catch{}await delay(100);}
  assert.ok(ready,'fixture_next_not_ready');
  const cookie='sb-127-auth-token=base64-'+encode({access_token:accessToken,refresh_token:'fixture-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user});
  const ownerHeaders={'Content-Type':'application/json',Origin:origin,Cookie:cookie,'x-bm-account':'ext_a'};
  const pair=await request('/api/extension/pairing-codes',{method:'POST',headers:ownerHeaders,body:JSON.stringify({deviceName:'Fixture extension'})});
  assert.equal(pair.status,201,'owner_can_issue_pairing_code');const issued=await pair.json();assert.ok(issued.pairingCode);
  assert.equal((await request('/api/extension/pairing-codes',{method:'POST',headers:ownerHeaders,body:'null'})).status,400);
  const exchange=(code:string,who=extensionOrigin)=>request('/api/extension/pair/exchange',{method:'POST',headers:{'Content-Type':'application/json',Origin:who},body:JSON.stringify({pairingCode:code})});
  assert.equal((await exchange(issued.pairingCode,'chrome-extension://'+'b'.repeat(32))).status,403);
  assert.equal((await request('/api/extension/pair/exchange',{method:'POST',headers:{'Content-Type':'application/json',Origin:extensionOrigin},body:'null'})).status,400);
  const paired=await exchange(issued.pairingCode);assert.equal(paired.status,200);const identity=await paired.json();assert.ok(identity.deviceToken?.startsWith('bm_ext_'));
  assert.equal((await exchange(issued.pairingCode)).status,401,'code_is_single_use');
  const headers={'Content-Type':'application/json',Origin:extensionOrigin,Authorization:`Bearer ${identity.deviceToken}`};
  const payload={version:1,requestId:'096c2731-d397-4e2f-a3bd-d234b9dc14d1',marketplace:'mercadolivre',clientCapturedAt:new Date().toISOString(),
    page:{kind:'product',url:'https://produto.mercadolivre.com.br/MLB-1234567890-fixture'},
    product:{externalId:'MLB1234567890',title:'Produto sintético de teste',productUrl:'https://produto.mercadolivre.com.br/MLB-1234567890-fixture',priceCents:6800,originalPriceCents:14200,currency:'BRL',priceType:'exact'}};
  const send=(value:unknown,path='/api/extension/captures')=>request(path,{method:'POST',headers,body:JSON.stringify(value)});
  const captured=await send(payload);assert.equal(captured.status,200);const first=await captured.json();assert.equal(first.mode,'manual');assert.equal(first.publication,null);
  const snapshot=async()=>JSON.stringify(await fx.admin`select
    (select jsonb_agg(to_jsonb(p) order by id) from garimpa.product p) products,
    (select jsonb_agg(to_jsonb(o) order by id) from garimpa.price_observation o) observations,
    (select jsonb_agg(to_jsonb(c) order by product_id) from garimpa.product_curation c) curations,
    (select count(*) from garimpa.comparative_evidence_event) events`);
  const before=await snapshot();const replay=await send(payload);assert.equal(replay.status,200);
  const replayBody=await replay.json();assert.equal(replayBody.duplicate,true);assert.equal(replayBody.productId,first.productId);assert.equal(await snapshot(),before);
  const changedReplay=await send({...payload,product:{...payload.product,priceCents:999}});assert.equal(changedReplay.status,409);assert.equal(await snapshot(),before);
  // Legacy installed extensions must not create durable work through GET.
  assert.equal((await request('/api/extension/capture-batches',{headers})).status,409);
  const batch={version:1,requestId:'138d361f-f6b1-40b2-87b0-e7a91e4431ad',marketplace:'mercadolivre',clientCapturedAt:new Date().toISOString(),page:payload.page,
    products:[payload.product,{...payload.product,externalId:'MLB1234567891',productUrl:'https://produto.mercadolivre.com.br/MLB-1234567891-fixture'}]};
  const imported=await send({mode:'manual',payload:batch},'/api/extension/capture-batches');assert.equal(imported.status,200);const batchResult=await imported.json();assert.equal(batchResult.importedCount,2);
  const batchBefore=await snapshot();const again=await send({mode:'manual',payload:batch},'/api/extension/capture-batches');assert.equal(again.status,200);assert.equal((await again.json()).duplicate,true);assert.equal(await snapshot(),batchBefore);
  const blocked=await request('/api/extension/captures',{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body:JSON.stringify(payload)});assert.equal(blocked.status,403);
  const mismatched=await request('/api/extension/captures',{method:'POST',headers:{...headers,'Idempotency-Key':batch.requestId},body:JSON.stringify(payload)});assert.equal(mismatched.status,400);
  // A fresh synthetic 53→35 fixture proves disclosure, not the cause of the
  // historical Vivaldi result whose original payload is no longer available.
  const diagnosticBatch={...batch,requestId:'81e44fd0-702d-45d7-9744-e14f082ca5d8',products:Array.from({length:53},(_,i)=>({
    ...payload.product,externalId:`MLB${6000000000+i}`,productUrl:`https://produto.mercadolivre.com.br/MLB-${6000000000+i}-fixture`,priceCents:i<35?6800:0,
  }))};
  const diagnosticResponse=await send({mode:'manual',payload:diagnosticBatch},'/api/extension/capture-batches');
  assert.equal(diagnosticResponse.status,200);const report=await diagnosticResponse.json();
  assert.equal(report.importedCount,35);assert.equal(report.alreadyRecordedCount,0);
  assert.deepEqual([report.diagnostics.received,report.diagnostics.valid,report.diagnostics.duplicates,report.diagnostics.rejected],[53,35,0,18]);
  assert.equal(report.diagnostics.items.length,18);assert.ok(report.diagnostics.items.every((item:any)=>item.reason==='product_price_invalid'));
  const reportBefore=await snapshot();
  const replayReportResponse=await send({mode:'manual',payload:diagnosticBatch},'/api/extension/capture-batches');
  assert.equal(replayReportResponse.status,200);const replayReport=await replayReportResponse.json();
  assert.equal(replayReport.importedCount,0);assert.equal(replayReport.alreadyRecordedCount,35);
  assert.deepEqual(replayReport.diagnostics,report.diagnostics);assert.equal(await snapshot(),reportBefore);
  const noneValid=await send({mode:'manual',payload:{...diagnosticBatch,requestId:'28e6109d-7f8a-43bd-ac09-e01fdcaef529',products:diagnosticBatch.products.slice(35,37)}},'/api/extension/capture-batches');
  assert.equal(noneValid.status,400);const rejected=await noneValid.json();assert.equal(rejected.diagnostics.rejected,2);assert.equal(rejected.diagnostics.valid,0);assert.equal(await snapshot(),reportBefore);
  const [counts]=await fx.admin`select (select count(*)::int from garimpa.product) products,(select count(*)::int from garimpa.price_observation) observations,
    (select count(*)::int from garimpa.product_curation where status='pending') pending,
    (select count(*)::int from garimpa.product where tenant_id='ext_b') foreign_products,
    (select count(*)::int from garimpa.publication) publications,(select count(*)::int from garimpa.capture_batch) batches,
    (select count(*)::int from garimpa.capture_run) runs,(select count(*)::int from garimpa.triage_run) triages`;
  assert.deepEqual({...counts},{products:37,observations:38,pending:37,foreign_products:0,publications:0,batches:0,runs:0,triages:0});
  const revoked=await request('/api/admin/extension/devices',{method:'POST',headers:ownerHeaders,body:JSON.stringify({action:'revoke',deviceId:identity.deviceId})});assert.equal(revoked.status,200);
  assert.ok([401,403].includes((await send(payload)).status));assert.equal(await snapshot(),reportBefore);
  console.log('PASS real Next HTTP + restricted PostgreSQL: pairing/capture/replay/revocation, 53→35/18 diagnostics and all-invalid400 without writes; no publications/jobs/AI, tenant isolation');
} catch(error) {
  console.error('FAIL extension-manual-http',error instanceof Error?error.stack?.slice(0,1800):'unknown',`nextOutputBytes=${logBytes}`);process.exitCode=1;
} finally {
  await stopNext();auth.closeAllConnections();if(auth.listening)await new Promise<void>(ok=>auth.close(()=>ok()));await fx.close();
}
