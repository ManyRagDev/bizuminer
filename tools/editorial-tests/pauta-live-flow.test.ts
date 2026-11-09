import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";
import type { AccountContext } from "../../packages/web/lib/tenant-db.ts";

const require = createRequire(import.meta.url);
const { readLivePauta, confirmPautaExposure, readPautaAvailability } = require("../../packages/web/lib/pauta-db.ts");
const { readTodayOperations } = require("../../packages/web/lib/today-operation-db.ts");
const { readPublicPautaLink, redirectPublicPautaLink } = require("../../packages/web/lib/pauta-link-db.ts");
const { defaultChannelPolicy } = require("../../packages/web/lib/recommendation-policy.ts");
process.env.DATABASE_URL = "postgresql://isolated-fixture-unused";
const { pg, factory, adminFactory } = await commercialFixture();
const { inAccountScope } = require("../../packages/web/lib/account-scope.ts");
const { confirmOfferOption } = require("../../packages/web/lib/offer-option-db.ts");
const { confirmedOfferDetail } = require("../../packages/web/lib/confirmed-offer-db.ts");
const { publicMonetizedTarget } = require("../../packages/web/lib/public-offer-db.ts");
const account = (tenantId: string): AccountContext => ({
  tenantId, affiliateId: `aff_${tenantId}`, actor: "human", actorAppUserId: `user_${tenantId}`,
  authenticatedAuthUserId: `auth_${tenantId}`, membershipRole: "owner", requestId: "pauta-fixture",
});
const a = account("a");
const b = account("b");
const read = (context = a, channel: "whatsapp" | "stories" = "whatsapp") =>
  readLivePauta(context, channel, "mercadolivre", factory);
const sqlDirectory = new URL("../../packages/persistence/supabase/migrations/", import.meta.url);

try {
  for (const file of [
    "20261023041600_optimize_public_link_reads.sql", "20261027030237_compose_homepage_editions.sql",
    "20261028041629_durable_product_presentation.sql", "20261101125432_renew_editorial_pauta.sql",
    "20261101193221_improve_editorial_recommendations.sql", "20261102131234_optimize_price_observation_scope.sql",
  ]) {
    await pg.exec(await readFile(new URL(file, sqlDirectory), "utf8"));
  }
  await pg.exec(`
    insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name)
    values ('aff_a','a','pauta-a','Pauta A'),('aff_b','b','pauta-b','Pauta B');
    insert into garimpa.app_user(id,tenant_id,auth_user_id)
    values ('user_a','a','auth_a'),('user_b','b','auth_b');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role)
    values ('aff_a','user_a','owner'),('aff_b','user_b','owner');
    insert into garimpa.app_user_role(app_user_id,role) values ('user_a','afiliado'),('user_b','afiliado');
    insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id)
    values ('aff_a','mercadolivre','fixture-a','tool-a'),('aff_b','mercadolivre','fixture-b','tool-b');
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,image_url,last_price_cents,last_seen_at)
    values ('p_a','a','mercadolivre','MLB123456789','Oferta A','https://produto.mercadolivre.com.br/MLB-123456789','https://http2.mlstatic.com/a.jpg',9900,now()),
    ('p_b','b','mercadolivre','MLB123456789','Oferta B','https://www.mercadolivre.com.br/produto/p/MLB999999?wid=MLB123456789&utm_source=outro','https://http2.mlstatic.com/b.jpg',9900,now());
    insert into garimpa.product_curation(tenant_id,product_id,status)
    values ('a','p_a','pending'),('b','p_b','approved')
    on conflict(tenant_id,product_id) do update set status=excluded.status;
    insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence)
    values ('o_a','a','p_a',9900,now()-interval '1 hour','{"version":2,"currency":"BRL","priceType":"exact"}'),
    ('o_b','b','p_b',9900,now()-interval '1 hour','{"version":2,"currency":"BRL","priceType":"exact"}');
  `);
  for (const tenantId of ["a", "b"]) {
    for (const channel of ["whatsapp", "stories"] as const) {
      await pg.query(`insert into garimpa.recommendation_channel(tenant_id,channel,version,policy_version,enabled,policy)
        values ($1,$2,1,'recommendation-v1',true,$3)`, [tenantId, channel, JSON.stringify(defaultChannelPolicy(channel))]);
    }
  }

  const pending = await read();
  assert.deepEqual(pending.products, []);
  assert.deepEqual(pending.recent.map(p => [p.id, p.status]), [["p_a", "pending"]]);
  assert.deepEqual(pending.captureActions, { review: 0, triage: 1, retry: 0 });
  await pg.exec(`
    insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,status)
    values ('10000000-0000-4000-8000-000000000001','a',array['mercadolivre'],1,'error');
    insert into garimpa.capture_run(id,tenant_id,marketplace,started_at,status,parameters)
    values ('pauta-failed-run','a','mercadolivre',now(),'error','{"operationBatchId":"10000000-0000-4000-8000-000000000001"}');
    update garimpa.price_observation set capture_run_id='pauta-failed-run' where id='o_a';
  `);
  assert.equal((await read()).recent[0].status, "failed");
  await pg.exec(`
    insert into garimpa.curation_event(tenant_id,product_id,from_status,to_status,actor_type,metadata)
    values ('a','p_a','pending','pending','llm','{"automation":{"aiJustification":"Produto útil, mas pouco diferente das alternativas."}}');
  `);
  const reviewed = await read();
  assert.equal(reviewed.recent[0].status, "review");
  assert.deepEqual(reviewed.recent[0].reasons, ["Produto útil, mas pouco diferente das alternativas."]);
  assert.deepEqual(reviewed.captureActions, { review: 1, triage: 0, retry: 0 });
  await pg.exec("update garimpa.product_curation set deferred_until=now()+interval '1 day' where product_id='p_a'");
  const deferred = await read();
  assert.equal(deferred.recent[0].status, "deferred");
  assert.deepEqual(deferred.captureActions, { review: 0, triage: 0, retry: 0 });
  await pg.exec("update garimpa.product_curation set deferred_until=null where product_id='p_a'");
  await pg.exec("update garimpa.product_curation set status='approved' where tenant_id='a' and product_id='p_a'");
  const approved = (await read()).products[0];
  assert.equal(approved.id, "p_a");
  assert.deepEqual(await readPautaAvailability(a, "whatsapp", factory), { active: true, count: 1 });
  assert.equal(approved.shareTarget.kind, "pauta");
  assert.ok(!JSON.stringify(approved).includes("fixture-a"));
  const otherOffer = (await read(b)).products[0];
  assert.equal(otherOffer.id, "p_b");
  const aToken = approved.shareTarget.token;
  const bToken = otherOffer.shareTarget.token;
  const aRedirect = await redirectPublicPautaLink(aToken, factory);
  const bRedirect = await redirectPublicPautaLink(bToken, factory);
  assert.equal(aRedirect.status, 302);
  assert.equal(aRedirect.headers.get("Cache-Control"), "no-store");
  assert.equal(new URL(aRedirect.headers.get("Location")!).searchParams.get("matt_word"), "fixture-a_pauta-MLB123456789");
  const bTarget = new URL(bRedirect.headers.get("Location")!);
  assert.equal(bTarget.searchParams.get("matt_word"), "fixture-b_pauta-MLB123456789");
  assert.equal(bTarget.searchParams.get("matt_tool"), "tool-b");
  assert.equal(bTarget.searchParams.get("wid"), "MLB123456789");
  assert.equal(bTarget.searchParams.has("utm_source"), false);
  assert.equal((await readPublicPautaLink(aToken, factory)).title, "Oferta A");
  assert.equal((await redirectPublicPautaLink(bToken.split(".")[0] + "." + aToken.split(".")[1], factory)).status, 404);
  assert.equal((await pg.query("select * from garimpa.publication")).rows.length, 0);
  assert.equal((await read()).recentTotal, 1);
  await assert.rejects(() => read({ ...a, tenantId: "b", affiliateId: "aff_b" }), /forbidden/);
  assert.equal(await confirmPautaExposure(b, "whatsapp", approved.confirmationId, "p_a", factory), false);
  assert.equal((await pg.query("select * from garimpa.recommendation_edition_archive")).rows.length, 0);

  await pg.exec(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence)
    values ('o_a_new','a','p_a',9400,'{"version":2,"currency":"BRL","priceType":"exact"}')`);
  assert.equal(await confirmPautaExposure(a, "whatsapp", approved.confirmationId, "p_a", factory), false);
  const updated = (await read()).products[0];
  assert.equal(updated.priceCents, 9400);
  assert.notEqual(updated.confirmationId, approved.confirmationId);
  assert.equal(updated.shareTarget.token, aToken);
  assert.equal(await confirmPautaExposure(a, "whatsapp", updated.confirmationId, "p_a", factory), true);
  assert.equal(await confirmPautaExposure(a, "whatsapp", updated.confirmationId, "p_a", factory), true);
  assert.equal((await pg.query("select * from garimpa.recommendation_exposure")).rows.length, 1);
  assert.equal((await read()).products.length, 0);
  assert.deepEqual(await readPautaAvailability(a, "whatsapp", factory), { active: true, count: 0 });
  assert.deepEqual(await readPautaAvailability(a, "stories", factory), { active: true, count: 1 });
  assert.match((await read()).recent[0].reasons.join(" "), /recentemente neste canal/);
  assert.equal((await read(a, "stories")).products.length, 1);
  await pg.exec("update garimpa.affiliate_marketplace_config set status='suspended' where affiliate_id='aff_a'");
  assert.match((await read(a, "stories")).recent[0].reasons.join(" "), /Falta um link/);
  assert.equal((await redirectPublicPautaLink(aToken, factory)).status, 404);
  assert.equal((await redirectPublicPautaLink(bToken, factory)).status, 302);
  assert.equal((await read(b)).products.length, 1);
  await pg.exec(`insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug)
    values ('pub_b','b','p_b','aff_b','web','ml-fixture-b')`);
  assert.deepEqual((await read(b)).products[0].shareTarget, { kind: "site", slug: "ml-fixture-b" });
  await pg.exec("update garimpa.publication set status='expired' where id='pub_b'");
  assert.equal((await redirectPublicPautaLink(bToken, factory)).status, 404);
  console.log("PASS captura → link Bizu → afiliado da conta, com recaptura, revogação e divulgação idempotente");

  await pg.exec(`
    update garimpa.product_curation set status='held',reason_code='insufficient_evidence' where product_id='p_a';
    insert into garimpa.curation_event(tenant_id,product_id,from_status,to_status,actor_type,reason_code,metadata)
    values ('a','p_a','pending','held','rule','insufficient_evidence',
      '{"automation":{"pricePolicy":{"version":"triage-value-v1","outcome":"unverified_value"}}}');
  `);
  const oldFloor = await read();
  assert.equal(oldFloor.recent[0].status, "retry");
  assert.deepEqual(oldFloor.captureActions, { review: 0, triage: 0, retry: 1 });
  await pg.exec(`
    update garimpa.price_observation set observed_at=now()-interval '1 hour' where product_id='p_a';
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at)
    select 'rejected-'||n,'a','mercadolivre','MLB20000'||n,'Histórico '||n,'https://produto.mercadolivre.com.br/MLB-20000'||n,500,now()
      from generate_series(1,200) n;
    insert into garimpa.product_curation(tenant_id,product_id,status,reason_code)
    select 'a',id,'rejected','low_utility' from garimpa.product where id like 'rejected-%'
    on conflict (tenant_id,product_id) do update set status=excluded.status,reason_code=excluded.reason_code;
    insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at)
    select 'obs-'||id,'a',id,500,now() from garimpa.product where id like 'rejected-%';
  `);
  const cappedHistory = await read();
  assert.equal(cappedHistory.recentTotal, 201);
  assert.equal(cappedHistory.recent.length, 200);
  assert.ok(cappedHistory.recent.every(product => product.status === "rejected"));
  assert.deepEqual(cappedHistory.captureActions, { review: 0, triage: 0, retry: 1 });
  assert.deepEqual((await read(b)).captureActions, { review: 0, triage: 0, retry: 0 });
  console.log("PASS distingue decisão humana, triagem interrompida, revisão adiada e retenção antiga acima do limite do histórico");

  const batchId = "10000000-0000-4000-8000-000000000002";
  await pg.query(`insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,status,metadata)
    values($1,'a',array['mercadolivre','shopee'],1,'running',
      jsonb_build_object('execution',jsonb_build_object('version',1,'phase','awaiting_browser','deadline',now()+interval '10 minutes')))`, [batchId]);
  await pg.exec(`
    insert into garimpa.capture_run(id,tenant_id,marketplace,started_at,status,parameters)
    values ('monitoring-today','a','aliexpress',now(),'running','{"captureMode":"monitoring"}'),
           ('capture-stale','a','shopee',now()-interval '3 hours','running','{}');
  `);
  assert.deepEqual(await readTodayOperations(a, factory), {
    activities: [
      { kind: "browser", marketplaces: ["mercadolivre", "shopee"] },
      { kind: "monitoring", marketplaces: ["aliexpress"] },
    ],
    issues: [],
  });
  assert.deepEqual(await readTodayOperations(b, factory), { activities: [], issues: [] });
  await assert.rejects(() => readTodayOperations({ ...a, tenantId: "b", affiliateId: "aff_b" }, factory), /forbidden/);
  await pg.query(`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,phase}','"triaging"') where id=$1`, [batchId]);
  await pg.query(`insert into garimpa.triage_run(tenant_id,status,metadata) values('a','running',jsonb_build_object('captureBatchId',$1::text))`, [batchId]);
  assert.deepEqual((await readTodayOperations(a, factory)).activities.map(step => step.kind), ["triage", "monitoring"]);
  await pg.query(`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,deadline}',to_jsonb(now()-interval '1 minute')) where id=$1`, [batchId]);
  assert.deepEqual((await readTodayOperations(a, factory)).issues, ["A captura excedeu o prazo."]);
  await pg.exec(`
    update garimpa.capture_run set status='ok' where id='monitoring-today';
    update garimpa.triage_run set status='ok' where tenant_id='a';
    insert into garimpa.triage_run(tenant_id,status) values('a','running');
  `);
  assert.deepEqual((await readTodayOperations(a, factory)).activities.map(step => step.kind), ["triage"]);
  console.log("PASS operação de Hoje distingue lote, navegador, triagem e monitoramento por conta");
  await pg.exec(`
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,image_url,last_price_cents,last_seen_at)
    values ('p_shopee','a','shopee','111','Jogo de chaves','https://shopee.com.br/product/1/111','https://example.test/a.jpg',2490,now()),
      ('p_ali','a','aliexpress','222','Luminária USB','https://pt.aliexpress.com/item/222.html','https://example.test/b.jpg',3490,now());
    insert into garimpa.product_curation(tenant_id,product_id,status)
    values ('a','p_shopee','approved'),('a','p_ali','approved')
    on conflict(tenant_id,product_id) do update set status=excluded.status;
    insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence,claimed_discount_rate)
    values ('o_shopee','a','p_shopee',2490,now(),'{"version":2,"currency":"BRL","priceType":"range","priceMinCents":2490,"priceMaxCents":8490}',0.4),
      ('o_ali','a','p_ali',3490,now(),'{"version":2,"currency":"BRL","priceType":"unknown"}',0.5);
    insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url)
    values ('pub_shopee','a','aff_a','p_shopee','web','shp-111','active','https://s.shopee.com.br/fixture'),
      ('pub_ali','a','aff_a','p_ali','web','ali-222','active','https://s.click.aliexpress.com/e/fixture');
  `);
  const storeRead = (channel: "whatsapp" | "stories") => readLivePauta(a, channel, "aliexpress", factory);
  const unconfirmed = await storeRead("whatsapp");
  assert.deepEqual(unconfirmed.products.map(p => p.id), ["p_shopee"]);
  assert.equal(unconfirmed.products[0].priceMaxCents, 8490);
  assert.equal(unconfirmed.products[0].discountPercent, null);
  assert.match(unconfirmed.recent.find(p => p.id === "p_ali")!.reasons.join(" "), /Confirme manualmente/);
  const confirmation = await inAccountScope(a, () => confirmOfferOption({
    expectedTenantId: "a", productId: "p_ali", expectedObservationId: "o_ali",
    variantKey: "human:luz-quente", variantLabel: "Luz quente", priceCents: 3990,
    quantity: 1, contents: "Luminária USB", dimensions: "NA", sellerId: "Loja A",
    payment: "NA", coupon: "NA", region: "Brasil", shipping: "Calculado para o CEP",
    confirmation: "Preço em BRL da variante Luz quente conferido na página do anúncio.",
  }, factory));
  assert.equal(confirmation.ok, true);
  for (const channel of ["whatsapp", "stories"] as const) {
    const result = await storeRead(channel);
    assert.equal(result.products.length, 2);
    const ali = result.products.find(p => p.id === "p_ali")!;
    assert.equal(ali.priceCents, 3990);
    assert.equal(ali.offerOptionKey, confirmation.optionKey);
    assert.deepEqual(ali.shareTarget, { kind: "site", slug: "ali-222" });
  }
  const detail = await confirmedOfferDetail("ali-222", confirmation.optionKey, adminFactory);
  assert.equal(detail?.product.priceCents, 3990);
  assert.equal((await publicMonetizedTarget("ali-222", adminFactory))?.url, "https://s.click.aliexpress.com/e/fixture");
  assert.equal((await publicMonetizedTarget("shp-111", adminFactory))?.url, "https://s.shopee.com.br/fixture");
  assert.ok((await read(b)).products.every(p => !["p_shopee", "p_ali"].includes(p.id)));
  console.log("PASS Shopee com faixa e AliExpress com opção manual confirmada nos dois canais e link de afiliado");
} finally {
  await pg.close();
}
