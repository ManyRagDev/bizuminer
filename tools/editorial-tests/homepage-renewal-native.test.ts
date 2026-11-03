import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { nativePostgresFixture } from "./native-postgres-fixture.ts";
import { replacementRollout } from "./replacement-rollout.ts";
const require = createRequire(import.meta.url);
const { refreshLegacyHomepageEdition: refreshHomepageEdition, readHomepageEdition } = require("../../packages/web/lib/homepage-db.ts");
const { getHomepageRenewalState, recordHomepageRenewalFailure } = require("../../packages/web/lib/homepage-renewal-db.ts");
const { getEditorialSelectionDesk } = require("../../packages/web/lib/editorial-selection-db.ts");
const { homepageRenewalReadiness } = require("../../packages/web/lib/homepage-renewal.ts");
const fx = await nativePostgresFixture();
process.env.DATABASE_URL = "postgresql://isolated-native-fixture-unused";
let passed = 0;
async function scenario(name: string, fn: () => Promise<void>) { await fn(); passed++; console.log(`PASS ${name}`); }
try {
  const { units } = await replacementRollout();
  for (const unit of units) await fx.admin.begin((tx: any) => tx.unsafe(unit.sql));
  for (const file of ["20261023041600_optimize_public_link_reads.sql", "20261027030237_compose_homepage_editions.sql",
    "20261028041629_durable_product_presentation.sql", "20261101125432_renew_editorial_pauta.sql"]) {
    await fx.admin.begin(async (tx: any) => tx.unsafe(await readFile(new URL(`../../packages/persistence/supabase/migrations/${file}`, import.meta.url), "utf8")));
  }
  await fx.admin`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','a','A'),('aff_b','b','b','B')`;
  await fx.admin`insert into garimpa.homepage_renewal(tenant_id,enabled) values('a',true)`;
  await scenario("opt-in is retained while the candidate pool is empty", async () => {
    const result = await refreshHomepageEdition("a", fx.factoryA, new Date(), false, false);
    assert.equal(result.blocked, "no_qualified_products");
    assert.equal((await getHomepageRenewalState("a", fx.factoryA)).outcome, "awaiting_review");
    assert.equal((await fx.admin`select count(*)::int n from garimpa.homepage_edition`)[0].n, 0);
  });
  await fx.admin`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at,image_url)
    select 'p_'||i,'a','shopee',i::text,'Produto independente '||i,'https://example.test/'||i,2500,now(),'https://example.test/image.jpg' from generate_series(1,40) i`;
  await fx.admin`insert into garimpa.product_curation(tenant_id,product_id,status) select tenant_id,id,'approved' from garimpa.product
    on conflict(tenant_id,product_id) do update set status='approved'`;
  await fx.admin`insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url)
    select 'pub_'||id,'a','aff_a',id,'web','shp-'||external_id,'active','https://example.test/affiliate' from garimpa.product`;
  const evidence = { version: 2, currency: "BRL", priceType: "exact", variantIdentity: { state: "source_verified", key: "one" }, packageQuantity: 1, packageContents: ["Uma unidade"] };
  await fx.admin`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence)
    select 'obs_'||id,'a',id,2500,now(),${fx.admin.json(evidence)} from garimpa.product`;
  let first: any;
  await scenario("two marketplace workers initialize exactly one edition and converge after retry", async () => {
    const desk = await getEditorialSelectionDesk("a", fx.factoryA);
    assert.ok(homepageRenewalReadiness(desk.candidates, desk.publishedProductIds).qualified > 0,
      JSON.stringify({ candidateCount: desk.candidates.length, publications: desk.publishedProductIds.length, sample: desk.candidates[0] }));
    const results = await Promise.all([fx.factoryA, fx.factoryB].map(factory => refreshHomepageEdition("a", factory, new Date(), false, false)));
    assert.ok(results.every(result => result.ready && result.count === 24), JSON.stringify(results));
    assert.equal(results.filter(result => result.changed).length, 1);
    assert.equal((await fx.admin`select count(*)::int n from garimpa.homepage_edition`)[0].n, 1);
    assert.equal((await fx.admin`select count(*)::int n from garimpa.homepage_product_history`)[0].n, 24);
    first = await readHomepageEdition("pauta", "a", fx.factoryA);
    assert.equal(first.products.length, 24);
  });
  await scenario("concurrent due renewals rotate once, with the same published order", async () => {
    await fx.admin`update garimpa.homepage_edition set renew_after=now()-interval '1 second' where tenant_id='a'`;
    const results = await Promise.all([fx.factoryA, fx.factoryB].map(factory => refreshHomepageEdition("a", factory, new Date(), false, false)));
    assert.equal(results.filter(result => result.changed).length, 1);
    const home = await readHomepageEdition("home", "a", fx.factoryA);
    const pauta = await readHomepageEdition("pauta", "a", fx.factoryB);
    assert.deepEqual(home.products.map((p: any) => p.id), pauta.products.map((p: any) => p.id));
    assert.equal(home.products.filter((p: any) => !first.products.some((old: any) => old.id === p.id)).length, 6);
    const history = await fx.admin`select first_featured_at,last_featured_at from garimpa.homepage_product_history`;
    assert.equal(history.length, 30); assert.ok(history.every((p: any) => p.last_featured_at >= p.first_featured_at));
  });
  await scenario("failed publication rolls back edition and history, and the failure remains visible", async () => {
    const before = (await fx.admin`select selection from garimpa.homepage_edition where tenant_id='a'`)[0].selection;
    const history = await fx.admin`select * from garimpa.homepage_product_history order by product_id`;
    await fx.admin.unsafe(`create function garimpa.fixture_refuse_edition() returns trigger language plpgsql as $$begin raise exception 'fixture_publication_failure'; end$$;
      create trigger fixture_refuse_edition before update on garimpa.homepage_edition for each row execute function garimpa.fixture_refuse_edition()`);
    await assert.rejects(refreshHomepageEdition("a", fx.factoryA, new Date(), false, false), /fixture_publication_failure/);
    assert.deepEqual((await fx.admin`select selection from garimpa.homepage_edition where tenant_id='a'`)[0].selection, before);
    assert.deepEqual(await fx.admin`select * from garimpa.homepage_product_history order by product_id`, history);
    await recordHomepageRenewalFailure("a", fx.factoryA);
    assert.equal((await getHomepageRenewalState("a", fx.factoryA)).outcome, "failed");
    await fx.admin.unsafe("drop trigger fixture_refuse_edition on garimpa.homepage_edition; drop function garimpa.fixture_refuse_edition()");
  });
  await scenario("cross-account and operator writes are rejected; no public settings access", async () => {
    await fx.clientA.begin(async (tx: any) => {
      await tx`select set_config('garimpa.tenant_id','b',true)`;
      assert.equal((await tx`select * from garimpa.homepage_renewal`).length, 0);
    });
    await assert.rejects(fx.clientA.begin(async (tx: any) => {
      await tx`select set_config('garimpa.tenant_id','b',true),set_config('garimpa.membership_role','operator',true),set_config('garimpa.actor_type','human',true)`;
      await tx`insert into garimpa.homepage_renewal(tenant_id,enabled) values('b',true)`;
    }), (error: any) => error.code === "42501");
    const [permissions] = await fx.admin`select has_table_privilege('garimpa_public_runtime','garimpa.homepage_renewal','select') as public_read,
      has_table_privilege('anon','garimpa.homepage_renewal','select') as anon_read`;
    assert.equal(permissions.public_read, false); assert.equal(permissions.anon_read, false);
  });
  console.log(JSON.stringify({ passed, engine: fx.version, remoteWrites: 0 }));
} finally { await fx.close(); }
