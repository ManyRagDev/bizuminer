/** Real Next HTTP → restricted SQL RPC → imported archive. No provider is called. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { nativePostgresFixture } from './native-postgres-fixture.ts';
import { replacementRollout } from './replacement-rollout.ts';
import { prepareSharedLinkArchive, importSharedLinkArchive, SHARED_LINK_ALIASES } from '../../packages/persistence/src/shared-link-archive-import.ts';

const web = fileURLToPath(new URL('../../packages/web/', import.meta.url));
const distDir = process.env.BIZUMINER_DIST_DIR || '.next-shared-links';
await readFile(new URL(`../../packages/web/${distDir}/BUILD_ID`, import.meta.url));
const fx = await nativePostgresFixture();
let child: ChildProcess | undefined;
let output = '';
const tenantId = 'archive_fixture';
const affiliateId = 'aff_archive_fixture';
const aliases = [...SHARED_LINK_ALIASES];
const slugs = aliases.map(code => `shopee-archive-fixture-${code}`);
const destinations = aliases.map(code => `https://shope.ee/${code}?fixture=archive`);
const snapshot: Record<string, any[]> = {
  'garimpa.short_link': aliases.map((code, i) => ({code,slug:slugs[i],tenant_id:tenantId})),
  'garimpa.publication': aliases.map((code, i) => ({id:`pub_${code}`,product_id:`product_${code}`,tenant_id:tenantId,
    affiliate_id:affiliateId,slug:slugs[i],affiliate_url:destinations[i],channel:'web',status:'active'})),
  'garimpa.product': aliases.map(code => ({id:`product_${code}`,tenant_id:tenantId,marketplace:'shopee',
    title:`Produto arquivado ${code}`,image_url:null,last_capture_run_id:`excluded_run_${code}`})),
  'source.latest_price_evidence': aliases.map(code => ({id:`obs_${code}`,tenant_id:tenantId,product_id:`product_${code}`,
    price_cents:12999,observed_at:'2025-01-01T00:00:00Z',capture_run_id:`excluded_run_${code}`,extension_device_id:'excluded_device'})),
};
const compressed = gzipSync(JSON.stringify(snapshot));
const plan = prepareSharedLinkArchive(compressed,{tenantId,affiliateId,expectedSha256:createHash('sha256').update(compressed).digest('hex')});

try {
  const {units} = await replacementRollout();
  for (const unit of units) await fx.admin.begin((tx:any) => tx.unsafe(unit.sql));
  // Preserve the normal public path, including its newest recency rules.
  for (const file of ['20261023041600_optimize_public_link_reads.sql', '20261027030237_compose_homepage_editions.sql',
    '20261028041629_durable_product_presentation.sql','20261101125432_renew_editorial_pauta.sql',
    '20261101193221_improve_editorial_recommendations.sql','20261102131234_optimize_price_observation_scope.sql',
    '20261020002440_garimpa_comparative_evidence_event.sql','20261111042204_pauta_versioned_selection.sql',
    '20261107185200_fix_price_comparability_and_currency_defaults.sql','20261109120000_amazon_monetized_target.sql']) {
    await fx.pg.exec(await readFile(new URL(`../../packages/persistence/supabase/migrations/${file}`,import.meta.url),'utf8'));
  }
  const directory = new URL('../../packages/persistence/supabase/migrations/',import.meta.url);
  const migrations = (await readdir(directory)).filter(file => /^\d+_shared_link_archive\.sql$/.test(file));
  assert.equal(migrations.length,1);
  await fx.pg.exec(await readFile(new URL(migrations[0],directory),'utf8'));
  await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name)
    values(${affiliateId},${tenantId},${tenantId},'Arquivo sintético')`;
  // The last conflicting alias must roll back all seven earlier inserts.
  await fx.admin`insert into garimpa.short_link(code,tenant_id,slug) values(${aliases[7]},${tenantId},'existing-fixture-link')`;
  await assert.rejects(() => importSharedLinkArchive(fx.admin,plan), /namespace_conflict/);
  assert.equal((await fx.admin`select count(*)::int n from garimpa.shared_link_archive`)[0].n,0);
  await fx.admin`delete from garimpa.short_link where code=${aliases[7]}`;
  const sourceVersions = await fx.admin`select * from garimpa.pauta_source_version order by tenant_id,channel`;
  assert.deepEqual(await importSharedLinkArchive(fx.admin,plan),{inserted:8,replayed:0});
  assert.deepEqual(await importSharedLinkArchive(fx.admin,plan),{inserted:0,replayed:8});
  assert.deepEqual(await fx.admin`select * from garimpa.pauta_source_version order by tenant_id,channel`,sourceVersions);

  const reservation = createServer();
  await new Promise<void>((resolve,reject) => {reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
  const port = (reservation.address() as {port:number}).port;
  await new Promise<void>((resolve,reject) => reservation.close(error => error ? reject(error) : resolve()));
  const [{dbport}] = await fx.admin`select inet_server_port() as dbport`;
  child = spawn(process.execPath,[`${web}/node_modules/next/dist/bin/next`,'start','-p',String(port),'-H','127.0.0.1'],{
    cwd:web, env:{PATH:process.env.PATH,NODE_ENV:'production',BIZUMINER_DIST_DIR:distDir,
      DATABASE_URL:`postgresql://garimpa_app@127.0.0.1:${dbport}/postgres?sslmode=disable`,
      SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_PUBLISHABLE_KEY:'fixture-not-a-secret',
      NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-not-a-secret',
      NEXT_PUBLIC_SITE_URL:`http://127.0.0.1:${port}`,NEXT_PUBLIC_GA_ID:'',GEMINI_API_KEY:'',
      AUTH_LOGIN_MODE:'password',
      SHOPEE_CAPTURE_ENABLED:'false',ALIEXPRESS_CAPTURE_ENABLED:'false',CAPTURE_EXECUTOR:'durable'},
    stdio:['ignore','pipe','pipe'],
  });
  child.stdout?.on('data',chunk => {output=(output+chunk.toString()).slice(-16000);});
  child.stderr?.on('data',chunk => {output=(output+chunk.toString()).slice(-16000);});
  const origin = `http://127.0.0.1:${port}`;
  const get = (path:string) => fetch(`${origin}${path}`,{redirect:'manual',signal:AbortSignal.timeout(15000)});
  let ready = false;
  for (let i=0;i<100;i++) {
    if (child.exitCode !== null) throw new Error(`next_fixture_exited: ${output}`);
    try {const response=await get('/favicon.svg');if(response.status===200){ready=true;break;}} catch {}
    await delay(100);
  }
  assert.ok(ready,`next_fixture_not_ready: ${output}`);
  const login=await get('/entrar?next=%2Fpauta');
  const loginHtml=await login.text();
  assert.equal(login.status,200);
  assert.match(loginHtml,/action="\/auth\/password"/);
  assert.match(loginHtml,/type="password"/);
  assert.ok(!loginHtml.includes('Continuar com Google'));
  assert.ok(!loginHtml.includes('Esqueci minha senha'));
  const loginPost=(requestOrigin:string)=>fetch(`${origin}/auth/password`,{method:'POST',redirect:'manual',
    headers:{Origin:requestOrigin,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({email:'invalid',password:'fixture-secret-not-a-real-password',next:'https://foreign.invalid/'}),
    signal:AbortSignal.timeout(15000)});
  assert.equal((await loginPost('https://foreign.invalid')).status,403);
  const invalidLogin=await loginPost(origin);
  assert.equal(invalidLogin.status,303);
  const loginLocation=new URL(invalidLogin.headers.get('location')!);
  assert.equal(loginLocation.origin,origin);
  assert.equal(loginLocation.searchParams.get('next'),'/minha-area');
  assert.ok(!loginLocation.href.includes('fixture-secret'));
  assert.match(invalidLogin.headers.get('cache-control') ?? '',/no-store/);
  for (const [i,alias] of aliases.entries()) {
    const short=await get(`/p/${alias}`);
    assert.equal(short.status,302,`${alias}: ${await short.clone().text()}`);
    assert.equal(new URL(short.headers.get('location')!,origin).pathname,`/bizu/${slugs[i]}`);
    assert.match(short.headers.get('cache-control') ?? '',/no-store/);
    const bio=await get(`/bio/${tenantId}/${alias.slice(-3)}`);
    assert.equal(bio.status,302);
    assert.equal(new URL(bio.headers.get('location')!,origin).pathname,`/p/${alias}`);
    assert.equal((await get(`/bio/foreign/${alias.slice(-3)}`)).status,404);
    const page=await get(`/bizu/${slugs[i]}`);
    const html=await page.text();
    assert.equal(page.status,200,html.slice(0,200));
    assert.match(page.headers.get('cache-control') ?? '',/no-store/);
    assert.match(html,/Compartilhado anteriormente/i);
    assert.match(html,/preço atual não confirmado/i);
    assert.ok(html.includes(`Produto arquivado ${alias}`));
    assert.ok(html.includes(`/go/${slugs[i]}`));
    for (const forbidden of ['129,99','12999','excluded_run','excluded_device',destinations[i], 'Preço monitorado']) assert.ok(!html.includes(forbidden),forbidden);
    assert.ok(!/<script[^>]+application\/ld\+json[^>]*>[^<]*"@type"\s*:\s*"Offer"/.test(html));
    const exit=await get(`/go/${slugs[i]}`);
    assert.equal(exit.status,302);
    assert.equal(exit.headers.get('location'),destinations[i]);
    assert.match(exit.headers.get('cache-control') ?? '',/no-store/);
    for (const suffix of ['?c=foreign','?opcao=foreign','?c=']) assert.equal((await get(`/go/${slugs[i]}${suffix}`)).status,404);
  }
  const og=await get(`/bizu/${slugs[0]}/opengraph-image`);
  assert.equal(og.status,200);
  assert.match(og.headers.get('cache-control') ?? '',/no-store/);
  assert.match(og.headers.get('content-type') ?? '',/image\/(png|svg\+xml)/);
  assert.ok((await og.arrayBuffer()).byteLength>100);
  // Revocation is effective on the very next request, including warmed metadata.
  await fx.admin`update garimpa.shared_link_archive set status='revoked' where alias=${aliases[0]}`;
  assert.deepEqual(await importSharedLinkArchive(fx.admin,plan),{inserted:0,replayed:8});
  for (const path of [`/p/${aliases[0]}`,`/bizu/${slugs[0]}`,`/go/${slugs[0]}`,`/bio/${tenantId}/${aliases[0].slice(-3)}`,`/bizu/${slugs[0]}/opengraph-image`]) {
    const response=await get(path);
    if (path===`/bizu/${slugs[0]}`) {
      // Next's loading boundary may have streamed HTTP 200 before notFound().
      // Verify the final unavailable boundary and absence of the warmed offer.
      assert.ok([200,404].includes(response.status));
      const html=await response.text();
      assert.match(html,/Link indisponível/);
      assert.match(html,/noindex/);
      assert.ok(!html.includes(`Produto arquivado ${aliases[0]}`));
      assert.ok(!html.includes(`/go/${slugs[0]}`));
      assert.match(response.headers.get('cache-control') ?? '',/no-store/);
    } else assert.equal(response.status,404,path);
  }
  await fx.admin`update garimpa.affiliate_account set status='suspended' where id=${affiliateId}`;
  assert.equal((await get(`/p/${aliases[1]}`)).status,404);
  assert.equal((await get(`/go/${slugs[1]}`)).status,404);
  for (const table of ['product','price_observation','product_curation','publication','short_link','capture_run','capture_batch','triage_run','click_event','recommendation_edition','recommendation_exposure','pauta_selection_cache']) {
    const [{count}]=await fx.admin.unsafe(`select count(*)::int as count from garimpa.${table}`);
    assert.equal(count,0,`${table} must remain empty`);
  }
  assert.equal((await fx.admin`select count(*)::int n from garimpa.shared_link_archive`)[0].n,8);
  console.log('PASS Next HTTP → PostgreSQL real: importação/replay de 8 snapshots, aliases/bio/página/OG/saída, isolamento/revogação e nenhum catálogo/pauta/captura/telemetria criado. Destinos externos não visitados.');
} catch(error) {
  if(output) console.error(output);
  throw error;
} finally {
  if(child && child.exitCode===null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise<void>(resolve => child!.once('exit',()=>resolve())),delay(5000)]);
    if(child.exitCode===null) child.kill('SIGKILL');
  }
  await fx.close();
}
