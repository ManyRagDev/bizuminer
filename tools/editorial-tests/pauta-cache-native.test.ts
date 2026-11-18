import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
import { replacementRollout } from './replacement-rollout.ts';
const require = createRequire(import.meta.url);
const { readPautaAvailability, readLivePauta, readPautaVersion, confirmPautaExposure } = require('../../packages/web/lib/pauta-db.ts');
const { defaultChannelPolicy } = require('../../packages/web/lib/recommendation-policy.ts');
process.env.DATABASE_URL = 'postgresql://isolated-fixture-unused';
const fx = await nativePostgresFixture();
const account = { tenantId:'a', affiliateId:'aff_a', actor:'human', actorAppUserId:'user_a',
  authenticatedAuthUserId:'auth_a', membershipRole:'owner', requestId:'pauta-native' };
function gate() { let resolve!:()=>void; const promise = new Promise<void>(r=>{resolve=r;}); return {promise,resolve}; }
try {
  const { units } = await replacementRollout();
  for (const unit of units) await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));
  for (const file of ['20261023041600_optimize_public_link_reads.sql','20261027030237_compose_homepage_editions.sql',
    '20261028041629_durable_product_presentation.sql','20261101125432_renew_editorial_pauta.sql',
    '20261101193221_improve_editorial_recommendations.sql','20261102131234_optimize_price_observation_scope.sql',
    '20261020002440_garimpa_comparative_evidence_event.sql','20261111042204_pauta_versioned_selection.sql']) {
    await fx.pg.exec(await readFile(new URL(`../../packages/persistence/supabase/migrations/${file}`,import.meta.url),'utf8'));
  }
  await fx.pg.exec(`
    insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','a','A');
    insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner');
    insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado');
    insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id) values('aff_a','mercadolivre','fixture','tool');
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,image_url,last_price_cents,last_seen_at)
      values('p_a','a','mercadolivre','MLB123456789','Oferta inicial','https://produto.mercadolivre.com.br/MLB-123456789','https://http2.mlstatic.com/a.jpg',9900,now());
    insert into garimpa.product_curation(tenant_id,product_id,status) values('a','p_a','approved')
      on conflict(tenant_id,product_id) do update set status=excluded.status;
    insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence)
      values('o_a','a','p_a',9900,now(),'{"version":2,"currency":"BRL","priceType":"exact"}');
    create table garimpa.test_cache_writes(channel text);
    create function garimpa.test_cache_write() returns trigger language plpgsql security definer set search_path='' as $$
      begin insert into garimpa.test_cache_writes values(new.channel); return new; end $$;
    create trigger test_cache_write after insert or update on garimpa.pauta_selection_cache
      for each row execute function garimpa.test_cache_write();
  `);
  for (const channel of ['whatsapp','stories']) await fx.admin`insert into garimpa.recommendation_channel
    (tenant_id,channel,version,policy_version,enabled,policy) values('a',${channel},1,'recommendation-v1',true,${fx.admin.json(defaultChannelPolicy(channel))})`;
  const result = await Promise.all([fx.factoryA,fx.factoryB].map(factory => readPautaAvailability(account,'whatsapp',factory)));
  assert.deepEqual(result,[{active:true,count:1},{active:true,count:1}]);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.test_cache_writes`)[0].n,1);
  console.log('PASS duas sessões frias convergem em uma única composição');

  // A source writer cannot be hidden by publication of an older source version.
  await fx.admin`update garimpa.product set title='Antes da concorrência' where id='p_a'`;
  const entered = gate(), release = gate();
  const pausedFactory = () => {
    const sql:any = fx.factoryA();
    const begin = sql.begin;
    sql.begin = (work:any) => begin(async (tx:any) => {
      const unsafe = tx.unsafe.bind(tx);
      const wrapped:any = (...args:any[])=>tx(...args);
      Object.assign(wrapped,{json:tx.json.bind(tx),unsafe:(query:string,values:any[])=>{
        if (!query.includes('from garimpa.curation_queue_facts')) return unsafe(query,values);
        entered.resolve();
        return release.promise.then(()=>unsafe(query,values));
      }});
      return work(wrapped);
    });
    return sql;
  };
  const reading = readPautaAvailability(account,'whatsapp',pausedFactory);
  await entered.promise;
  const writing = fx.admin`update garimpa.product set title='Depois da concorrência' where id='p_a'`.execute();
  try {
    const until = Date.now()+3000;
    while (!(await fx.clientB`select exists(select 1 from pg_locks where not granted) blocked`)[0].blocked) {
      if (Date.now()>until) throw new Error('writer_did_not_wait_for_version_lock');
      await new Promise(resolve=>setTimeout(resolve,10));
    }
  } finally { release.resolve(); }
  await Promise.all([reading,writing]);
  const [stale] = await fx.admin`select c.source_revision<v.revision as stale from garimpa.pauta_selection_cache c
    join garimpa.pauta_source_version v using(tenant_id,channel) where c.channel='whatsapp'`;
  assert.equal(stale.stale,true);
  const fresh = await readLivePauta(account,'whatsapp',null,fx.factoryB);
  assert.equal(fresh.products[0].title,'Depois da concorrência');
  console.log('PASS escrita concorrente invalida edição anterior e leitura seguinte incorpora alteração');

  const version = await readPautaVersion(account,'whatsapp',fx.factoryA);
  await assert.rejects(()=>fx.admin.begin(async (tx:any)=>{
    await tx`update garimpa.product set title='Não pode vazar' where id='p_a'`;
    throw new Error('rollback-test');
  }),/rollback-test/);
  assert.equal(await readPautaVersion(account,'whatsapp',fx.factoryB),version);
  console.log('PASS rollback preserva versão e pauta; banco nativo descartável '+fx.version);

  // Progress invalidates only the compact presentation revision. It must not
  // compose the catalogue again, even on another database session.
  const [sourceBefore] = await fx.admin`select revision::text revision from garimpa.pauta_source_version
    where tenant_id='a' and channel='whatsapp'`;
  const [writesBefore] = await fx.admin`select count(*)::int n from garimpa.test_cache_writes`;
  await fx.admin`insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,status,metadata)
    values('10000000-0000-4000-8000-000000000001','a',array['mercadolivre'],1,'running',
      '{"execution":{"version":1,"phase":"queued"}}')`;
  const progressVersion = await readPautaVersion(account,'whatsapp',fx.factoryB);
  assert.notEqual(progressVersion,version);
  assert.equal((await fx.admin`select revision::text revision from garimpa.pauta_source_version
    where tenant_id='a' and channel='whatsapp'`)[0].revision,sourceBefore.revision);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.test_cache_writes`)[0].n,writesBefore.n);

  const current = await readLivePauta(account,'whatsapp',null,fx.factoryA);
  const offer = current.products[0];
  const confirmations = await Promise.all([fx.factoryA,fx.factoryB].map(factory =>
    confirmPautaExposure(account,'whatsapp',offer.confirmationId,offer.id,factory)));
  assert.deepEqual(confirmations,[true,true]);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.recommendation_exposure`)[0].n,1);
  assert.equal((await readPautaAvailability(account,'whatsapp',fx.factoryA)).count,0);
  assert.equal((await readPautaAvailability(account,'stories',fx.factoryB)).count,1);
  console.log('PASS progresso não recompõe; divulgação concorrente é idempotente e isolada por canal');

  // A valid cached entry does not bypass a membership revocation, including
  // replay of a previously successful business operation.
  await fx.admin`update garimpa.affiliate_membership set revoked_at=now()
    where affiliate_id='aff_a' and app_user_id='user_a'`;
  await assert.rejects(()=>readPautaVersion(account,'stories',fx.factoryA),/forbidden/);
  await assert.rejects(()=>confirmPautaExposure(account,'whatsapp',offer.confirmationId,offer.id,fx.factoryB),/forbidden/);
  console.log('PASS revogação bloqueia leitura em cache e repetição de divulgação');
} finally { await fx.close(); }
