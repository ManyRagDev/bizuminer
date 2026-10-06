import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
// The web package uses CommonJS package semantics; tsx registers its .ts
// require hook while this standalone runner remains an ES module.
const require = createRequire(import.meta.url);
const {
  getEditorialSelectionDesk, getPublishedEditorialSelection,
  replaceEditorialSelection, saveEditorialAssessment,
} = require("../../packages/web/lib/editorial-selection-db.ts");
const { EDITORIAL_DIMENSIONS, editorialEvidenceFingerprint, publishedEditorialStateKey } = require("../../packages/web/lib/editorial-selection.ts");
const { HERO_POLICY_VERSION } = require("../../packages/web/lib/hero-policy.ts");
const { topDeals, dealDetail } = require("../../packages/web/lib/db.ts");

// Real PostgreSQL execution through PGlite. This adapter only converts the
// postgres.js query interface; no service query is mocked or intercepted.
const pg = new PGlite();
function adapter(client: Pick<PGlite, "query" | "exec">): any {
  const sql: any = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const parameters: unknown[] = [];
    let query = parts[0];
    for (let index = 0; index < values.length; index++) {
      const value = values[index] as any;
      if (value?.rawFragment !== undefined) query += value.rawFragment;
      else { parameters.push(value); query += `$${parameters.length}`; }
      query += parts[index + 1];
    }
    return (await client.query(query, parameters)).rows;
  };
  sql.unsafe = (query: string, values: unknown[] = []) => ({
    rawFragment: query,
    then: (resolve: any, reject: any) => client.query(query, values).then((result) => result.rows).then(resolve, reject),
  });
  sql.json = (value: unknown) => JSON.stringify(value);
  sql.end = async () => {};
  sql.begin = async (...args: any[]) => pg.transaction(async (tx) => {
    if (typeof args[0] === "string") await tx.exec(`set transaction ${args[0]}`);
    return args.at(-1)(adapter(tx));
  });
  return sql;
}
const factory: any = () => adapter(pg);
process.env.DATABASE_URL = "postgresql://isolated-fixture-unused";
let passed = 0;
async function scenario(label: string, run: () => Promise<void>) {
  await run();
  console.log(`PASS ${label}`);
  passed++;
}

await pg.exec(`
  create role garimpa_app; create role anon; create role authenticated;
  create schema garimpa;
  alter default privileges in schema garimpa grant select, insert, update, delete on tables to garimpa_app;
  create table garimpa.affiliate_account(tenant_id text primary key);
  create table garimpa.app_user(id text primary key, tenant_id text not null,
    unique(id,tenant_id));
  create table garimpa.product(id text primary key, tenant_id text not null,
    title text not null, product_url text not null, image_url text, category text,
    marketplace text not null, external_id text not null, last_seen_at timestamptz not null,
    unique(id,tenant_id));
  create table garimpa.product_curation(product_id text not null, tenant_id text not null,
    status text not null, primary key(tenant_id,product_id));
  create table garimpa.capture_run(id text primary key,tenant_id text not null,
    marketplace text not null,status text not null,finished_at timestamptz,started_at timestamptz);
  create table garimpa.price_observation(id text primary key, tenant_id text not null,
    product_id text not null, price_cents integer not null, original_price_cents integer,
    claimed_discount_rate double precision, rating_star double precision, sales_label text,
    sales_count integer, observed_at timestamptz not null, capture_run_id text);
  create view garimpa.curation_queue_facts as
    select p.*, c.status, o.price_cents, o.original_price_cents, o.claimed_discount_rate,
      o.rating_star,o.sales_label,o.sales_count,o.observed_at,
      stats.observation_count, stats.history_days, stats.previous_min_price_cents,
      (stats.observation_count >=3 and stats.history_days>=7 and o.price_cents<=stats.previous_min_price_cents) as lowest_verified
    from garimpa.product p join garimpa.product_curation c
      on c.product_id=p.id and c.tenant_id=p.tenant_id
    join lateral (select * from garimpa.price_observation x where x.product_id=p.id
      and x.tenant_id=p.tenant_id order by observed_at desc,id desc limit 1) o on true
    join lateral (select count(*)::int as observation_count,
      floor(extract(epoch from(o.observed_at-min(x.observed_at)))/86400)::int as history_days,
      min(x.price_cents) filter(where x.id<>o.id) as previous_min_price_cents
      from garimpa.price_observation x where x.product_id=p.id and x.tenant_id=p.tenant_id) stats on true;
  insert into garimpa.affiliate_account values('local'),('other');
  insert into garimpa.app_user values('reviewer','local'),('outsider','other');
  grant usage on schema garimpa to garimpa_app;
  grant select on all tables in schema garimpa to garimpa_app;
`);

await scenario("migration absent: public and desk return readiness instead of crashing", async () => {
  assert.deepEqual((await getPublishedEditorialSelection("home", "local", factory)).products, []);
  assert.equal((await getPublishedEditorialSelection("home", "local", factory)).schemaReady, false);
  assert.equal((await getEditorialSelectionDesk("local", factory)).schemaReady, false);
  const emptySelection = await getPublishedEditorialSelection("home", "local", factory);
  assert.deepEqual((await topDeals({ sort: "signal" }, "local", emptySelection, factory)).deals, []);
  assert.equal(await dealDetail("shp-111", "local", factory), null);
});

const migration = await readFile(new URL("../../packages/persistence/supabase/migrations/20261005235546_editorial_selection.sql", import.meta.url), "utf8");
await pg.exec(migration);

const evidence = { version: 1, variantKey: "60l", packageQuantity: 1, packageContents: ["Um saco, sem cobertores"], dimensions: "60 litros", source: { marketplace: "shopee", method: "affiliate_api", url: "https://shopee.com.br/example", capturedAt: new Date().toISOString() } };
const product = { title: "Organizador de cobertores", productUrl: "https://shopee.com.br/example", imageUrl: "https://cf.shopee.com.br/file/example", category: "casa", offerEvidence: evidence };
async function reset() {
  await pg.exec("truncate garimpa.editorial_selection_item,garimpa.editorial_selection,garimpa.editorial_assessment,garimpa.price_observation,garimpa.product_curation,garimpa.product;");
  await pg.query(`insert into garimpa.product values($1,'local',$2,$3,$4,$5,'shopee','111',now()),('product_other','other','Other','https://example.com/other',null,'casa','shopee','222',now())`, ["product_1", product.title, product.productUrl, product.imageUrl, product.category]);
  await pg.exec("insert into garimpa.product_curation values('product_1','local','approved'),('product_other','other','approved');");
  await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('obs_1','local','product_1',2029,now(),$1)`, [JSON.stringify(evidence)]);
}
function input(changes: Record<string, unknown> = {}) {
  return {
    productId: "product_1", evidenceFingerprint: editorialEvidenceFingerprint(product),
    dimensions: Object.fromEntries(EDITORIAL_DIMENSIONS.map(({ id }) => [id, { level: "adequate", reason: "Informação conferida no anúncio pelo editor." }])),
    audience: "Quem precisa organizar roupas de cama.", benefit: "Guardar cobertores protegidos da poeira.",
    purchaseContents: "Um saco organizador, sem cobertores.", publicRationale: "Uma opção acessível para organizar roupas de cama, vendida por unidade.",
    criticalDoubts: [], maxPriceCents: 2500, ...changes,
  } as any;
}
async function save(changes: Record<string, unknown> = {}) {
  const result = await saveEditorialAssessment(input(changes), "reviewer", "local", factory);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error(result.error);
  return result.assessment;
}
async function activate(assessmentId: string, expectedVersion: number | null = null, destinations: any = ["home", "pauta"], context = "") {
  return replaceEditorialSelection({ expectedVersion, validUntil: new Date(Date.now() + 86400000).toISOString(), items: [{ productId: "product_1", assessmentId, destinations, context }] }, "reviewer", "local", factory);
}
async function selected() {
  await reset();
  const assessment = await save();
  const result = await activate(assessment.id);
  assert.equal(result.ok, true, JSON.stringify(result));
  return assessment;
}
async function publicCount(destination: "home" | "pauta" = "home") {
  return (await getPublishedEditorialSelection(destination, "local", factory)).products.length;
}

await scenario("migration creates tenant integrity, RLS and append-only privileges", async () => {
  await reset();
  await assert.rejects(pg.query(`insert into garimpa.editorial_assessment(tenant_id,product_id,actor_app_user_id,policy_version,evidence_fingerprint,assessment,snapshot) values('local','product_other','reviewer','v1','x','{}','{}')`), (error: any) => error.code === "23503");
  const privileges = (await pg.query<{ readable: boolean; mutable: boolean; public_readable: boolean; rls: boolean }>(`select has_table_privilege('garimpa_app','garimpa.editorial_assessment','SELECT') as readable,
    has_table_privilege('garimpa_app','garimpa.editorial_assessment','UPDATE') as mutable,
    has_table_privilege('anon','garimpa.editorial_assessment','SELECT') as public_readable,
    relrowsecurity as rls from pg_class where oid='garimpa.editorial_assessment'::regclass`)).rows[0];
  assert.deepEqual(privileges, { readable: true, mutable: false, public_readable: false, rls: true });
  await pg.exec("set role garimpa_app");
  try {
    await pg.query("select * from garimpa.editorial_assessment");
    await assert.rejects(pg.query("update garimpa.editorial_assessment set policy_version='tampered'"), (error: any) => error.code === "42501");
  } finally { await pg.exec("reset role"); }
  await pg.exec("set role anon");
  try {
    await assert.rejects(pg.query("select * from garimpa.editorial_assessment"), (error: any) => error.code === "42501");
  } finally { await pg.exec("reset role"); }
});

await scenario("same persisted version reaches both destinations; internal fields stay private", async () => {
  await selected();
  const home = await getPublishedEditorialSelection("home", "local", factory);
  const pauta = await getPublishedEditorialSelection("pauta", "local", factory);
  assert.equal(home.version, 1); assert.equal(home.id, pauta.id);
  assert.equal(home.products[0].id, pauta.products[0].id);
  assert.equal(home.products[0].editorialPurchaseContents, input().purchaseContents);
  for (const key of ["assessment", "offerEvidence", "evidenceFingerprint", "selectionBlockers", "curationStatus"]) assert.equal(key in home.products[0], false);
  assert.equal((await getPublishedEditorialSelection("home", "other", factory)).products.length, 0);
});

await scenario("assessment retains the facts originally reviewed and rejects stale fingerprints", async () => {
  await reset();
  const assessment = await save();
  await pg.exec("update garimpa.product set title='Novo kit com três unidades'");
  const oldInput = await saveEditorialAssessment(input(), "reviewer", "local", factory);
  assert.equal(oldInput.ok, false); if (!oldInput.ok) assert.equal(oldInput.error, "evidence_changed");
  const stored = (await pg.query<{ snapshot: any; assessment: any }>("select snapshot,assessment from garimpa.editorial_assessment where id=$1", [assessment.id])).rows[0];
  assert.equal(stored.snapshot.title, product.title);
  assert.equal(stored.snapshot.price_cents, 2029);
  assert.deepEqual(stored.snapshot.offer_evidence.packageContents, evidence.packageContents);
  assert.equal(stored.assessment.purchaseContents, input().purchaseContents);
});

await scenario("cross-tenant actors and assessment references cannot activate", async () => {
  await reset();
  assert.equal((await saveEditorialAssessment(input(), "outsider", "local", factory)).ok, false);
  const assessment = await save();
  await assert.rejects(pg.query(`insert into garimpa.editorial_selection(tenant_id,version,status,valid_until,actor_app_user_id) values('local',1,'active',now()+interval '1 day','outsider')`), (error: any) => error.code === "23503");
  assert.equal((await activate("missing_assessment")).ok, false);
  const activated = await activate(assessment.id); assert.equal(activated.ok, true);
  if (!activated.ok) throw new Error(activated.error);
  await assert.rejects(pg.query(`insert into garimpa.editorial_selection_item(tenant_id,selection_id,product_id,assessment_id,position,destinations) values('local',$1,'product_other',$2,1,array['home','pauta'])`, [activated.selection.id, assessment.id]), (error: any) => error.code === "23503");
});

await scenario("database rejects duplicated destinations even outside application validator", async () => {
  const assessment = await selected();
  const head = (await pg.query<{ id: string }>("select id from garimpa.editorial_selection where status='active'")).rows[0];
  await pg.exec("delete from garimpa.editorial_selection_item");
  for (const destinations of [["home", "home"], ["pauta", "pauta"], ["email"], []]) {
    await assert.rejects(pg.query(`insert into garimpa.editorial_selection_item(tenant_id,selection_id,product_id,assessment_id,position,destinations) values('local',$1,'product_1',$2,0,$3)`, [head.id, assessment.id, destinations]), (error: any) => error.code === "23514");
  }
});

await scenario("a newer review reopens doubts and immediately withdraws old published assessment", async () => {
  const first = await selected();
  assert.equal(await publicCount(), 1);
  await save({ criticalDoubts: ["O pacote inclui mesmo o organizador de 60 litros?"] });
  assert.equal(await publicCount(), 0); assert.equal(await publicCount("pauta"), 0);
  const stale = await activate(first.id, 1);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.error, "assessment_superseded");
});

await scenario("price decreases remain valid; price above assessed maximum disappears", async () => {
  await selected();
  await pg.exec("update garimpa.price_observation set price_cents=1500");
  assert.equal(await publicCount(), 1);
  await pg.exec("update garimpa.price_observation set price_cents=2501");
  assert.equal(await publicCount(), 0);
});

await scenario("unknown/weak dimensions and stale observations block activation", async () => {
  for (const level of ["unknown", "weak"]) {
    await reset();
    const data = input(); data.dimensions.clarity.level = level;
    const assessment = await save({ dimensions: data.dimensions });
    assert.equal((await activate(assessment.id)).ok, false);
  }
  await reset(); const assessment = await save();
  await pg.exec("update garimpa.price_observation set observed_at=now()-interval '49 hours'");
  assert.equal((await activate(assessment.id)).ok, false);
});

await scenario("material title or package changes invalidate; temporal evidence metadata does not", async () => {
  await selected();
  await pg.query("update garimpa.price_observation set offer_evidence=$1", [JSON.stringify({ ...evidence, source: { ...evidence.source, capturedAt: new Date().toISOString() }, reviewCount: 999 })]);
  assert.equal(await publicCount(), 1);
  await pg.query("update garimpa.price_observation set offer_evidence=$1", [JSON.stringify({ ...evidence, packageQuantity: 3 })]);
  assert.equal(await publicCount(), 0);
  await selected(); await pg.exec("update garimpa.product set title='Kit com cobertores'");
  assert.equal(await publicCount(), 0);
});

await scenario("declared price ranges block activation even with a manual positive review", async () => {
  await reset();
  const rangedEvidence = { ...evidence, priceMinCents: 1000, priceMaxCents: 5000 };
  await pg.query("update garimpa.price_observation set offer_evidence=$1", [JSON.stringify(rangedEvidence)]);
  const assessment = await save({ evidenceFingerprint: editorialEvidenceFingerprint({ ...product, offerEvidence: rangedEvidence }) });
  assert.equal((await activate(assessment.id)).ok, false);
});

await scenario("rejection, presence expiry and price expiry block public reads", async () => {
  await selected(); await pg.exec("update garimpa.product_curation set status='rejected'");
  assert.equal(await publicCount(), 0);
  await selected(); await pg.exec("update garimpa.product set last_seen_at=now()-interval '8 days'");
  assert.equal(await publicCount(), 0);
  await selected(); await pg.exec("update garimpa.price_observation set observed_at=now()-interval '49 hours'");
  assert.equal(await publicCount(), 0);
});

await scenario("selection expiry blocks both projections without mutating curation", async () => {
  await selected();
  await pg.exec("update garimpa.editorial_selection set created_at=now()-interval '2 days',valid_until=now()-interval '1 day'");
  assert.equal(await publicCount(), 0); assert.equal(await publicCount("pauta"), 0);
  assert.equal((await pg.query<{ status: string }>("select status from garimpa.product_curation where product_id='product_1'")).rows[0].status, "approved");
});

await scenario("optimistic conflicts and invalid replacements preserve active selection", async () => {
  const assessment = await selected();
  const conflict = await activate(assessment.id, null);
  assert.equal(conflict.ok, false); if (!conflict.ok) assert.equal(conflict.error, "selection_conflict");
  const invalid = await activate("does_not_exist", 1); assert.equal(invalid.ok, false);
  assert.equal((await getPublishedEditorialSelection("home", "local", factory)).version, 1);
  assert.equal(await publicCount(), 1);
  const empty = await replaceEditorialSelection({ expectedVersion: 1, validUntil: new Date(Date.now() + 86400000).toISOString(), items: [] }, "reviewer", "local", factory);
  assert.equal(empty.ok, true); assert.equal(await publicCount(), 0);
  assert.equal((await pg.query<{ status: string }>("select status from garimpa.product_curation where product_id='product_1'")).rows[0].status, "approved");
});

await scenario("a SQL failure during activation rolls back retirement and new head", async () => {
  const assessment = await selected();
  await pg.exec(`create function garimpa.fail_item_insert() returns trigger language plpgsql as $$begin raise exception 'fixture forced failure'; end$$;
    create trigger fixture_failure before insert on garimpa.editorial_selection_item for each row execute function garimpa.fail_item_insert();`);
  await assert.rejects(activate(assessment.id, 1), /fixture forced failure/);
  await pg.exec("drop trigger fixture_failure on garimpa.editorial_selection_item; drop function garimpa.fail_item_insert();");
  assert.equal((await getPublishedEditorialSelection("home", "local", factory)).version, 1);
  assert.equal(await publicCount(), 1);
  assert.equal((await pg.query<{ count: number }>("select count(*)::int as count from garimpa.editorial_selection")).rows[0].count, 1);
});

await scenario("history compares known identical configurations, never changed quantity or unknown identity", async () => {
  await selected();
  await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence)
    values('obs_old','local','product_1',3000,now()-interval '8 days',$1),('obs_mid','local','product_1',2500,now()-interval '4 days',$1)`, [JSON.stringify(evidence)]);
  let product = (await getPublishedEditorialSelection("home", "local", factory)).products[0];
  assert.equal(product.previousMinPriceCents, 2500); assert.equal(product.lowestVerified, true);
  const verifyCatalogAndDetail = async (expectedMinimum: number | null, expectedVerified: boolean) => {
    const selection = await getPublishedEditorialSelection("home", "local", factory);
    const catalog = await topDeals({ sort: "signal" }, "local", selection, factory);
    const detail = await dealDetail("shp-111", "local", factory);
    assert.equal(catalog.deals[0].previous_min_price_cents, expectedMinimum);
    assert.equal(catalog.deals[0].lowest_verified, expectedVerified);
    assert.ok(detail); assert.equal(detail.deal.previous_min_price_cents, expectedMinimum);
    assert.equal(detail.deal.lowest_verified, expectedVerified);
  };
  await verifyCatalogAndDetail(2500, true);
  await pg.query("update garimpa.price_observation set offer_evidence=$1 where id='obs_old'", [JSON.stringify({ ...evidence, packageQuantity: 3 })]);
  product = (await getPublishedEditorialSelection("home", "local", factory)).products[0];
  assert.equal(product.previousMinPriceCents, null); assert.equal(product.lowestVerified, false);
  await verifyCatalogAndDetail(null, false);
  await pg.exec("update garimpa.price_observation set offer_evidence=null where id='obs_old'");
  product = (await getPublishedEditorialSelection("home", "local", factory)).products[0];
  assert.equal(product.previousMinPriceCents, null); assert.equal(product.lowestVerified, false);
  await verifyCatalogAndDetail(null, false);
});

await scenario("catalog editorial priority is global, pagination unique, explicit sorts absolute", async () => {
  await selected();
  for (let index = 0; index < 28; index++) {
    const id = `catalog_${String(index).padStart(2, "0")}`;
    await pg.query(`insert into garimpa.product values($1,'local',$2,$3,$4,'casa','shopee',$5,now())`, [id, `Catalog ${index}`, product.productUrl, product.imageUrl, String(200 + index)]);
    await pg.query("insert into garimpa.product_curation values($1,'local','approved')", [id]);
    await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,sales_count,observed_at,offer_evidence)
      values($1,'local',$2,$3,$4,now()-($5*interval '1 second'),$6)`, [`obs_${id}`, id, 1000 + index, 100 + index, index, JSON.stringify(evidence)]);
  }
  const selection = await getPublishedEditorialSelection("home", "local", factory);
  const first = await topDeals({ limit: 24, sort: "signal" }, "local", selection, factory);
  const second = await topDeals({ limit: 24, offset: 24, sort: "signal" }, "local", selection, factory);
  assert.equal(first.selectionVersion, selection.version);
  assert.equal(first.deals[0].id, "product_1");
  assert.equal(first.total, 29); assert.equal(second.total, 29);
  assert.equal(new Set([...first.deals, ...second.deals].map((deal: any) => deal.id)).size, 29);
  for (const sort of ["price", "popularity", "recent"]) {
    const sorted = await topDeals({ limit: 24, sort }, "local", selection, factory);
    const values = sorted.deals.map((deal: any) => sort === "price" ? deal.price_cents : sort === "popularity" ? deal.sales_count : new Date(deal.evidence_observed_at).getTime());
    for (let index = 1; index < values.length; index++) {
      if (values[index] !== null && values[index - 1] !== null) assert.ok(sort === "price" ? values[index - 1] <= values[index] : values[index - 1] >= values[index]);
    }
  }
  const filtered = await topDeals({ category: "tecnologia", sort: "signal" }, "local", selection, factory);
  assert.equal(filtered.deals.length, 0);
  assert.equal((await getPublishedEditorialSelection("home", "local", factory)).products[0].id, "product_1", "catalog filters do not redefine institutional highlights");
});

await scenario("confidence facts changing invalidate the human assessment", async () => {
  await reset();
  const assessment = await save();
  assert.equal((await activate(assessment.id)).ok, true);
  await pg.exec("update garimpa.price_observation set rating_star=2.5 where id='obs_1'");
  assert.equal((await getPublishedEditorialSelection("home", "local", factory)).products.length, 0);
  await pg.exec("update garimpa.price_observation set rating_star=null where id='obs_1'");
  await pg.query("update garimpa.price_observation set offer_evidence=$1 where id='obs_1'", [JSON.stringify({ ...evidence, positiveReviewRate: 70 })]);
  assert.equal((await getPublishedEditorialSelection("pauta", "local", factory)).products.length, 0);
});

function heroDimensions(exceptional: string[] = []) {
  return Object.fromEntries(EDITORIAL_DIMENSIONS.map(({ id }: { id: string }) => [id, { level: exceptional.includes(id) ? "exceptional" : "strong", reason: "Fonte, configuração e referência conferidas nesta fixture editorial." }]));
}

await scenario("hero rubric and observation price persist without trusting form-supplied snapshot", async () => {
  await reset();
  const assessment = await save({ heroPolicyVersion: HERO_POLICY_VERSION, dimensions: heroDimensions(["utility", "value"]), priceCentsAtAssessment: 1_000_000 });
  assert.equal(assessment.priceCentsAtAssessment, 2029);
  const stored = (await pg.query<{ assessment: any; snapshot: any }>("select assessment,snapshot from garimpa.editorial_assessment where id=$1", [assessment.id])).rows[0];
  assert.equal(stored.assessment.heroPolicyVersion, HERO_POLICY_VERSION);
  assert.equal("priceCentsAtAssessment" in stored.assessment, false);
  assert.equal(stored.snapshot.price_cents, 2029);
  assert.equal((await activate(assessment.id)).ok, true);
  const home = await getPublishedEditorialSelection("home", "local", factory);
  assert.deepEqual(home.heroProductIds, ["product_1"]);
  assert.ok(new Date(home.heroValidUntil).getTime() <= new Date(home.validUntil).getTime());
  const desk = await getEditorialSelectionDesk("local", factory);
  assert.equal(desk.candidates[0].assessment.priceCentsAtAssessment, 2029);
  for (const key of ["score", "breakdown", "heroPolicyVersion", "priceCentsAtAssessment", "assessment"]) assert.equal(key in home.products[0], false);
});

await scenario("adequate, strong and legacy assessments all compete in a relative hero", async () => {
  await selected();
  assert.deepEqual((await getPublishedEditorialSelection("home", "local", factory)).heroProductIds, ["product_1"]);
  const legacy = await save({ dimensions: heroDimensions(EDITORIAL_DIMENSIONS.map(({ id }: { id: string }) => id)) });
  assert.equal((await activate(legacy.id, 1)).ok, true);
  assert.deepEqual((await getPublishedEditorialSelection("home", "local", factory)).heroProductIds, ["product_1"]);
  const strong = await save({ heroPolicyVersion: HERO_POLICY_VERSION, dimensions: heroDimensions() });
  assert.equal((await activate(strong.id, 2)).ok, true);
  const home = await getPublishedEditorialSelection("home", "local", factory);
  assert.equal(home.products.length, 1);
  assert.deepEqual(home.heroProductIds, ["product_1"]);
});

await scenario("global hero ranks by merit within home destinations; publication order stays editorial", async () => {
  await reset();
  const items: any[] = [];
  for (let n = 1; n <= 6; n++) {
    const id = `hero_${n}`;
    const identity = { ...product, title: `Produto editorial ${n}` };
    await pg.query("insert into garimpa.product values($1,'local',$2,$3,$4,$5,'shopee',$6,now())", [id, identity.title, identity.productUrl, identity.imageUrl, identity.category, `hero_${n}`]);
    await pg.query("insert into garimpa.product_curation values($1,'local','approved')", [id]);
    await pg.query("insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values($1,'local',$2,2029,now(),$3)", [`obs_hero_${n}`, id, JSON.stringify(evidence)]);
    const exceptional = n === 1 ? [] : n === 2 ? ["utility", "value"] : n === 5 ? ["audience", "utility", "value"] : EDITORIAL_DIMENSIONS.map(({ id }: { id: string }) => id);
    const saved = await saveEditorialAssessment(input({ productId: id, evidenceFingerprint: editorialEvidenceFingerprint(identity), heroPolicyVersion: HERO_POLICY_VERSION, dimensions: heroDimensions(exceptional) }), "reviewer", "local", factory);
    assert.equal(saved.ok, true);
    items.push({ productId: id, assessmentId: saved.assessment.id, destinations: n === 4 ? ["pauta"] : ["home", "pauta"], context: n === 4 ? "Seleção específica para viagens." : "" });
  }
  const editorialOrder = [items[1], items[4], items[5], items[2], items[3], items[0]];
  const activated = await replaceEditorialSelection({ expectedVersion: null, validUntil: new Date(Date.now() + 86400000).toISOString(), items: editorialOrder }, "reviewer", "local", factory);
  assert.equal(activated.ok, true);
  const home = await getPublishedEditorialSelection("home", "local", factory);
  const pauta = await getPublishedEditorialSelection("pauta", "local", factory);
  const all = await getPublishedEditorialSelection("all", "local", factory);
  assert.deepEqual(home.products.map((item: any) => item.id), ["hero_2", "hero_5", "hero_6", "hero_3", "hero_1"]);
  assert.deepEqual(home.heroProductIds, ["hero_6", "hero_3", "hero_5"]);
  assert.deepEqual(home.heroProductIds, pauta.heroProductIds);
  assert.deepEqual(home.heroProductIds, all.heroProductIds);
  assert.equal(pauta.products.length, 6);
  assert.equal(home.version, pauta.version);
  const filtered = await topDeals({ category: "tecnologia", sort: "price" }, "local", home, factory);
  assert.equal(filtered.deals.length, 0);
  assert.equal(filtered.selectionStateKey, publishedEditorialStateKey(home));
});

await scenario("hero keeps increases within assessed maximum; superseded reviews withdraw without new edition", async () => {
  await reset();
  const assessment = await save({ heroPolicyVersion: HERO_POLICY_VERSION, dimensions: heroDimensions(["utility", "value"]) });
  assert.equal((await activate(assessment.id)).ok, true);
  const initial = await getPublishedEditorialSelection("home", "local", factory);
  await pg.exec("update garimpa.price_observation set price_cents=2100 where id='obs_1'");
  const increased = await getPublishedEditorialSelection("home", "local", factory);
  assert.equal(increased.version, initial.version);
  assert.equal(increased.products.length, 1, "assessed maximum still permits the general selection");
  assert.deepEqual(increased.heroProductIds, ["product_1"]);
  assert.notEqual(publishedEditorialStateKey(increased), publishedEditorialStateKey(initial));
  await pg.exec("update garimpa.price_observation set price_cents=1500 where id='obs_1'");
  assert.deepEqual((await getPublishedEditorialSelection("home", "local", factory)).heroProductIds, ["product_1"]);
  await save({ heroPolicyVersion: HERO_POLICY_VERSION, dimensions: heroDimensions(), criticalDoubts: ["Conteúdo do pacote precisa ser revisto."] });
  const revised = await getPublishedEditorialSelection("home", "local", factory);
  assert.equal(revised.version, initial.version);
  assert.deepEqual(revised.heroProductIds, []);
  assert.equal(revised.products.length, 0);
});

await scenario("hero expiry respects freshness deadline and blocks invalid facts at public read", async () => {
  await reset();
  const assessment = await save({ heroPolicyVersion: HERO_POLICY_VERSION, dimensions: heroDimensions(["utility", "value"]) });
  assert.equal((await activate(assessment.id)).ok, true);
  await pg.exec("update garimpa.price_observation set observed_at=now()-interval '47 hours' where id='obs_1'");
  const home = await getPublishedEditorialSelection("home", "local", factory);
  assert.deepEqual(home.heroProductIds, ["product_1"]);
  assert.ok(Date.parse(home.heroValidUntil) <= Date.now() + 3_600_100);
  await pg.exec("update garimpa.price_observation set observed_at=now()-interval '49 hours' where id='obs_1'");
  assert.deepEqual((await getPublishedEditorialSelection("home", "local", factory)).heroProductIds, []);
  await pg.exec("update garimpa.price_observation set observed_at=now() where id='obs_1'");
  await pg.exec("update garimpa.editorial_selection set created_at=now()-interval '2 days',valid_until=now()-interval '1 day'");
  const expired = await getPublishedEditorialSelection("home", "local", factory);
  assert.deepEqual(expired.heroProductIds, []);
  assert.equal(expired.heroValidUntil, null);
});

async function catalogItem(id: string, rating: number | null, sales: number, offerEvidence: unknown = null) {
  await pg.query("insert into garimpa.product values($1,'local',$2,$3,$4,'casa','shopee',$1,now())", [id, `Catalog ${id}`, product.productUrl, product.imageUrl]);
  await pg.query("insert into garimpa.product_curation values($1,'local','approved')", [id]);
  await pg.query("insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,rating_star,sales_count,observed_at,offer_evidence) values($1,'local',$2,2000,$3,$4,now(),$5)", [`obs_${id}`, id, rating, sales, offerEvidence ? JSON.stringify(offerEvidence) : null]);
}

await scenario("before the first edition, all surfaces share three global catalog highlights without writes", async () => {
  await reset();
  await pg.exec("update garimpa.price_observation set offer_evidence=null where id='obs_1'");
  for (const [id, rating, sales] of [["a",5,1000],["b",4.9,1000],["c",4.8,1000],["d",4.5,1000]] as const) await catalogItem(id,rating,sales);
  const home = await getPublishedEditorialSelection("home","local",factory);
  assert.equal(home.mode,"catalog"); assert.equal(home.version,null); assert.equal(home.id,null);
  assert.deepEqual(home.heroProductIds,["a","b","c"]);
  assert.equal(home.validUntil,home.heroValidUntil);
  for (const destination of ["pauta","all"]) assert.deepEqual(await getPublishedEditorialSelection(destination,"local",factory),home);
  assert.deepEqual(home.products.map((p: any) => p.id),home.heroProductIds);
  assert.ok(home.products.every((p: any) => p.editorialPurchaseContents === ""));
  for (const key of ["assessment","offerEvidence","score","catalogSignals"]) assert.equal(key in home.products[0],false);
  for (const sort of ["signal","price","popularity","recent"]) {
    const filtered = await topDeals({category:"tecnologia",limit:1,offset:1,sort},"local",home,factory);
    assert.equal(filtered.deals.length,0);
    assert.equal(filtered.selectionStateKey,publishedEditorialStateKey(home));
  }
  assert.equal((await pg.query<{count:number}>("select (select count(*) from garimpa.editorial_assessment)+(select count(*) from garimpa.editorial_selection) as count")).rows[0].count,0);
  assert.equal((await getEditorialSelectionDesk("local",factory)).catalogHeroActive,true);
});

await scenario("catalog bootstrap preserves human blockers instead of reverting to popularity", async () => {
  await reset(); await catalogItem("unreviewed",4.8,1000);
  const dimensions = input().dimensions; dimensions.clarity.level = "weak";
  await save({dimensions});
  let home = await getPublishedEditorialSelection("home","local",factory);
  assert.deepEqual(home.heroProductIds,["unreviewed"]);
  await save();
  home = await getPublishedEditorialSelection("home","local",factory);
  assert.equal(home.heroProductIds[0],"product_1","valid human assessment precedes the catalog scale");
  const key = publishedEditorialStateKey(home);
  await save({publicRationale:"Uma justificativa editorial nova com a mesma avaliação e os mesmos fatos."});
  assert.notEqual(publishedEditorialStateKey(await getPublishedEditorialSelection("home","local",factory)),key);
  await save({criticalDoubts:["Não está claro se a compra inclui cobertores."]});
  assert.deepEqual((await getPublishedEditorialSelection("pauta","local",factory)).heroProductIds,["unreviewed"]);
  await save(); await pg.exec("update garimpa.product set title='Pacote modificado' where id='product_1'");
  assert.deepEqual((await getPublishedEditorialSelection("home","local",factory)).heroProductIds,["unreviewed"]);
});

await scenario("catalog highlights obey approval, freshness and configuration, without minimum score", async () => {
  await reset(); await pg.exec("update garimpa.price_observation set offer_evidence=null where id='obs_1'");
  let home = await getPublishedEditorialSelection("home","local",factory);
  assert.deepEqual(home.heroProductIds,["product_1"],"zero extra signals is still the best valid offer available");
  assert.equal(home.products[0].editorialPurchaseContents,"");
  const key = publishedEditorialStateKey(home);
  await pg.exec("update garimpa.price_observation set price_cents=2030 where id='obs_1'");
  assert.notEqual(publishedEditorialStateKey(await getPublishedEditorialSelection("home","local",factory)),key);
  await pg.exec("update garimpa.price_observation set observed_at=now()-interval '49 hours' where id='obs_1'");
  assert.equal(await publicCount(),0);
  await pg.exec("update garimpa.price_observation set observed_at=now() where id='obs_1'");
  await pg.query("update garimpa.price_observation set offer_evidence=$1 where id='obs_1'",[JSON.stringify({priceMinCents:1000,priceMaxCents:3000})]);
  assert.equal(await publicCount(),0);
  await pg.exec("update garimpa.price_observation set offer_evidence=null where id='obs_1'; update garimpa.product_curation set status='held' where product_id='product_1'");
  assert.equal(await publicCount(),0);
});

await scenario("an explicit empty, expired or retired edition never restores catalog highlights", async () => {
  await reset(); await catalogItem("available",5,10000);
  const empty = await replaceEditorialSelection({expectedVersion:null,validUntil:new Date(Date.now()+86400000).toISOString(),items:[]},"reviewer","local",factory);
  assert.equal(empty.ok,true);
  let home = await getPublishedEditorialSelection("home","local",factory);
  assert.equal(home.mode,"editorial"); assert.deepEqual(home.products,[]);
  await pg.exec("update garimpa.editorial_selection set created_at=now()-interval '2 days',valid_until=now()-interval '1 day'");
  assert.equal(await publicCount("pauta"),0);
  await pg.exec("update garimpa.editorial_selection set status='retired'");
  home = await getPublishedEditorialSelection("home","local",factory);
  assert.equal(home.mode,"editorial"); assert.deepEqual(home.heroProductIds,[]);
  assert.equal((await getEditorialSelectionDesk("local",factory)).catalogHeroActive,false);
});

await pg.close();
console.log(`Editorial integration: ${passed} scenarios passed. PostgreSQL fixture only; no remote database touched.`);
