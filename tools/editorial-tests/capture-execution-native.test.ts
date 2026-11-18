import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
import { replacementRollout } from './replacement-rollout.ts';
const require=createRequire(import.meta.url);
const {CaptureBatchStore}=require('../../packages/web/lib/capture-batch-db.ts');
const {executeCaptureBatch}=require('../../packages/web/lib/capture-batch-worker.ts');
const fx=await nativePostgresFixture();
const storeA=new CaptureBatchStore(fx.factoryA),storeB=new CaptureBatchStore(fx.factoryB);
try {
  const {units}=await replacementRollout();
  for(const unit of units)await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
  await fx.pg.exec(await readFile(new URL('../../packages/persistence/supabase/migrations/20261112002243_capture_durable_execution.sql',import.meta.url),'utf8'));
  await fx.pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','a','A'),('aff_b','b','b','B')`);
  const signals:any[]=[];
  const subscription=await fx.admin.listen('garimpa_capture_ready',(payload:string)=>signals.push(JSON.parse(payload)));
  const requestId='10000000-0000-4000-8000-000000000001';
  const batch=await storeA.create('a',['shopee'],1,'durable',false,undefined,{requestId});
  assert.equal((await storeB.create('a',['shopee'],1,'durable',false,undefined,{requestId})).id,batch.id);
  await assert.rejects(()=>storeB.create('a',['shopee'],2,'durable',false,undefined,{requestId}),/capture_request_conflict/);
  await assert.rejects(()=>storeA.create('a',['shopee'],1,'durable',false),/unique/i);
  const pending=await storeA.scheduled('a');
  assert.equal(pending.length,1);assert.equal(pending[0].id,batch.id);
  assert.equal((await storeB.scheduled('b')).length,0);
  // A new listener reconstructs work from durable rows, without needing the INSERT signal.
  const claims=await Promise.all([storeA.claim(batch.id,'owner-a','a'),storeB.claim(batch.id,'owner-b','a')]);
  assert.equal(claims.filter(Boolean).length,1);
  const owner=claims.find(Boolean)!.metadata.execution.workerId;
  assert.equal(await storeB.claim(batch.id,'intruder','b'),null);
  await fx.admin`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,deadline}',to_jsonb((now()-interval '1 second')::text)) where id=${batch.id}`;
  await storeB.recover('a');
  const resumed=await storeB.claim(batch.id,'new-owner','a');
  assert.ok(resumed);
  await assert.rejects(()=>storeA.update(batch.id,owner,resumed.metadata.execution,'running','a'),/ownership_lost/);
  // Unknown paid/external work is never replayed on lease recovery.
  for(const phase of ['triaging','affiliating']) {
    await fx.admin`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution}',metadata->'execution'||
      jsonb_build_object('phase',${phase}::text,'deadline',now()-interval '1 second')) where id=${batch.id}`;
    await storeB.recover('a');
    assert.equal((await storeA.read(batch.id,'a')).metadata.execution.phase,'awaiting_reconciliation');
    assert.equal((await storeB.scheduled('a')).length,0);
    await assert.rejects(()=>storeA.resolveWait(batch.id,'a','retry'),/reconciliation_required/);
  }
  await storeA.resolveWait(batch.id,'a','cancel');
  console.log('PASS pedido idempotente, recuperação sem sinal, claims concorrentes, fencing e espera externa após lease');

  const retry=await storeA.create('a',['shopee'],1,'durable',false);
  await executeCaptureBatch(retry.id,async()=>({ok:false,error:'provider_throttled',failureKind:'rate_limit',retryAfterMs:90_000}),storeA,'a');
  const deferred=await storeB.read(retry.id,'a');
  assert.equal(deferred.metadata.execution.phase,'retry_wait');
  assert.ok(Date.parse(deferred.metadata.execution.nextAttemptAt)>Date.now()+80_000);
  await storeB.recover('a');
  assert.equal(await storeA.claim(retry.id,'too-early','a'),null);
  await fx.admin`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,nextAttemptAt}',to_jsonb((now()-interval '1 second')::text)) where id=${retry.id}`;
  await storeB.recover('a');
  const steps:string[]=[];
  await executeCaptureBatch(retry.id,async(step:any)=>{
    steps.push(step.kind);
    if(step.kind==='capture')await fx.admin`insert into garimpa.capture_run(id,tenant_id,marketplace,started_at,status,parameters)
      values('resume-a','a','shopee',now(),'ok',${fx.admin.json({operationBatchId:retry.id})})`;
    if(step.kind==='triage')return {ok:false,error:'step_timeout'};
    return {ok:true};
  },storeA,'a');
  assert.deepEqual(steps,['capture','publish','affiliate','triage']);
  assert.equal((await storeB.read(retry.id,'a')).metadata.execution.phase,'awaiting_reconciliation');
  await storeB.resolveWait(retry.id,'a','cancel');
  console.log('PASS retry respeita prazo persistido; execução segue publicação e triagem desconhecida não se repete');

  const credential=await storeA.create('a',['shopee'],1,'durable',false);
  await executeCaptureBatch(credential.id,async()=>({ok:false,error:'credentials_missing',failureKind:'credential'}),storeA,'a');
  assert.equal((await storeB.read(credential.id,'a')).metadata.execution.phase,'awaiting_authorization');
  assert.equal((await storeB.scheduled('a')).length,0);
  await storeA.resolveWait(credential.id,'a','retry');
  assert.equal((await storeB.read(credential.id,'a')).metadata.execution.phase,'queued');
  // Native NOTIFY proves the signal is visible only after the committed write.
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(signals.some(signal=>signal.batchId===batch.id && signal.tenantId==='a'));
  const count=signals.length;
  await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{
    await tx`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,phase}','"capturing"') where id=${credential.id}`;
    throw new Error('rollback_signal');
  }),/rollback_signal/);
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(signals.length,count);
  await subscription.unlisten();
  console.log('PASS credencial exige ação; NOTIFY transacional não escapa de rollback ('+fx.version+')');
  await storeA.resolveWait(credential.id,'a','cancel').catch(async()=>{
    await fx.admin`update garimpa.capture_batch set status='error' where id=${credential.id}`;
  });
  const [{port:dbPort}]=await fx.admin`select inet_server_port() as port`;
  const reservation=createServer();
  await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const healthPort=(reservation.address() as {port:number}).port;
  await new Promise<void>(resolve=>reservation.close(()=>resolve()));
  const connection=`postgresql://garimpa_app@localhost:${dbPort}/postgres`;
  const child=spawn(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('../../packages/web/bin/listen-capture-batches.ts',import.meta.url))],{
    env:{...process.env,DATABASE_URL:connection,CAPTURE_EXECUTOR:'durable',CAPTURE_LISTEN_DATABASE_URL:connection,
      CAPTURE_WORKER_TENANTS:'a,b',CAPTURE_HEALTH_PORT:String(healthPort)},stdio:['ignore','pipe','pipe'],
  });
  let output='';child.stdout.on('data',chunk=>{output=(output+chunk).slice(-8000);});child.stderr.on('data',chunk=>{output=(output+chunk).slice(-8000);});
  const exited=once(child,'exit');
  const waitFor=async(check:()=>Promise<boolean>,label:string)=>{
    const until=Date.now()+12_000;
    while(Date.now()<until){
      if(child.exitCode!==null)throw new Error(label+': child exited '+output);
      if(await check())return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error(label+': timeout '+output);
  };
  const health=async()=>{try{return await fetch(`http://127.0.0.1:${healthPort}/health`).then(async response=>response.status===200 && (await response.json()).ready===true);}catch{return false;}};
  try {
    await waitFor(health,'listener startup');
    const activity=()=>fx.admin`select pid,query_start::text as query_start from pg_stat_activity
      where application_name in ('bizuminer-capture-listener','bizuminer-web') order by pid`;
    const before=Array.from(await activity());
    await new Promise(resolve=>setTimeout(resolve,300));
    assert.deepEqual(Array.from(await activity()),before,'idle listener must not issue recurring database reads');
    const [{pid}]=await fx.admin`select pid from pg_stat_activity where application_name='bizuminer-capture-listener'`;
    await fx.admin`select pg_terminate_backend(${pid})`;
    await waitFor(async()=>{
      const [connection]=await fx.admin`select pid from pg_stat_activity where application_name='bizuminer-capture-listener' and pid<>${pid}`;
      return Boolean(connection)&&await health();
    },'listener reconnect');
    child.kill('SIGTERM');
    const [code]=await Promise.race([exited,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('listener shutdown timeout')),10_000))]);
    assert.equal(code,0);
    console.log('PASS processo listener real: startup/health, nenhum polling vazio, reconnect e parada graciosa');
  } finally {if(child.exitCode===null){child.kill('SIGKILL');await exited;}}

} finally {await fx.close();}
