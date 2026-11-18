/** Replay real pg_dump Garimpa objects, without the synthetic observed baseline. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {nativePostgresFixture} from './native-postgres-fixture.ts';

const path=process.env.GARIMPA_BASELINE_SCHEMA;
if(!path) throw new Error('GARIMPA_BASELINE_SCHEMA must point to the private reviewed schema export (no data)');
const bytes=await readFile(path);
const digest=createHash('sha256').update(bytes).digest('hex');
assert.ok(['2755297feb6a24506073569f2f10d7dac753c7fb01989d87c397500d3895351e',
  '143131cb89882497c755261bfb64a49c4a05c8512cc6b31e37e5b0812dc17ce1'].includes(digest),'unreviewed_schema_hash');
const dump=bytes.toString('utf8');
const objects=[...dump.matchAll(/^--\r?\n-- Name: (.*?); Type: (.*?); Schema: (.*?); Owner:.*\r?\n--\r?\n/gm)];
const sections=objects.flatMap((match,i)=>match[3]==='garimpa'||match[1]==='garimpa'&&match[2]==='SCHEMA'
  ? [dump.slice(match.index,objects[i+1]?.index??dump.length)] : []);
assert.equal(sections.length,942,'changed_garimpa_export_inventory');
// Literal object sections retain all Garimpa triggers/policies/constraints/functions.
// PostSpark/Auth/extension restoration belongs to its own integration rehearsal.
const schema=sections.join('');
const fx=await nativePostgresFixture({initialize:async pg=>{
  await pg.exec('create role garimpa_app; create role garimpa_public_runtime; create role anon; create role authenticated; create role service_role;');
  await pg.exec('set check_function_bodies=false;');
  await pg.exec(schema);
  await pg.exec('set check_function_bodies=true;');
}});
const migration=(file:string)=>readFile(new URL(`../../packages/persistence/supabase/migrations/${file}`,import.meta.url),'utf8');
try {
  assert.equal((await fx.admin`select to_regclass('garimpa.comparative_evidence_event') as obj`)[0].obj,null);
  await fx.pg.exec(await migration('20261110192436_marketplace_performance.sql'));
  const pauta=await migration('20261111042204_pauta_versioned_selection.sql');
  await assert.rejects(()=>fx.pg.exec(pauta),/comparative_evidence_event/);
  await fx.pg.exec('rollback');
  assert.equal((await fx.admin`select to_regclass('garimpa.pauta_source_version') as obj`)[0].obj,null);
  console.log('PASS reproduzida ausência de comparative_evidence_event no dump real; pauta revertida integralmente');

  await fx.admin.begin((tx:any)=>migration('20261020002440_garimpa_comparative_evidence_event.sql').then(sql=>tx.unsafe(sql)));
  await fx.pg.exec(pauta);
  for(const file of ['20261112002243_capture_durable_execution.sql','20261112002247_capture_atomic_publication.sql',
    '20261112023232_shared_link_archive.sql']) await fx.pg.exec(await migration(file));
  const [{triggers}]=await fx.admin`select count(*)::int as triggers from pg_trigger
    where tgname like 'pauta_changed_%' and not tgisinternal`;
  assert.equal(triggers,45); // All 15 source relations, INSERT/UPDATE/DELETE.
  assert.equal((await fx.admin`select count(*)::int n from garimpa.comparative_evidence_event`)[0].n,0);
  console.log('PASS pré-requisito histórico + deltas + arquivo sobre942objetos reais;45triggers de pauta presentes, sem backfill');

  // Explicit, narrow test ACLs for the exercised writers; not a full VPS grant bundle.
  await fx.pg.exec(`revoke execute on all functions in schema garimpa from public;
    grant usage on schema garimpa to garimpa_app;
    grant execute on function garimpa.active_tenant(text),garimpa.observation_option_key(jsonb),garimpa.offer_configuration_key(jsonb),garimpa.commercial_rollout_ready() to garimpa_app;
    revoke all on function garimpa.record_comparative_evidence_event_from_product(),garimpa.record_comparative_evidence_event_from_observation() from public,anon,authenticated,garimpa_app;
    revoke all on garimpa.comparative_evidence_event,garimpa.comparative_evidence_event_id_seq from public,anon,authenticated,garimpa_app;
    grant select on garimpa.comparative_evidence_event to garimpa_app;
    grant select on garimpa.affiliate_account to garimpa_app;
    grant select,insert,update on garimpa.product,garimpa.price_observation,garimpa.product_curation,garimpa.capture_run,garimpa.publication to garimpa_app;
    grant select on garimpa.capture_batch to garimpa_app;`);
  await fx.pg.exec(`create role garimpa_runtime_probe login inherit nosuperuser nobypassrls;
    grant garimpa_app to garimpa_runtime_probe with inherit true, set true;
    grant garimpa_public_runtime to garimpa_app with inherit true, set true;
    grant usage on schema garimpa to garimpa_public_runtime;`);
  for(const tenant of ['baseline_a','baseline_b']) await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name)
    values(${`aff_${tenant}`},${tenant},${tenant.replaceAll('_','-')},${tenant})`;
  await fx.admin.begin(async(tx:any)=>{
    await tx`set local role garimpa_runtime_probe`;
    await tx`select set_config('garimpa.tenant_id','baseline_a',true)`;
    await tx`insert into garimpa.capture_run(id,tenant_id,marketplace,started_at,status)
      values('real_baseline_run','baseline_a','shopee',now(),'running')`;
    const offer={marketplace:'shopee',externalId:'real-baseline-product',title:'Fresh test product',
      productUrl:'https://shopee.com.br/product/1/2',priceCents:1200,observedAt:new Date().toISOString(),
      offerEvidence:{version:2,currency:'BRL',priceType:'exact',variantIdentity:{key:'synthetic-variant',state:'source_verified'}}};
    await tx`select garimpa.stage_capture_offer('baseline_a','real_baseline_run',${tx.json(offer)})`;
    assert.equal((await tx`select count(*)::int n from garimpa.product`)[0].n,0);
    await tx`update garimpa.capture_run set status='ok',finished_at=now() where id='real_baseline_run'`;
    assert.equal((await tx`select garimpa.publish_capture_run('baseline_a','real_baseline_run') as n`)[0].n,1);
  });
  const [counts]=await fx.admin`select
    (select count(*)::int from garimpa.product) products,
    (select count(*)::int from garimpa.price_observation) observations,
    (select count(*)::int from garimpa.product_curation where status='pending') pending,
    (select count(*)::int from garimpa.comparative_evidence_event) evidence`;
  assert.deepEqual({...counts},{products:1,observations:1,pending:1,evidence:2});
  await fx.admin.begin(async(tx:any)=>{
    await tx`set local role garimpa_runtime_probe`;
    const [permissions]=await tx`select current_user as role,pg_has_role(current_user,'garimpa_public_runtime','SET') as can_set`;
    assert.equal(permissions.role,'garimpa_runtime_probe');assert.equal(permissions.can_set,true);
    await tx`set local role garimpa_public_runtime`;
    assert.equal((await tx`select garimpa.public_shared_link_archive('alias','4bzr',null) as result`)[0].result,null);
  });
  const [before]=await fx.admin`select revision from garimpa.pauta_source_version where tenant_id='baseline_a' and channel='whatsapp'`;
  await fx.clientA.begin(async(tx:any)=>{
    await tx`select set_config('garimpa.tenant_id','baseline_a',true)`;
    await tx`update garimpa.product set last_price_cents=1100 where external_id='real-baseline-product'`;
    await tx`update garimpa.price_observation set price_cents=1100 where product_id=(select id from garimpa.product where external_id='real-baseline-product')`;
  });
  const [after]=await fx.admin`select revision from garimpa.pauta_source_version where tenant_id='baseline_a' and channel='whatsapp'`;
  assert.equal(Number(after.revision),Number(before.revision)+1);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.comparative_evidence_event`)[0].n,4);
  await fx.clientB.begin(async(tx:any)=>{
    await tx`select set_config('garimpa.tenant_id','baseline_b',true)`;
    assert.equal((await tx`select count(*)::int n from garimpa.comparative_evidence_event`)[0].n,0);
    assert.equal((await tx`select count(*)::int n from garimpa.product`)[0].n,0);
  });
  await assert.rejects(()=>fx.clientA`insert into garimpa.comparative_evidence_event
    (tenant_id,product_id,subject,operation,material_projection) values('baseline_a','fake','product','insert','{}')`,/permission denied/);
  console.log('PASS runtime limitado: staging→publicação, seed pending real, evidência imutável gerada e invalidação coalescida; conta B isolada');
  console.log(JSON.stringify({baselineSha256:digest,garimpaObjects:sections.length,scope:'Garimpa literal do dump; PostgreSQL local, sem Auth/Storage/PostSpark/dados exportados'}));
} finally {await fx.close();}
