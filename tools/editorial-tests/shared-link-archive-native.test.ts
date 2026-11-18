import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
import { replacementRollout } from './replacement-rollout.ts';
const require=createRequire(new URL('../../packages/web/package.json',import.meta.url));
const postgres=require('postgres');
const fx=await nativePostgresFixture();
let secondOwner:any;
const migration='20261112023232_shared_link_archive.sql';
const digest='a'.repeat(64);
const insert=async(sql:any,alias:string,slug='archive-'+alias,tenant='archive_a',url='https://shope.ee/preserved',patch:Record<string,unknown>={})=>{
  const row={alias,bio_code:alias.slice(-3).toUpperCase(),slug,tenant_id:tenant,affiliate_id:tenant==='archive_b'?'affiliate_b':'affiliate_a',
    title:'Compartilhamento preservado '+alias,image_url:'https://cdn.example.test/old.jpg',marketplace:'shopee',affiliate_url:url,
    provenance:{sourceProductId:'old-product',sourceCaptureId:'absent-capture',historicalPriceCents:9999},snapshot_sha256:digest,record_sha256:digest,status:'active',...patch};
  await sql`insert into garimpa.shared_link_archive(alias,bio_code,slug,tenant_id,affiliate_id,title,image_url,marketplace,affiliate_url,provenance,snapshot_sha256,record_sha256,status)
    values(${row.alias},${row.bio_code},${row.slug},${row.tenant_id},${row.affiliate_id},${row.title},${row.image_url},${row.marketplace},${row.affiliate_url},${sql.json(row.provenance)},${row.snapshot_sha256},${row.record_sha256},${row.status})`;
};
const projection=(kind:string,key:string,tenant:string|null=null)=>fx.clientA.begin(async(tx:any)=>{
  await tx`set local role garimpa_public_runtime`;
  const [r]=await tx`select garimpa.public_shared_link_archive(${kind},${key},${tenant}) as value`;return r.value;
});
const target=(slug:string)=>fx.clientA.begin(async(tx:any)=>{
  await tx`set local role garimpa_public_runtime`;
  const [r]=await tx`select garimpa.public_shared_link_archive_target(${slug}) as value`;return r.value;
});
function gate(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};}
async function untilBlocked(){
  const deadline=Date.now()+4000;
  while(!(await fx.clientB`select exists(select 1 from pg_locks where locktype='advisory' and not granted) as waiting`)[0].waiting){
    if(Date.now()>deadline)throw new Error('expected_namespace_lock_wait');
    await new Promise(r=>setTimeout(r,10));
  }
}
async function counts(){return (await fx.admin`select
  (select count(*)::integer from garimpa.product) as products,
  (select count(*)::integer from garimpa.price_observation) as observations,
  (select count(*)::integer from garimpa.product_curation) as curation,
  (select count(*)::integer from garimpa.capture_run) as captures,
  (select count(*)::integer from garimpa.publication) as publications`)[0];}
try{
  const {units}=await replacementRollout();
  for(const unit of units)await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
  await fx.pg.exec(await readFile(new URL('../../packages/persistence/supabase/migrations/'+migration,import.meta.url),'utf8'));
  // Isolated owner session only: this never reads DATABASE_URL or connects to a remote service.
  secondOwner=postgres({host:fx.admin.options.host[0],port:fx.admin.options.port[0],database:'postgres',username:'postgres',ssl:false,max:1,onnotice:()=>{}});
  await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name)
    values('affiliate_a','archive_a','archive-a','Account A'),('affiliate_b','archive_b','archive-b','Account B')`;
  const before=await counts();
  await insert(fx.admin,'4bzr');await insert(fx.admin,'4jt3','archive-4jt3','archive_b');
  assert.deepEqual(await counts(),before,'archival import creates no product, capture, price, publication or curation');
  const card=await projection('alias','4bzr');
  assert.deepEqual(Object.keys(card).sort(),['alias','archived','available','bioCode','imageUrl','marketplace','slug','tenantId','title'].sort());
  assert.equal(card.available,true);assert.equal(card.bioCode,'BZR');assert.equal(card.tenantId,'archive_a');
  assert.equal(JSON.stringify(card).includes('9999'),false);assert.equal(JSON.stringify(card).includes('shope.ee'),false);
  assert.deepEqual(await projection('slug','archive-4bzr'),card);
  assert.deepEqual(await projection('bio','bzr','archive_a'),card);
  assert.equal(await projection('bio','BZR'),null);
  assert.equal(await projection('bio','BZR','archive_b'),null);
  assert.equal(await projection('alias','4bzr','archive_b'),null);
  assert.equal(await projection('alias','unknown'),null);
  assert.equal(await projection('invalid','4bzr'),null);
  assert.equal(await target('archive-4bzr'),'https://shope.ee/preserved');
  console.log('PASS projeção pública mínima, bio por conta, destino separado e catálogo intocado');

  for(const role of ['anon','authenticated','garimpa_app','garimpa_public_runtime']){
    const [permissions]=await fx.admin`select
      has_table_privilege(${role},'garimpa.shared_link_archive','select,insert,update,delete,truncate') as table_access,
      has_table_privilege(${role},'garimpa.shared_link_archive_namespace','select,insert,update,delete,truncate') as gate_access,
      has_function_privilege(${role},'garimpa.public_shared_link_archive(text,text,text)','execute') as public_rpc,
      has_function_privilege(${role},'garimpa.guard_shared_link_archive()','execute') as trigger_rpc`;
    assert.equal(permissions.table_access,false,role);assert.equal(permissions.gate_access,false,role);
    assert.equal(permissions.public_rpc,['garimpa_app','garimpa_public_runtime'].includes(role),role);assert.equal(permissions.trigger_rpc,false,role);
    await assert.rejects(()=>fx.admin.begin(async(tx:any)=>{await tx.unsafe('set local role '+role);await tx`select * from garimpa.shared_link_archive`;}),/permission denied/);
  }
  const [rls]=await fx.admin`select relrowsecurity from pg_class where oid='garimpa.shared_link_archive'::regclass`;
  assert.equal(rls.relrowsecurity,true);
  // The existing baseline grants public-runtime membership to garimpa_app. It may
  // inherit public RPC execution, but receives no new direct ACL and no table access.
  const publicGrants=await fx.admin`select r.rolname from pg_proc p cross join lateral aclexplode(p.proacl) acl
    join pg_roles r on r.oid=acl.grantee where p.oid='garimpa.public_shared_link_archive(text,text,text)'::regprocedure
      and acl.privilege_type='EXECUTE' and acl.grantee<>p.proowner`;
  assert.deepEqual(publicGrants.map((r:any)=>r.rolname),['garimpa_public_runtime']);
  // Even an accidental future SELECT grant still encounters policy-less RLS.
  await fx.admin.begin(async(tx:any)=>{
    await tx`grant select on garimpa.shared_link_archive to garimpa_app`;
    await tx`set local role garimpa_app`;assert.equal((await tx`select * from garimpa.shared_link_archive`).length,0);
    await tx`reset role`;await tx`revoke select on garimpa.shared_link_archive from garimpa_app`;
  });
  console.log('PASS ACLs fechadas, RLS sem policy e funções trigger não invocáveis pelo runtime');

  for(const url of ['http://shope.ee/x','https://shopee.ee/x','https://shope.ee.evil.test/x','https://evilshope.ee/x','https://user@shope.ee/x','https://shope.ee:443/x','https://shope.ee:444/x','https://shope.ee\\@evil.test/x','https://shope.ee/x\n'])
    await assert.rejects(()=>insert(fx.admin,'ptej','bad-url','archive_a',url),/check constraint/);
  await assert.rejects(()=>insert(fx.admin,'nope'),/check constraint/);
  for(const slug of ['..','.','a/b','a\\b','a?b','a#b','a b','a'.repeat(513)])
    await assert.rejects(()=>insert(fx.admin,'ptej',slug),/check constraint/);
  await assert.rejects(()=>insert(fx.admin,'ptej','bad-bio','archive_a','https://shope.ee/x',{bio_code:'XXX'}),/check constraint/);
  await assert.rejects(()=>insert(fx.admin,'ptej','bad-scope','archive_b','https://shope.ee/x',{affiliate_id:'affiliate_a'}),/foreign key constraint/);
  await assert.rejects(()=>fx.admin`update garimpa.shared_link_archive set affiliate_url='https://shope.ee/replaced' where alias='4bzr'`,/shared_link_archive_immutable/);
  await assert.rejects(()=>fx.admin`update garimpa.shared_link_archive set alias='ptej',bio_code='TEJ' where alias='4bzr'`,/shared_link_archive_immutable/);
  await assert.rejects(()=>fx.admin`delete from garimpa.shared_link_archive where alias='4bzr'`,/shared_link_archive_immutable/);
  await assert.rejects(()=>fx.admin`truncate garimpa.shared_link_archive`,/shared_link_archive_immutable/);
  const namespaceBefore=(await fx.admin`select revision from garimpa.shared_link_archive_namespace`)[0].revision;
  await fx.admin`update garimpa.shared_link_archive set status='revoked' where alias='4bzr'`;
  assert.deepEqual(await projection('alias','4bzr'),{archived:true,available:false});assert.equal(await target('archive-4bzr'),null);
  assert.equal((await fx.admin`select revision from garimpa.shared_link_archive_namespace`)[0].revision,namespaceBefore);
  await assert.rejects(()=>fx.admin`insert into garimpa.short_link(code,tenant_id,slug) values('4bzr','archive_b','somewhere')`,/shared_link_archive_namespace_conflict/);
  await fx.admin`update garimpa.shared_link_archive set status='active' where alias='4bzr'`;
  await fx.admin`update garimpa.affiliate_account set status='suspended' where id='affiliate_a'`;
  assert.deepEqual(await projection('slug','archive-4bzr'),{archived:true,available:false});assert.equal(await target('archive-4bzr'),null);
  await fx.admin`update garimpa.affiliate_account set status='active' where id='affiliate_a'`;
  console.log('PASS domínio seguro, vínculo da conta, imutabilidade e revogação sem fallback');

  await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at)
    values('live-product','archive_a','shopee','live','Live product','https://shopee.com.br/live',1000,now())`;
  await assert.rejects(()=>fx.admin`insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug)
    values('blocked','archive_a','live-product','affiliate_a','web','archive-4bzr')`,/shared_link_archive_namespace_conflict/);
  await fx.admin`insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug)
    values('live-publication','archive_a','live-product','affiliate_a','web','live-slug')`;
  await assert.rejects(()=>insert(fx.admin,'ptej','live-slug'),/shared_link_archive_namespace_conflict/);
  await assert.rejects(()=>fx.admin`update garimpa.publication set slug='archive-4bzr' where id='live-publication'`,/shared_link_archive_namespace_conflict/);
  await assert.rejects(()=>fx.admin`insert into garimpa.short_link(code,tenant_id,slug) values('okay','archive_a','archive-4bzr')`,/shared_link_archive_namespace_conflict/);
  await fx.admin`insert into garimpa.short_link(code,tenant_id,slug) values('autk','archive_a','normal-link')`;
  await assert.rejects(()=>insert(fx.admin,'autk'),/shared_link_archive_namespace_conflict/);
  await assert.rejects(()=>insert(fx.admin,'ptej','normal-link'),/shared_link_archive_namespace_conflict/);
  await assert.rejects(()=>fx.admin`update garimpa.short_link set code='4bzr' where code='autk'`,/shared_link_archive_namespace_conflict/);
  const version=(await fx.admin`select revision from garimpa.shared_link_archive_namespace`)[0].revision;
  await fx.admin`update garimpa.publication set status='inactive' where id='live-publication'`;
  await fx.admin`update garimpa.publication set slug=slug where id='live-publication'`;
  await fx.admin`update garimpa.short_link set slug=slug,code=code where code='autk'`;
  assert.equal((await fx.admin`select revision from garimpa.shared_link_archive_namespace`)[0].revision,version,'irrelevant/unchanged updates do not serialize namespace');
  console.log('PASS colisões alias/slug nas duas direções, inclusive entre contas; updates irrelevantes ignorados');

  const entered=gate(),release=gate();
  const importing=fx.admin.begin(async(tx:any)=>{await insert(tx,'ptej');entered.resolve();await release.promise;});
  await entered.promise;
  const colliding=secondOwner.begin((tx:any)=>tx`insert into garimpa.short_link(code,tenant_id,slug) values('ptej','archive_b','concurrent-live')`);
  const rejected=assert.rejects(()=>colliding,/shared_link_archive_namespace_conflict/);
  try{await untilBlocked();}finally{release.resolve();}
  await importing;await rejected;
  assert.equal((await fx.admin`select count(*)::int n from garimpa.short_link where code='ptej'`)[0].n,0);
  const liveEntered=gate(),liveRelease=gate();
  const issuing=fx.admin.begin(async(tx:any)=>{await tx`insert into garimpa.short_link(code,tenant_id,slug) values('zpd7','archive_a','live-first')`;liveEntered.resolve();await liveRelease.promise;});
  await liveEntered.promise;
  const archived=secondOwner.begin((tx:any)=>insert(tx,'zpd7'));
  const archiveRejected=assert.rejects(()=>archived,/shared_link_archive_namespace_conflict/);
  try{await untilBlocked();}finally{liveRelease.resolve();}
  await issuing;await archiveRejected;
  assert.equal(await projection('alias','zpd7'),null);
  await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at)
    values('concurrent-product','archive_a','shopee','concurrent','Live publication','https://shopee.com.br/concurrent',1000,now())`;
  const publicationEntered=gate(),publicationRelease=gate();
  const archivePublication=fx.admin.begin(async(tx:any)=>{await insert(tx,'bjjj');publicationEntered.resolve();await publicationRelease.promise;});
  await publicationEntered.promise;
  const publicationAttempt=secondOwner.begin((tx:any)=>tx`insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug)
    values('concurrent-publication','archive_a','concurrent-product','affiliate_a','web','archive-bjjj')`);
  const publicationRejected=assert.rejects(()=>publicationAttempt,/shared_link_archive_namespace_conflict/);
  try{await untilBlocked();}finally{publicationRelease.resolve();}
  await archivePublication;await publicationRejected;
  assert.equal((await fx.admin`select count(*)::int n from garimpa.publication where id='concurrent-publication'`)[0].n,0);
  console.log('PASS concorrência real nas três tabelas: importação e emissão serializam sem sobrescrever');

  const snapshot=gate(),continueStale=gate();
  const staleWriter=secondOwner.begin('isolation level repeatable read',async(tx:any)=>{
    await tx`select count(*) from garimpa.shared_link_archive`;snapshot.resolve();await continueStale.promise;
    await tx`insert into garimpa.short_link(code,tenant_id,slug) values('bnfx','archive_a','stale-reader')`;
  });
  const staleRejected=assert.rejects(()=>staleWriter,(error:any)=>error.code==='40001');
  await snapshot.promise;
  try{await insert(fx.admin,'bnfx');}finally{continueStale.resolve();}
  await staleRejected;
  assert.equal((await fx.admin`select count(*)::int n from garimpa.short_link where code='bnfx'`)[0].n,0);
  console.log('PASS snapshot REPEATABLE READ antigo falha com serialization_failure e mantém reserva');
}finally{if(secondOwner)await secondOwner.end();await fx.close();}
