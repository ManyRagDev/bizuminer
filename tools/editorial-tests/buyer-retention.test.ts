import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";
const require = createRequire(import.meta.url);
const { startWatch, stopWatch, watchedDeals, setFavorite, savedDeals, bulkFavorites, savedProductIds } = require("../../packages/web/lib/member-db.ts");
const { readSavedState, writeSavedState, remainingAfterConfirmedSync } = require("../../packages/web/lib/saved-products.ts");
const { pg, factory } = await commercialFixture();
const evidence = { version: 2, currency: "BRL", priceType: "exact", variantIdentity: { state: "source_verified", key: "unit", attributes: {} }, packageQuantity: 1, fieldStates: { sellerId: "not_applicable", packageContents: "not_applicable", dimensions: "not_applicable", payment: "not_applicable", coupon: "not_applicable", region: "not_applicable" } };
let passed = 0;
async function check(name: string, fn: () => Promise<void>) { await fn(); passed++; console.log(`PASS ${name}`); }
try {
  for (const name of ["20261023041600_optimize_public_link_reads.sql", "20261027030237_compose_homepage_editions.sql", "20261028041629_durable_product_presentation.sql", "20261028041849_watch_comparable_baseline.sql"]) {
    await pg.exec(await readFile(new URL(`../../packages/persistence/supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','a','A'),('aff_b','b','b','B');
    insert into garimpa.app_user(id,tenant_id,auth_user_id) values('buyer_a','a','auth_a'),('buyer_a2','a','auth_a2'),('buyer_b','b','auth_b');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','buyer_a','owner');
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at) values
      ('pa','a','shopee','101','Produto A','https://example.test/a',10000,now()),
      ('pb','b','shopee','102','Produto B','https://example.test/b',20000,now());
    insert into garimpa.product_curation(tenant_id,product_id,status) values('a','pa','approved'),('b','pb','approved');
    insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url) values('pub_pa','a','aff_a','pa','web','shp-101','active','https://example.test/aff');`);
  await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('oa','a','pa',10000,now()-interval '1 minute',$1),('ob','b','pb',20000,now()-interval '1 minute',$1)`, [JSON.stringify(evidence)]);
  await pg.exec(`insert into garimpa.editorial_assessment(id,tenant_id,product_id,actor_app_user_id,policy_version,evidence_fingerprint,assessment,snapshot)
    select 'review_pa','a','pa','buyer_a','achadinhos-v1','fixture',
      jsonb_build_object('presentation',jsonb_build_object('status','published','title','Produto revisado A','caveat','Confira a configuração'),'benefit','Benefício revisado'),
      jsonb_build_object('product_url',p.product_url,'marketplace',p.marketplace,'external_id',p.external_id,'image_url',p.image_url,'category',p.category,'offer_evidence',o.offer_evidence)
    from garimpa.product p join garimpa.price_observation o on o.id='oa' where p.id='pa'`);
  await check("salvar e acompanhar pertencem à pessoa e à conta", async () => {
    assert.equal(await setFavorite("buyer_a", "pa", true, "a", factory), true);
    assert.equal(await setFavorite("buyer_a", "pa", true, "a", factory), true);
    assert.equal((await savedDeals("buyer_a2", "a", factory)).length, 0);
    assert.equal(await startWatch("buyer_a", "pb", null, "a", factory), null);
    const w = await startWatch("buyer_a", "pa", null, "a", factory);
    assert.equal(w.baseline_price_cents, 10000); assert.equal(w.baseline_currency, "BRL"); assert.equal(w.current_price_cents, 10000); assert.equal(w.comparison_status, "comparable"); assert.equal(w.title, "Produto revisado A"); assert.equal(w.benefit, "Benefício revisado");
    assert.equal((await watchedDeals("buyer_a2", "a", factory)).length, 0);
    assert.equal((await watchedDeals("buyer_b", "b", factory)).length, 0);
  });
  await check("USD comparável conserva moeda; referência sem moeda continua desconhecida", async () => {
    await pg.query(`update garimpa.price_observation set offer_evidence=$1 where id='ob'`, [JSON.stringify({ ...evidence, currency: "USD" })]);
    let watch = await startWatch("buyer_b", "pb", null, "b", factory);
    assert.equal(watch.baseline_currency, "USD"); assert.equal(watch.comparison_status, "comparable");
    await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('ob2','b','pb',19000,now(),$1)`, [JSON.stringify({ ...evidence, currency: "USD" })]);
    watch = (await watchedDeals("buyer_b", "b", factory))[0];
    assert.equal(watch.baseline_currency, "USD"); assert.equal(watch.current_price_cents, 19000); assert.equal(watch.comparison_status, "comparable");
    await stopWatch("buyer_b", "pb", "b", factory);
    await pg.query(`update garimpa.price_observation set offer_evidence=$1 where id='ob2'`, [JSON.stringify({ ...evidence, currency: undefined })]);
    watch = await startWatch("buyer_b", "pb", null, "b", factory);
    assert.equal(watch.baseline_currency, null); assert.equal(watch.comparison_status, "unavailable"); assert.equal(watch.current_price_cents, null);
  });
  await check("mudança após leitura não mistura apresentação e preço de configurações distintas", async () => {
    const changed = { ...evidence, variantIdentity: { ...evidence.variantIdentity, key: "changed" } };
    let ran = false;
    const mutateAfterRead = () => {
      const sql = factory();
      const end = sql.end;
      sql.end = async () => {
        await end();
        if (!ran) {
          ran = true;
          await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('race_new','a','pa',7000,now(),$1)`, [JSON.stringify(changed)]);
        }
      };
      return sql;
    };
    const before = (await watchedDeals("buyer_a", "a", mutateAfterRead))[0];
    assert.equal(before.title, "Produto revisado A"); assert.equal(before.current_price_cents, 10000); assert.equal(before.comparison_status, "comparable");
    const after = (await watchedDeals("buyer_a", "a", factory))[0];
    assert.equal(after.title, "Produto A"); assert.equal(after.current_price_cents, null); assert.equal(after.comparison_status, "configuration_changed");
    await pg.exec("delete from garimpa.price_observation where id='race_new'; update garimpa.editorial_assessment set presentation_invalidated_at=null where id='review_pa'");
  });
  await check("mesmo item salvo antes e depois do login continua na conta após sincronização explícita", async () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
    writeSavedState(storage, { ids: ["pa"], products: [] });
    assert.deepEqual(readSavedState(storage).ids, ["pa"]);
    // A sessão não lê snapshots de outra conta, mesmo antes da importação.
    writeSavedState(storage, { ids: ["pb"], products: [] }, "other-account");
    const pending = readSavedState(storage).ids;
    await bulkFavorites("buyer_a", pending, "a", factory);
    const accountIds = await savedProductIds("buyer_a", "a", factory);
    const accepted = pending.filter((id: string) => accountIds.includes(id));
    writeSavedState(storage, remainingAfterConfirmedSync(readSavedState(storage), accepted));
    assert.deepEqual(readSavedState(storage).ids, []);
    assert.deepEqual(accountIds, ["pa"]);
    assert.deepEqual(readSavedState(storage, "other-account").ids, ["pb"]);
  });
  await check("preço igual posterior continua estável", async () => {
    await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('oa_equal','a','pa',10000,now()-interval '10 seconds',$1)`, [JSON.stringify(evidence)]);
    const w = (await watchedDeals("buyer_a", "a", factory))[0];
    assert.equal(w.comparison_status, "comparable"); assert.equal(w.current_price_cents, w.baseline_price_cents);
  });
  await check("repetir acompanhamento ativo conserva referência original", async () => {
    await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('oa2','a','pa',9000,now(),$1)`, [JSON.stringify(evidence)]);
    const w = await startWatch("buyer_a", "pa", 8500, "a", factory);
    assert.equal(w.baseline_price_cents, 10000); assert.equal(w.target_price_cents, null); assert.equal(w.current_price_cents, 9000);
  });
  await check("nova configuração e moeda não criam queda", async () => {
    const changed = { ...evidence, variantIdentity: { ...evidence.variantIdentity, key: "kit" } };
    await pg.query(`update garimpa.price_observation set offer_evidence=$1 where id='oa2'`, [JSON.stringify(changed)]);
    let w = (await watchedDeals("buyer_a", "a", factory))[0]; assert.equal(w.comparison_status, "configuration_changed"); assert.equal(w.current_price_cents, null);
    await pg.query(`update garimpa.price_observation set offer_evidence=$1 where id='oa2'`, [JSON.stringify({ ...evidence, currency: "USD" })]);
    w = (await watchedDeals("buyer_a", "a", factory))[0]; assert.equal(w.comparison_status, "configuration_changed"); assert.equal(w.current_price_cents, null);
  });
  await check("evidência antiga ou sem configuração não produz comparação", async () => {
    await pg.query(`update garimpa.price_observation set offer_evidence=$1, observed_at=now()-interval '49 hours' where id in ('oa','oa_equal','oa2')`, [JSON.stringify(evidence)]);
    let w = (await watchedDeals("buyer_a", "a", factory))[0]; assert.equal(w.comparison_status, "unavailable"); assert.equal(w.current_price_cents, null);
    await stopWatch("buyer_a", "pa", "a", factory);
    assert.equal(await startWatch("buyer_a", "pa", null, "a", factory), null);
    await pg.query(`update garimpa.price_observation set observed_at=now(), offer_evidence='{}' where id='oa2'`);
    w = await startWatch("buyer_a", "pa", null, "a", factory); assert.equal(w.comparison_status, "unavailable"); assert.equal(w.current_price_cents, null);
  });
  await check("salvo retirado permanece reconhecível e sem disponibilidade", async () => {
    await pg.exec(`update garimpa.product_curation set status='rejected' where product_id='pa'`);
    const rows = await savedDeals("buyer_a", "a", factory); assert.equal(rows.length, 1); assert.equal(rows[0].available, false);
    assert.equal(await stopWatch("buyer_a", "pa", "a", factory), true);
    assert.equal((await watchedDeals("buyer_a", "a", factory)).length, 0);
  });
  console.log(`buyer retention: ${passed} checks passed (PGlite single connection; no concurrent-session test)`);
} finally { await pg.close(); }
