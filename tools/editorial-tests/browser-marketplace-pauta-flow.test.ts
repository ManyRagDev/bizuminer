import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const { BrowserCaptureStore } = require("../../packages/web/lib/browser-capture-db.ts");
const { CaptureBatchStore } = require("../../packages/web/lib/capture-batch-db.ts");
const { validateBrowserCapture } = require("../../packages/web/lib/browser-capture-contract.ts");
const { executeCaptureBatch } = require("../../packages/web/lib/capture-batch-worker.ts");
const { readLivePauta } = require("../../packages/web/lib/pauta-db.ts");
const { defaultChannelPolicy } = require("../../packages/web/lib/recommendation-policy.ts");
const { linkBrowserAliExpress } = require("../../packages/web/lib/browser-affiliate-links.ts");
const { publicGo } = require("../../packages/web/lib/public-go.ts");

const { pg, factory, adminFactory } = await commercialFixture();
const browser = new BrowserCaptureStore(factory);
const batches = new CaptureBatchStore(factory);
const access = { tenantId: "local", appUserId: "browser-user", deviceId: "browser-device" };
const account = {
  tenantId: access.tenantId, affiliateId: "aff_local", actor: "human", actorAppUserId: access.appUserId,
  authenticatedAuthUserId: "browser-auth", membershipRole: "owner", requestId: "browser-integration",
};
const go = (slug: string) => publicGo(new Request(`https://fixture.test/go/${slug}`, { method: "HEAD" }), slug, null, adminFactory);
const files = [
  "20261023041600_optimize_public_link_reads.sql", "20261027030237_compose_homepage_editions.sql",
  "20261028041629_durable_product_presentation.sql", "20261101125432_renew_editorial_pauta.sql",
  "20261101193221_improve_editorial_recommendations.sql", "20261102131234_optimize_price_observation_scope.sql",
  "20261107185200_fix_price_comparability_and_currency_defaults.sql", "20261109120000_amazon_monetized_target.sql",
];

try {
  for (const file of files) {
    await pg.exec(await readFile(new URL(`../../packages/persistence/supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  await pg.exec(`
    create trigger product_seed_curation after insert on garimpa.product for each row execute function garimpa.seed_product_curation();
    insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_local','local','local','Browser Test');
    insert into garimpa.app_user(id,tenant_id,auth_user_id) values('browser-user','local','browser-auth');
    insert into garimpa.app_user_role(app_user_id,role) values('browser-user','afiliado');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_local','browser-user','owner');
    insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name)
      values('browser-device','aff_local','browser-user','Device fixture');
    insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status)
      values('aff_local','amazon','teste-20','fixture','active');
  `);
  await pg.query(`insert into garimpa.recommendation_channel(tenant_id,channel,version,policy_version,enabled,policy)
    values('local','whatsapp',1,'recommendation-v1',true,$1)`, [JSON.stringify(defaultChannelPolicy("whatsapp"))]);

  for (const marketplace of ["aliexpress", "amazon"] as const) {
    const ali = marketplace === "aliexpress";
    const url = ali ? "https://pt.aliexpress.com/item/1005010089217228.html" : "https://www.amazon.com.br/dp/8571262586";
    const product = {
      externalId: ali ? "1005010089217228" : "8571262586",
      title: ali ? "HOMEFISH BLACK" : "Ficção científica capitalista", productUrl: url,
      imageUrl: ali ? "https://ae-pic-a1.aliexpress-media.com/test.jpg" : "https://m.media-amazon.com/test.jpg",
      currency: "BRL", priceCents: ali ? 6284 : 3990, priceType: ali ? "range" : "exact",
      ...(ali ? { priceMaxCents: 7490, condition: "first_purchase" } : {}),
    };
    const payload = validateBrowserCapture({
      version: 1, marketplace, requestId: crypto.randomUUID(), clientCapturedAt: new Date().toISOString(),
      page: { kind: "product", url }, products: [product, product],
    });
    const batchId = await browser.pending(access, marketplace);
    assert.ok(batchId);
    assert.equal(await browser.pending(access, ali ? "amazon" : "aliexpress"), null);
    await assert.rejects(() => browser.complete(access, batchId, { ...payload, marketplace: "mercadolivre" }), /marketplace_mismatch/);
    const imported = await browser.complete(access, batchId, payload);
    assert.equal(imported.importedCount, 1);
    assert.equal((await browser.complete(access, batchId, payload)).duplicate, true);
    const steps: string[] = [];
    let aliTarget = "https://s.click.aliexpress.com/e/test";
    await executeCaptureBatch(batchId, async (step: { kind: string; captureRunId?: string }) => {
      steps.push(step.kind);
      if (step.kind === "affiliate") {
        assert.ok(step.captureRunId);
        if (process.env.BIZUMINER_LIVE_ALI_LINK_TEST === "1") {
          assert.deepEqual(await linkBrowserAliExpress("local", step.captureRunId, factory), { failed: 0 });
          const saved = (await pg.query("select affiliate_url from garimpa.publication where slug='ali-1005010089217228'")).rows[0] as {affiliate_url: string};
          assert.equal(new URL(saved.affiliate_url).hostname, "s.click.aliexpress.com");
          aliTarget = saved.affiliate_url;
        } else {
          await pg.query("update garimpa.publication set affiliate_url=$1 where slug='ali-1005010089217228'", [aliTarget]);
        }
        return { ok: true };
      }
      await pg.query(`update garimpa.product_curation c set status='approved'
        from garimpa.product p where p.id=c.product_id and p.tenant_id=c.tenant_id and p.marketplace=$1`, [marketplace]);
      return { ok: true, triage: { processed: 1, approved: 1, held: 0, rejected: 0, annotatedPending: 0 } };
    }, batches, "local");
    assert.deepEqual(steps, ali ? ["affiliate", "triage"] : ["triage"]);
    assert.equal((await batches.read(batchId, "local"))?.status, "ok");
    if (ali) {
      await pg.exec(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence)
        select 'api-ali','local',id,9555,now()+interval '1 second','{"priceType":"exact","currency":"BRL","source":{"method":"official_api"}}'
        from garimpa.product where tenant_id='local' and marketplace='aliexpress'`);
    }
    const { products, recent } = await readLivePauta(account, "whatsapp", marketplace, factory);
    const selected = products.find((p: { marketplace: string }) => p.marketplace === marketplace);
    assert.ok(selected, `approved ${marketplace} offer should appear in Pauta. ${JSON.stringify(recent)}`);
    assert.equal(selected.priceCents, product.priceCents);
    if (ali) {
      assert.equal(selected.priceMaxCents, 7490);
      assert.equal(recent.find((item: { id: string }) => item.id === selected.id)?.priceCents, 6284);
      assert.equal(selected.offerConditions, "Preço para primeira compra");
      assert.equal(selected.offerOptionKey, undefined);
    }
    const response = await go(selected.shareTarget.slug);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), ali ? aliTarget : `${url}?tag=teste-20`);
    if (ali) {
      await pg.query("update garimpa.publication set affiliate_url=null where tenant_id='local' and slug=$1", [selected.shareTarget.slug]);
    } else {
      await pg.exec("update garimpa.affiliate_marketplace_config set status='suspended' where affiliate_id='aff_local' and marketplace='amazon'");
    }
    const unavailable = await readLivePauta(account, "whatsapp", marketplace, factory);
    assert.ok(!unavailable.products.some((p: { id: string }) => p.id === selected.id));
    assert.equal(unavailable.recent.find((p: { id: string }) => p.id === selected.id)?.status, "blocked");
    assert.equal((await go(selected.shareTarget.slug)).status, 404);
    console.log(`PASS ${marketplace}: import, replay, scoped triage, Pauta, affiliate redirect and missing-link protection`);
  }
} finally {
  await pg.close();
}
