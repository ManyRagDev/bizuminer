import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const w = require("../../packages/web/lib/commercial-workflow.ts");
const { withAccountDb } = require("../../packages/web/lib/tenant-db.ts");
const {
  resolveActiveEntitlement,
  reserveOperationQuota,
} = require("../../packages/web/lib/saas-entitlement-db.ts");

const { pg, applied, factory, adminFactory } = await commercialFixture();

const ctx = (t: string, role = "owner") => ({
  tenantId: t,
  affiliateId: `aff_${t}`,
  actor: "human" as const,
  actorAppUserId: `user_${t}`,
  authenticatedAuthUserId: `auth_${t}`,
  membershipRole: role as "owner" | "operator",
  requestId: `req_${t}_${Date.now()}`,
});

const qualifiedEvidence = {
  version: 2,
  currency: "BRL",
  priceType: "exact",
  variantIdentity: { state: "source_verified", key: "unit", attributes: {} },
  packageQuantity: 1,
  fieldStates: {
    sellerId: "not_applicable",
    packageContents: "not_applicable",
    dimensions: "not_applicable",
    payment: "not_applicable",
    coupon: "not_applicable",
    region: "not_applicable",
  },
};

// Seed test accounts and products
await pg.exec(`
  insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values
    ('aff_local','local','bizuminer','Casa'),
    ('aff_alpha','alpha','alpha','Alpha'),
    ('aff_beta','beta','beta','Beta'),
    ('aff_no_plan','no_plan','noplan','No Plan'),
    ('aff_suspended','suspended','suspended','Suspended'),
    ('aff_expired','expired','expired','Expired'),
    ('aff_future','future','future','Future'),
    ('aff_ambiguous','ambiguous','ambiguous','Ambiguous');

  insert into garimpa.app_user(id,tenant_id,auth_user_id) values
    ('user_local','local','auth_local'),
    ('user_alpha','alpha','auth_alpha'),
    ('user_beta','beta','auth_beta'),
    ('user_no_plan','no_plan','auth_no_plan'),
    ('user_suspended','suspended','auth_suspended'),
    ('user_expired','expired','auth_expired'),
    ('user_future','future','auth_future'),
    ('user_ambiguous','ambiguous','auth_ambiguous');

  insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values
    ('aff_local','user_local','owner'),
    ('aff_alpha','user_alpha','owner'),
    ('aff_beta','user_beta','owner'),
    ('aff_no_plan','user_no_plan','owner'),
    ('aff_suspended','user_suspended','owner'),
    ('aff_expired','user_expired','owner'),
    ('aff_future','user_future','owner'),
    ('aff_ambiguous','user_ambiguous','owner');

  insert into garimpa.app_user_role(app_user_id,role) values
    ('user_local','afiliado'),
    ('user_alpha','afiliado'),
    ('user_beta','afiliado'),
    ('user_no_plan','afiliado'),
    ('user_suspended','afiliado'),
    ('user_expired','afiliado'),
    ('user_future','afiliado'),
    ('user_ambiguous','afiliado');

  insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values
    ('prod_local','local','mercadolivre','L01','Produto Casa','https://produto.mercadolivre.com.br/MLB-L01',5000),
    ('prod_alpha','alpha','mercadolivre','A01','Produto Alpha','https://produto.mercadolivre.com.br/MLB-A01',10000),
    ('prod_beta','beta','shopee','B01','Produto Beta','https://shopee.com.br/B01',20000);

  insert into garimpa.product_curation(tenant_id,product_id,status) values
    ('local','prod_local','approved'),
    ('alpha','prod_alpha','approved'),
    ('beta','prod_beta','approved');

  insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url) values
    ('pub_local','local','aff_local','prod_local','web','local--prod-l01','active',null),
    ('pub_alpha','alpha','aff_alpha','prod_alpha','web','alpha--prod-a01','active',null),
    ('pub_beta','beta','aff_beta','prod_beta','web','beta--prod-b01','active','https://s.shopee.com.br/b01');

  insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status) values
    ('aff_local','mercadolivre','tag_local','tool_local','active'),
    ('aff_alpha','mercadolivre','tag_alpha','tool_alpha','active'),
    ('aff_beta','shopee','tag_beta','tool_beta','active');

  -- Entitlements:
  -- 1. House (local) with explicit internal policy
  insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values
    ('local','aff_local','enterprise-internal','active','2026-01-01T00:00:00Z','{"maxActiveCampaigns":1000,"maxDailyKits":10000,"allowedMarketplaces":["mercadolivre","shopee"]}'::jsonb,'terms_internal_v1');

  -- 2. Alpha: tight quota of 1 active campaign and 2 daily kits
  insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values
    ('alpha','aff_alpha','pilot-tight','active','2026-01-01T00:00:00Z','{"maxActiveCampaigns":1,"maxDailyKits":2,"allowedMarketplaces":["mercadolivre"]}'::jsonb,'terms_pilot_v1');

  -- 3. Suspended account
  insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values
    ('suspended','aff_suspended','pilot-v1','suspended','2026-01-01T00:00:00Z','{"maxActiveCampaigns":5,"maxDailyKits":10}'::jsonb,'terms_pilot_v1');

  -- 4. Expired account (ended in past)
  insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,ends_at,limits,terms_ref) values
    ('expired','aff_expired','pilot-v1','active','2026-01-01T00:00:00Z','2026-02-01T00:00:00Z','{"maxActiveCampaigns":5,"maxDailyKits":10}'::jsonb,'terms_pilot_v1');

  -- 5. Future account (starts in future)
  insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values
    ('future','aff_future','pilot-v1','active','2028-01-01T00:00:00Z','{"maxActiveCampaigns":5,"maxDailyKits":10}'::jsonb,'terms_pilot_v1');

  -- 6. Ambiguous account (two overlapping active plans)
  insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values
    ('ambiguous','aff_ambiguous','plan-a','active','2026-01-01T00:00:00Z','{"maxActiveCampaigns":5,"maxDailyKits":10}'::jsonb,'terms_a'),
    ('ambiguous','aff_ambiguous','plan-b','active','2026-01-01T00:00:00Z','{"maxActiveCampaigns":10,"maxDailyKits":20}'::jsonb,'terms_b');
`);

await pg.query(
  `insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values
    ('obs_local','local','prod_local',5000,$1),
    ('obs_alpha','alpha','prod_alpha',10000,$1),
    ('obs_beta','beta','prod_beta',20000,$1)`,
  [JSON.stringify(qualifiedEvidence)]
);

console.log("--- D04 ENTITLEMENT & ATOMIC QUOTA TESTS ---");

// Test 1: Account without entitlement fails with entitlement_required
console.log("Testing 1: Account without entitlement is rejected...");
await assert.rejects(
  () =>
    w.createCampaignForAccount(
      ctx("no_plan"),
      {
        name: "Campanha No Plan",
        objective: "Teste",
        audience: "Público",
        requestId: "req_no_plan_1",
      },
      factory
    ),
  /entitlement_required/
);
console.log("PASS 1: Account without entitlement rejected");

// Test 2: Suspended account is rejected
console.log("Testing 2: Suspended account is rejected...");
await assert.rejects(
  () =>
    w.createCampaignForAccount(
      ctx("suspended"),
      {
        name: "Campanha Suspensa",
        objective: "Teste",
        audience: "Público",
        requestId: "req_suspended_1",
      },
      factory
    ),
  /account_suspended/
);
console.log("PASS 2: Suspended account rejected");

// Test 3: Expired account (ends_at in past) is rejected
console.log("Testing 3: Expired account is rejected...");
await assert.rejects(
  () =>
    w.createCampaignForAccount(
      ctx("expired"),
      {
        name: "Campanha Expirada",
        objective: "Teste",
        audience: "Público",
        requestId: "req_expired_1",
      },
      factory
    ),
  /plan_expired/
);
console.log("PASS 3: Expired account rejected");

// Test 4: Future account (starts_at in future) is rejected
console.log("Testing 4: Future account is rejected...");
await assert.rejects(
  () =>
    w.createCampaignForAccount(
      ctx("future"),
      {
        name: "Campanha Futura",
        objective: "Teste",
        audience: "Público",
        requestId: "req_future_1",
      },
      factory
    ),
  /plan_not_started/
);
console.log("PASS 4: Future account rejected");

// Test 5: Ambiguous account (multiple active overlapping plans) is rejected
console.log("Testing 5: Ambiguous account is rejected...");
await assert.rejects(
  () =>
    w.createCampaignForAccount(
      ctx("ambiguous"),
      {
        name: "Campanha Ambigua",
        objective: "Teste",
        audience: "Público",
        requestId: "req_ambiguous_1",
      },
      factory
    ),
  /ambiguous_entitlement/
);
console.log("PASS 5: Ambiguous account rejected");

// Test 6: House account uses common engine with explicit policy
console.log("Testing 6: House account (local) works under common engine...");
const houseCampaign = await w.createCampaignForAccount(
  ctx("local"),
  {
    name: "Campanha Casa",
    objective: "Operação própria",
    audience: "Geral",
    requestId: "req_house_camp_1",
  },
  factory
);
assert.ok(houseCampaign.campaignId);
console.log("PASS 6: House account created campaign under common engine");

// Test 7: Alpha creates its 1st campaign (quota maxActiveCampaigns = 1)
console.log("Testing 7: Alpha creates 1st campaign (quota limit is 1)...");
const alphaCampaign1 = await w.createCampaignForAccount(
  ctx("alpha"),
  {
    name: "Campanha Alpha 1",
    objective: "Piloto",
    audience: "Tech",
    requestId: "req_alpha_camp_1",
  },
  factory
);
assert.ok(alphaCampaign1.campaignId);
console.log("PASS 7: 1st campaign created successfully");

// Test 8: Replay of 1st campaign returns previous result without consuming extra quota
console.log("Testing 8: Replay returns previous result without consuming extra quota...");
const usageBeforeReplay = (
  await pg.query(
    `select count(*)::int as n from garimpa.usage_event where tenant_id = 'alpha'`
  )
).rows[0].n;
const alphaCampaignReplay = await w.createCampaignForAccount(
  ctx("alpha"),
  {
    name: "Campanha Alpha 1",
    objective: "Piloto",
    audience: "Tech",
    requestId: "req_alpha_camp_1",
  },
  factory
);
assert.deepEqual(alphaCampaignReplay, alphaCampaign1);
const usageAfterReplay = (
  await pg.query(
    `select count(*)::int as n from garimpa.usage_event where tenant_id = 'alpha'`
  )
).rows[0].n;
assert.equal(usageAfterReplay, usageBeforeReplay, "Usage events must not increase on replay");
console.log("PASS 8: Idempotent replay consumed no additional quota");

// Test 9: Alpha attempts 2nd campaign -> blocked because maxActiveCampaigns = 1
console.log("Testing 9: Alpha attempts 2nd campaign disputing quota -> blocked...");
await assert.rejects(
  () =>
    w.createCampaignForAccount(
      ctx("alpha"),
      {
        name: "Campanha Alpha 2",
        objective: "Piloto Excesso",
        audience: "Tech",
        requestId: "req_alpha_camp_2",
      },
      factory
    ),
  /quota_exceeded.*Limite de campanhas ativas/
);
console.log("PASS 9: 2nd campaign blocked by quota limit");

// Test 10: Client tampering with limits or count is rejected by RLS
console.log("Testing 10: Client tampering with account_entitlement rejected by RLS...");
await assert.rejects(
  () =>
    withAccountDb(
      ctx("alpha"),
      async (tx: any) => {
        await tx`insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,limits,terms_ref) values ('alpha','aff_alpha','hacked','active','2026-01-01T00:00:00Z','{"maxActiveCampaigns":999}'::jsonb,'terms')`;
      },
      factory
    ),
  /row-level security policy|permission denied/
);

const updateRes = await withAccountDb(
  ctx("alpha"),
  async (tx: any) => {
    return tx`update garimpa.account_entitlement set limits = '{"maxActiveCampaigns":999}'::jsonb where tenant_id = 'alpha'`;
  },
  factory
);
assert.equal(updateRes.count, 0, "Client update under RLS must affect 0 rows");
const [alphaEntInDb] = (
  await pg.query(
    `select limits from garimpa.account_entitlement where tenant_id = 'alpha' and status = 'active'`
  )
).rows;
assert.equal(alphaEntInDb.limits.maxActiveCampaigns, 1, "Limits must remain unchanged in DB");
console.log("PASS 10: Client cannot mutate account_entitlement under RLS");

// Test 11: Daily kit quota enforcement (Alpha limit is 2 daily kits)
console.log("Testing 11: Daily kit quota enforcement (limit 2)...");
const kit1 = await w.createKitForAccount(
  ctx("alpha"),
  {
    campaignId: alphaCampaign1.campaignId,
    productId: "prod_alpha",
    channel: "whatsapp_channel",
    reason: "Motivo Kit 1",
    requestId: "req_alpha_kit_1",
  },
  factory
);
assert.ok(kit1.kitId);

const kit2 = await w.createKitForAccount(
  ctx("alpha"),
  {
    campaignId: alphaCampaign1.campaignId,
    productId: "prod_alpha",
    channel: "telegram_channel",
    reason: "Motivo Kit 2",
    requestId: "req_alpha_kit_2",
  },
  factory
);
assert.ok(kit2.kitId);

// 3rd kit on same day exceeds daily limit
await assert.rejects(
  () =>
    w.createKitForAccount(
      ctx("alpha"),
      {
        campaignId: alphaCampaign1.campaignId,
        productId: "prod_alpha",
        channel: "telegram_channel",
        reason: "Motivo Kit 3",
        requestId: "req_alpha_kit_3",
      },
      factory
    ),
  /quota_exceeded.*Limite diário de kits comerciais/
);
console.log("PASS 11: 3rd kit blocked by daily kit quota");

// Test 12: Command failure rolls back reservation and usage_event
console.log("Testing 12: Command failure rolls back usage_event reservation...");
const usageBeforeFail = (
  await pg.query(
    `select count(*)::int as n from garimpa.usage_event where tenant_id = 'local'`
  )
).rows[0].n;

await assert.rejects(
  () =>
    w.createKitForAccount(
      ctx("local"),
      {
        campaignId: houseCampaign.campaignId,
        productId: "prod_local",
        channel: "whatsapp_channel",
        reason: "Motivo Falha",
        copy: "   ", // Invalid whitespace-only copy triggers error
        requestId: "req_house_kit_fail",
      },
      factory
    ),
  /invalid_input/
);

const usageAfterFail = (
  await pg.query(
    `select count(*)::int as n from garimpa.usage_event where tenant_id = 'local'`
  )
).rows[0].n;
assert.equal(usageAfterFail, usageBeforeFail, "Failed command must not leave usage_event reservation behind");
console.log("PASS 12: Failed command left zero lingering reservations");

// Test 13: Timezone / next-day window resets daily kit quota
console.log("Testing 13: Next-day boundary allows new kit creation...");
const tomorrow = new Date(Date.now() + 24 * 3600 * 1000 + 1000);
// Directly test reserveOperationQuota with tomorrow's date for alpha
const nextDayRes = await withAccountDb(
  ctx("alpha"),
  (tx: any) =>
    reserveOperationQuota(tx, ctx("alpha"), "create_kit", "req_alpha_kit_tomorrow", {
      now: tomorrow,
    }),
  factory
);
assert.ok(nextDayRes.entitlement);
console.log("PASS 13: Next day boundary allows daily quota reset");

console.log("ALL D04 ENTITLEMENT & ATOMIC QUOTA TESTS PASSED!");
await pg.close();
