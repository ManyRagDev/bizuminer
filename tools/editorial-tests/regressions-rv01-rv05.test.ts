/**
 * Regressões RV-01 a RV-05 (Revisão 14 / Plano 15).
 * Esperam o comportamento correto do sistema reparado.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const { upsertMarketplaceConfig } = require("../../packages/web/lib/affiliate-db.ts");
const { getEditorialSelectionDesk } = require("../../packages/web/lib/editorial-selection-db.ts");
const { CaptureBatchStore } = require("../../packages/web/lib/capture-batch-db.ts");
const { curationSummary } = require("../../packages/web/lib/curation-db.ts");
const { withAccountDb } = require("../../packages/web/lib/tenant-db.ts");
const {
  parseCanonicalCommissionCsv,
  calculateCanonicalReportDigest,
} = require("../../packages/web/lib/commission-import-contract.ts");
const { validatePreDispatch } = require("../../packages/web/lib/dispatch-contract.ts");
const {
  validateAccountInvitation,
  validateEntitlementQuota,
} = require("../../packages/web/lib/saas-onboarding-contract.ts");

async function run() {
  const { pg, factory, applied } = await commercialFixture();
  const contextA = {
    tenantId: "a",
    affiliateId: "aff_a",
    actor: "human" as const,
    actorAppUserId: "user_a",
    authenticatedAuthUserId: "auth_a",
    membershipRole: "owner" as const,
    requestId: "req_rv_regressions",
  };

  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://localhost/test_db";

  try {
    // Setup test data in isolated PGlite
    await pg.exec(`
      insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','alpha','Affiliate A');
      insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a');
      insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner');
      insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado');
      insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('prod_a','a','mercadolivre','111','Product A','https://mercadolivre.com.br/111',10000);
      insert into garimpa.product_curation(tenant_id,product_id,status) values('a','prod_a','approved');
      insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values('obs_a','a','prod_a',10000,'{"variantKey":"v1"}');
      insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash) values('dev_a','aff_a','user_a','Device A','hash_device_a');
      insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,started_at) values('00000000-0000-4000-8000-000000000099','a',array['mercadolivre'],1,now()-interval '3 hours');

      insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_local','local','house','House');
      insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('prod_house','local','mercadolivre','999','House Product','https://mercadolivre.com.br/999',10000);
      insert into garimpa.product_curation(tenant_id,product_id,status) values('local','prod_house','pending');
      insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values('obs_house','local','prod_house',10000,'{}');
    `);

    console.log("--- REGRESSIONS RV-01 TO RV-05 ---");

    // RV-01.1: Legitimate owner config upsert must succeed under RLS with account context
    console.log("Testing RV-01.1: owner upsertMarketplaceConfig under RLS...");
    const cfg = await upsertMarketplaceConfig(
      {
        appUserId: "user_a",
        affiliateId: "aff_a",
        marketplace: "mercadolivre",
        trackingId: "track_a",
        toolId: "tool_a",
      },
      "a",
      factory,
      contextA,
    );
    assert.equal(cfg.configured, true);
    console.log("PASS RV-01.1: upsertMarketplaceConfig succeeded for legitimate owner");

    // RV-01.2: House curation summary must NOT leak to non-member
    console.log("Testing RV-01.2: curationSummary boundary...");
    await assert.rejects(
      () => curationSummary("local", factory, contextA),
      /forbidden|tenant inválido/,
    );
    console.log("PASS RV-01.2: curationSummary fails closed when requesting unowned house tenant");

    // RV-01.3: Editorial selection desk under RLS sees candidate when tenant context is active
    console.log("Testing RV-01.3: editorial selection desk under RLS...");
    const desk = await getEditorialSelectionDesk("a", factory);
    assert.equal(desk.schemaReady, true);
    assert.ok(desk.candidates.length >= 1, "Candidates must be visible under RLS for authorized tenant");
    console.log("PASS RV-01.3: getEditorialSelectionDesk returns candidates under RLS");

    // RV-01.4: Capture batch expire under RLS expires overdue batch
    console.log("Testing RV-01.4: capture batch expire under RLS...");
    const expiredBatches = await new CaptureBatchStore(factory).expire("a");
    assert.equal(expiredBatches.length, 1, "Overdue batch must be expired");
    console.log("PASS RV-01.4: CaptureBatchStore.expire expired overdue batch");

    // RV-02: Revoking membership immediately revokes device authentication
    console.log("Testing RV-02: device bootstrap after membership revocation...");
    const beforeAuth = await factory()`select * from garimpa.authenticate_extension_device('hash_device_a')`;
    assert.equal(beforeAuth[0].role_active, true);

    await pg.exec(`update garimpa.affiliate_membership set revoked_at=now() where affiliate_id='aff_a' and app_user_id='user_a'`);

    const afterAuth = await factory()`select * from garimpa.authenticate_extension_device('hash_device_a')`;
    assert.equal(afterAuth[0].role_active, false, "role_active must be false after affiliate membership revoked");
    console.log("PASS RV-02: authenticate_extension_device returns role_active=false when membership is revoked");

    // RV-04: Strict commission CSV parsing & unambiguous digest
    console.log("Testing RV-04: strict commission CSV parser & digest collision...");
    const malformedInt1 = parseCanonicalCommissionCsv("ord-a,item-1,2026-10-14T10:00:00Z,100x,1200,BRL,shopee,sub,confirmed,confirmed");
    assert.equal(malformedInt1.validRowsCount, 0, "100x must be rejected");

    const malformedInt2 = parseCanonicalCommissionCsv("ord-a,item-1,2026-10-14T10:00:00Z,10000,12abc,BRL,shopee,sub,confirmed,confirmed");
    assert.equal(malformedInt2.validRowsCount, 0, "12abc must be rejected");

    const negativeComm = parseCanonicalCommissionCsv("ord-a,item-1,2026-10-14T10:00:00Z,10000,-5,BRL,shopee,sub,confirmed,confirmed");
    assert.equal(negativeComm.validRowsCount, 0, "negative commission must be rejected");

    const missingFields = parseCanonicalCommissionCsv("ord-b,,2026-10-14T10:00:00Z,,25");
    assert.equal(missingFields.validRowsCount, 0, "missing required fields must not default to confirmed/BRL");

    const invalidState = parseCanonicalCommissionCsv("ord-a,item-1,2026-10-14T10:00:00Z,10000,500,BRL,shopee,sub,nonsense,nonsense");
    assert.equal(invalidState.validRowsCount, 0, "nonsense status must be rejected");

    // Digest collision resistance
    const row1 = {
      externalOrderId: "a:b",
      externalItemId: "c",
      occurredAt: "2026-10-14T10:00:00Z",
      orderValueCents: 1000,
      commissionCents: 100,
      currency: "BRL",
      marketplace: "shopee",
      subId: null,
      status: "confirmed" as const,
      commissionState: "confirmed" as const,
    };
    const row2 = {
      ...row1,
      externalOrderId: "a",
      externalItemId: "b:c",
    };
    assert.notEqual(
      calculateCanonicalReportDigest([row1]),
      calculateCanonicalReportDigest([row2]),
      "Digest must not collide when fields contain colons",
    );
    console.log("PASS RV-04: strict parsing and collision-free digest verified");

    // RV-05: Strict validity guards fail closed
    console.log("Testing RV-05: validity guards fail closed...");
    const invalidDispatchDate = validatePreDispatch({
      accountStatus: "active",
      destinationStatus: "active",
      killSwitchActive: false,
      kitStatus: "approved",
      kitRevisionId: "rev-1",
      targetKitRevisionId: "rev-1",
      priceObservedCents: 100,
      snapshotPriceCents: 100,
      validUntil: "invalid",
      linkMonetizationStatus: "valid",
    });
    assert.equal(invalidDispatchDate.canDispatch, false, "invalid validUntil must fail dispatch");

    const invalidInviteDate = validateAccountInvitation({
      requestingTenantId: "a",
      invitation: {
        id: "inv-1",
        tenantId: "a",
        invitedEmail: "test@example.com",
        role: "operator",
        expiresAt: "invalid",
        usedAt: null,
      },
    });
    assert.equal(invalidInviteDate.valid, false, "invalid expiresAt must fail invitation");

    const expiredEntitlement = validateEntitlementQuota({
      entitlement: {
        id: "ent-1",
        tenantId: "a",
        affiliateId: "aff_a",
        planVersion: "v1",
        status: "active",
        startsAt: "2020-01-01T00:00:00Z",
        endsAt: "2020-01-02T00:00:00Z",
        limits: { maxActiveCampaigns: 1 },
        termsRef: "terms_v1",
      },
      operation: "create_campaign",
      currentActiveCampaigns: 0,
      now: new Date("2026-10-14T00:00:00Z"),
    });
    assert.equal(expiredEntitlement.allowed, false, "expired entitlement must be rejected even if status says active");

    const unconfiguredQuota = validateEntitlementQuota({
      entitlement: {
        id: "ent-2",
        tenantId: "a",
        affiliateId: "aff_a",
        planVersion: "v1",
        status: "active",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2027-01-01T00:00:00Z",
        limits: {}, // No maxActiveCampaigns configured
        termsRef: "terms_v1",
      },
      operation: "create_campaign",
      currentActiveCampaigns: 0,
    });
    assert.equal(unconfiguredQuota.allowed, false, "missing explicit limit must fail closed without commercial defaults");
    console.log("PASS RV-05: strict guards fail closed on invalid dates and expired/unconfigured quotas");

    console.log("ALL REGRESSION TESTS (RV-01 TO RV-05) PASSED!");
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await pg.close();
  }
}

run().catch((err) => {
  console.error("REGRESSION TEST FAILED AS EXPECTED OR UNEXPECTED:");
  console.error(err);
  process.exit(1);
});
