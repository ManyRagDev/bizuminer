import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";
const require = createRequire(import.meta.url);
const { refreshHomepageEdition, readHomepageEdition, homepageEngagementReport } = require("../../packages/web/lib/homepage-db.ts");
const { getPublishedEditorialSelection, computeEditorialSelection } = require("../../packages/web/lib/editorial-selection-db.ts");
const { catalogPage } = require("../../packages/web/lib/db.ts");
const { publishedEditorialStateKey } = require("../../packages/web/lib/editorial-selection.ts");
const fixture = await commercialFixture();
const { pg, factory } = fixture;
process.env.DATABASE_URL = "postgresql://isolated-fixture-unused";
const evidence = { version: 2, currency: "BRL", priceType: "exact", variantIdentity: { state: "source_verified", key: "unit", attributes: {} }, packageQuantity: 1,
  packageContents: ["Uma unidade"], fieldStates: { sellerId: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } };
let passed = 0;
async function scenario(name: string, fn: () => Promise<void>) { await fn(); passed++; console.log(`PASS ${name}`); }
const publicQuery = async (query: string, args: any[] = []) => pg.transaction(async tx => {
  await tx.exec("set local role garimpa_public_runtime"); return (await tx.query(query, args)).rows;
});
try {
  await scenario("migration absent keeps compatibility detection read-only", async () => {
    assert.equal(await readHomepageEdition("home", "a", factory), null);
  });
  await pg.exec(await readFile(new URL("../../packages/persistence/supabase/migrations/20261023041600_optimize_public_link_reads.sql", import.meta.url), "utf8"));
  await pg.exec(await readFile(new URL("../../packages/persistence/supabase/migrations/20261027030237_compose_homepage_editions.sql", import.meta.url), "utf8"));
  await pg.exec(await readFile(new URL("../../packages/persistence/supabase/migrations/20261028041629_durable_product_presentation.sql", import.meta.url), "utf8"));
  await pg.exec(`
    insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name,status)
      values('aff_a','a','a','A','active'),('aff_b','b','b','B','active');
    insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner');
    insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado');
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at,category,image_url)
      select 'p_'||i,case when i<29 then 'a' else 'b' end,case when i%2=0 then 'shopee' else 'aliexpress' end,
        i::text,case when i<9 then 'Fone de ouvido '||i else 'Produto independente '||i end,
        'https://example.test/product/'||i,2500,now(),case when i%3=0 then 'Casa' else 'Tecnologia' end,'https://example.test/image.jpg'
      from generate_series(1,30) i;
    insert into garimpa.product_curation(tenant_id,product_id,status)
      select tenant_id,id,'approved' from garimpa.product on conflict(tenant_id,product_id) do update set status='approved';
    insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url)
      select 'pub_'||id,tenant_id,'aff_'||tenant_id,id,'web',case when marketplace='shopee' then 'shp-' else 'ali-' end||external_id,'active','https://example.test/affiliate' from garimpa.product;
  `);
  await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,rating_star,offer_evidence)
    select 'obs_'||id,tenant_id,id,2500,now(),4.7,$1::jsonb from garimpa.product`, [JSON.stringify(evidence)]);
  await scenario("public GET never creates an edition; transition remains available before explicit initialization", async () => {
    assert.equal((await getPublishedEditorialSelection("home", "a", factory)).homepageReady, undefined);
    assert.equal((await pg.query("select count(*)::int n from garimpa.homepage_edition")).rows[0].n, 0);
    const routine = await refreshHomepageEdition("a", factory, new Date(), false, false);
    assert.equal(routine.blocked, "initialization_required");
    assert.equal((await pg.query("select count(*)::int n from garimpa.homepage_edition")).rows[0].n, 0);
  });
  await scenario("dry run calculates composition without writing or crossing accounts", async () => {
    const preview = await refreshHomepageEdition("a", factory, new Date(), true);
    assert.equal(preview.ready, true); assert.ok(preview.count > 0);
    assert.ok(preview.products.every((p: any) => !["p_29", "p_30"].includes(p.id)));
    assert.equal((await pg.query("select count(*)::int n from garimpa.homepage_edition")).rows[0].n, 0);
  });
  await scenario("initialization refuses an unreviewed pool without clarity evidence", async () => {
    await pg.exec("update garimpa.price_observation set offer_evidence='{}' where tenant_id='a'");
    const result = await refreshHomepageEdition("a", factory);
    assert.equal(result.blocked, "no_qualified_products");
    assert.equal((await pg.query("select count(*)::int n from garimpa.homepage_edition")).rows[0].n, 0);
    await pg.query("update garimpa.price_observation set offer_evidence=$1 where tenant_id='a'", [JSON.stringify(evidence)]);
  });
  let first: any;
  await scenario("persisted edition powers home, pauta and default grid with identical order", async () => {
    const result = await refreshHomepageEdition("a", factory);
    assert.equal(result.ready, true); assert.ok(result.count >= 12);
    first = await getPublishedEditorialSelection("home", "a", factory);
    const pauta = await getPublishedEditorialSelection("pauta", "a", factory);
    assert.deepEqual(first.products.map((p: any) => p.id), pauta.products.map((p: any) => p.id));
    const page = await catalogPage({}, "a", factory, first);
    assert.deepEqual(page.page.deals.map((p: any) => p.id), first.products.slice(0, 12).map((p: any) => p.id));
    assert.equal(page.page.total, first.products.length);
    assert.equal(page.page.selectionStateKey, publishedEditorialStateKey(first));
    assert.equal(first.heroProductIds.length, 3);
    assert.ok(first.products.slice(0, 12).filter((p: any) => p.title.startsWith("Fone")).length <= 2);
    assert.ok(!JSON.stringify(first).match(/observationId|assessmentId|productUrl|criticalDoubts|dimensions/));
  });
  await scenario("second refresh preserves edition and order, timestamps are not novelty", async () => {
    const persistedBefore = await readHomepageEdition("home", "a", factory);
    const refresh = await refreshHomepageEdition("a", factory);
    assert.equal(refresh.changed, false);
    const persistedAfter = await readHomepageEdition("home", "a", factory);
    assert.deepEqual(persistedAfter.products, persistedBefore.products);
    const second = await getPublishedEditorialSelection("home", "a", factory);
    assert.equal(second.homepageEditionId, first.homepageEditionId);
    assert.deepEqual(second.products, first.products);
    assert.equal(publishedEditorialStateKey(second), publishedEditorialStateKey(first));
  });
  await scenario("unchanged public reads use the stored edition instead of computing the candidate pool", async () => {
    const timings: Record<string, number[]> = { stored: [], computed: [] };
    for (let i = 0; i < 5; i++) {
      let started = performance.now(); await readHomepageEdition("home", "a", factory); timings.stored.push(performance.now() - started);
      started = performance.now(); await computeEditorialSelection("home", "a", factory); timings.computed.push(performance.now() - started);
    }
    console.log(JSON.stringify({ isolatedFixtureMs: Object.fromEntries(Object.entries(timings).map(([key, samples]) => [key, +(samples.reduce((a, b) => a + b) / samples.length).toFixed(2)])) }));
  });
  await scenario("a new review or material title change invalidates the snapshot before refresh", async () => {
    const product = first.products[0];
    await pg.query("update garimpa.product set title='Anúncio alterado' where id=$1", [product.id]);
    assert.ok((await readHomepageEdition("home", "a", factory)).products.every((p: any) => p.id !== product.id));
    await pg.query("update garimpa.product set title=$2 where id=$1", [product.id, product.title]);
    await pg.query("insert into garimpa.editorial_assessment(id,tenant_id,product_id,actor_app_user_id,policy_version,evidence_fingerprint,assessment,snapshot) values('new_review','a',$1,'user_a','achadinhos-v1','changed','{}','{}')", [product.id]);
    assert.ok((await readHomepageEdition("home", "a", factory)).products.every((p: any) => p.id !== product.id));
    await pg.exec("delete from garimpa.editorial_assessment where id='new_review'");
  });
  await scenario("explicit sort/filter retains catalog and uses the same state key", async () => {
    const page = await catalogPage({ sort: "price", category: "Casa" }, "a", factory, first);
    assert.ok(page.page.deals.every((p: any) => p.category === "Casa"));
    assert.equal(page.page.selectionStateKey, publishedEditorialStateKey(first));
  });
  await scenario("eligibility is rechecked before refresh: rejection, price update and publication withdrawal disappear", async () => {
    const [a, b, c] = first.products;
    await pg.query("update garimpa.product_curation set status='rejected' where product_id=$1", [a.id]);
    await pg.query("insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('new_price','a',$1,9999,now()+interval '1 second',$2)", [b.id, JSON.stringify(evidence)]);
    await pg.query("update garimpa.publication set status='expired' where product_id=$1", [c.id]);
    const current = await readHomepageEdition("home", "a", factory);
    assert.ok(current.products.every((p: any) => ![a.id, b.id, c.id].includes(p.id)));
    await pg.query("update garimpa.product_curation set status='approved' where product_id=$1", [a.id]);
    await pg.query("delete from garimpa.price_observation where id='new_price'");
    await pg.query("update garimpa.publication set status='active' where product_id=$1", [c.id]);
  });
  await scenario("batched telemetry deduplicates, validates product/position and reports denominators", async () => {
    const id = first.products[0].id, view = "00000000-0000-4000-8000-000000000001";
    const events = [{ productId: id, surface: "grid", position: 0, event: "impression" }, { productId: id, surface: "grid", position: 0, event: "outbound" },
      { productId: "p_30", surface: "grid", position: 0, event: "impression" }, { productId: id, surface: "grid", position: 23, event: "impression" }];
    for (let i = 0; i < 2; i++) await publicQuery("select garimpa.record_homepage_engagement('a',$1,$2,$3)", [first.homepageEditionId, view, JSON.stringify(events)]);
    const rows = await homepageEngagementReport("a", factory);
    assert.equal(rows.length, 1); assert.equal(rows[0].impressions, 1); assert.equal(rows[0].outbound, 1);
    assert.equal((await homepageEngagementReport("b", factory)).length, 0);
    await assert.rejects(publicQuery("select * from garimpa.homepage_engagement"), /permission denied/);
    await assert.rejects(pg.transaction(async tx => { await tx.exec("set local role anon"); await tx.query("select garimpa.read_homepage_edition('a','home')"); }), /permission denied/);
  });
  await scenario("RLS blocks direct access to other account snapshots and history", async () => {
    await pg.transaction(async tx => {
      await tx.exec("set local role garimpa_app; select set_config('garimpa.tenant_id','b',true)");
      assert.equal((await tx.query("select * from garimpa.homepage_edition")).rows.length, 0);
      assert.equal((await tx.query("select * from garimpa.homepage_product_history")).rows.length, 0);
    });
  });
  await scenario("suspended account and stale prices vanish without recomputation", async () => {
    await pg.exec("update garimpa.affiliate_account set status='suspended' where tenant_id='a'");
    assert.equal((await readHomepageEdition("home", "a", factory)).products.length, 0);
    await pg.exec("update garimpa.affiliate_account set status='active' where tenant_id='a'; update garimpa.price_observation set observed_at=now()-interval '49 hours' where tenant_id='a'");
    assert.equal((await readHomepageEdition("home", "a", factory)).products.length, 0);
    await pg.exec("update garimpa.price_observation set observed_at=now() where tenant_id='a'");
  });
  await scenario("explicitly empty/expired editorial decisions are never backfilled", async () => {
    await pg.exec("insert into garimpa.editorial_selection(id,tenant_id,version,status,valid_until,actor_app_user_id) values('manual','a',1,'active',now()+interval '1 day','user_a')");
    assert.equal((await readHomepageEdition("home", "a", factory)).products.length, 0, "old automatic snapshot invalidated immediately");
    await refreshHomepageEdition("a", factory);
    const empty = await readHomepageEdition("home", "a", factory);
    assert.equal(empty.mode, "editorial"); assert.equal(empty.products.length, 0);
    await pg.exec("update garimpa.editorial_selection set status='retired' where id='manual'");
    await refreshHomepageEdition("a", factory);
    assert.equal((await readHomepageEdition("home", "a", factory)).products.length, 0);
  });
  console.log(JSON.stringify({ passed, engine: "PGlite PostgreSQL", remoteWrites: 0 }));
} finally { await pg.close(); }
