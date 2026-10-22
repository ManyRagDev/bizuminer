import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const {
  createAudiencePolicy,
  createAudiencePolicyVersion,
  getActiveAudiencePolicy,
  checkChannelCooldown,
  createOrUpdateOpportunity,
  archiveOpportunity,
  reactivateOpportunity,
  getOpportunityById,
  getRadarOpportunities,
  prioritizeMonitoringQueue,
} = require("../../packages/web/lib/opportunity-db.ts");

const {
  createCampaignForAccount,
  createKitForAccount,
} = require("../../packages/web/lib/commercial-workflow.ts");

const { pg, factory } = await commercialFixture();

console.log("--- D07 OPPORTUNITY, RADAR & AUDIENCE POLICY INTEGRATION TESTS ---");

// Helper context generator
const ctx = (t: string, user = `user_${t}`, role = "owner") => ({
  tenantId: t,
  affiliateId: `aff_${t}`,
  actor: "human" as const,
  actorAppUserId: user,
  authenticatedAuthUserId: `auth_${user}`,
  membershipRole: role,
  requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
});

// Seed tenants, products, users and affiliations
await pg.exec(`
  insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name) values
    ('aff_opp_a', 'opp_a', 'slug-a', 'Tenant Opp A'),
    ('aff_opp_b', 'opp_b', 'slug-b', 'Tenant Opp B')
  on conflict do nothing;

  insert into garimpa.app_user(id, tenant_id, auth_user_id) values
    ('user_opp_a', 'opp_a', 'auth_user_opp_a'),
    ('user_opp_b', 'opp_b', 'auth_user_opp_b')
  on conflict do nothing;

  insert into garimpa.app_user_role(app_user_id, role) values
    ('user_opp_a', 'afiliado'),
    ('user_opp_b', 'afiliado')
  on conflict do nothing;

  insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values
    ('aff_opp_a', 'user_opp_a', 'owner'),
    ('aff_opp_b', 'user_opp_b', 'owner')
  on conflict do nothing;

  insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, last_price_cents, last_seen_at) values
    ('prod_opp_1', 'opp_a', 'mercadolivre', 'ext_opp_1', 'Cafeteira Espresso PrimaLatte Oster', 'https://mercadolivre.com.br/item1', 49900, now()),
    ('prod_opp_2', 'opp_a', 'mercadolivre', 'ext_opp_2', 'Fritadeira Air Fryer Philco 4L', 'https://mercadolivre.com.br/item2', 29900, now()),
    ('prod_opp_3', 'opp_a', 'shopee', 'ext_opp_3', 'Robô Aspirador Inteligente WAP', 'https://shopee.com.br/item3', 89900, now()),
    ('prod_opp_b1', 'opp_b', 'mercadolivre', 'ext_opp_b1', 'Câmera Segurança Wi-Fi 360', 'https://mercadolivre.com.br/itemb1', 19900, now())
  on conflict (id) do nothing;

  insert into garimpa.product_curation(product_id, tenant_id, status) values
    ('prod_opp_1', 'opp_a', 'approved'),
    ('prod_opp_2', 'opp_a', 'approved'),
    ('prod_opp_3', 'opp_a', 'approved'),
    ('prod_opp_b1', 'opp_b', 'approved')
  on conflict do nothing;

  insert into garimpa.publication(id, tenant_id, affiliate_id, product_id, channel, slug, status, affiliate_url) values
    ('pub_opp_1', 'opp_a', 'aff_opp_a', 'prod_opp_1', 'web', 'slug-a--ml-ext-1', 'active', null),
    ('pub_opp_2', 'opp_a', 'aff_opp_a', 'prod_opp_2', 'web', 'slug-a--ml-ext-2', 'active', null),
    ('pub_opp_3', 'opp_a', 'aff_opp_a', 'prod_opp_3', 'web', 'slug-a--shp-ext-3', 'active', null),
    ('pub_opp_b1', 'opp_b', 'aff_opp_b', 'prod_opp_b1', 'web', 'slug-b--ml-ext-b1', 'active', null)
  on conflict do nothing;

  insert into garimpa.affiliate_marketplace_config(affiliate_id, marketplace, tracking_id, tool_id, status) values
    ('aff_opp_a', 'mercadolivre', 'tag_a', 'tool_a', 'active'),
    ('aff_opp_a', 'shopee', 'tag_a_shp', 'tool_a_shp', 'active'),
    ('aff_opp_b', 'mercadolivre', 'tag_b', 'tool_b', 'active')
  on conflict do nothing;

  insert into garimpa.account_entitlement(tenant_id, affiliate_id, plan_version, status, starts_at, limits, terms_ref) values
    ('opp_a', 'aff_opp_a', 'pilot-v1', 'active', '2026-01-01T00:00:00Z', '{"maxActiveCampaigns":10,"maxDailyKits":50,"allowedMarketplaces":["mercadolivre","shopee"]}'::jsonb, 'terms_pilot_v1'),
    ('opp_b', 'aff_opp_b', 'pilot-v1', 'active', '2026-01-01T00:00:00Z', '{"maxActiveCampaigns":10,"maxDailyKits":50,"allowedMarketplaces":["mercadolivre"]}'::jsonb, 'terms_pilot_v1')
  on conflict do nothing;
`);

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

await pg.query(
  `insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, offer_evidence, observed_at) values
    ('obs_opp_1', 'opp_a', 'prod_opp_1', 49900, $1, now() - interval '1 hour'),
    ('obs_opp_2', 'opp_a', 'prod_opp_2', 29900, $1, now() - interval '1 hour'),
    ('obs_opp_3', 'opp_a', 'prod_opp_3', 89900, $1, now() - interval '1 hour'),
    ('obs_opp_b1', 'opp_b', 'prod_opp_b1', 19900, $1, now() - interval '1 hour')
   on conflict do nothing;`,
  [JSON.stringify(qualifiedEvidence)],
);

// Mock rubric assessment factory
function mockRubric(quality: string, value: string, audience: string, confidence: string) {
  return {
    schemaVersion: 2,
    rubricVersion: "2026-04-canonical",
    evidenceDigest: `digest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    evaluator: "editorial_human",
    assessedAt: new Date().toISOString(),
    overallRecommendation: "publish",
    quality: { level: quality, reason: "Qualidade verificada" },
    value: { level: value, reason: "Valor avaliado" },
    audience: { level: audience, reason: "Aderência ao público" },
    evidenceConfidence: { level: confidence, reason: "Confiança na evidência" },
    unknowns: [],
    safetyFlags: [],
  };
}

// Mock price evidence factory
function mockPriceEvidence(discountPercent = 25, priceCents = 49900) {
  return {
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
    currentPriceCents: priceCents,
    benchmarkPriceCents: Math.round(priceCents / (1 - discountPercent / 100)),
    discountPercent,
    validUntil: new Date(Date.now() + 24 * 3600000).toISOString(),
    sourceVerified: true,
    unknowns: [],
  };
}

const baseSql = factory();
async function asTenant<T>(tenantId: string, role = "owner", fn: (tx: any) => Promise<T>): Promise<T> {
  return baseSql.begin(async (tx: any) => {
    await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
    await tx`select set_config('garimpa.membership_role', ${role}, true)`;
    return fn(tx);
  });
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`✓ PASS: ${name}`);
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    throw err;
  }
}

// 1. Audience Policy Creation, Versioning, and RLS
let policyAId = "";
let versionAId = "";

await test("createAudiencePolicy & createAudiencePolicyVersion sets active policy", async () => {
  const created = await asTenant("opp_a", "owner", (tx) =>
    createAudiencePolicy(tx, "opp_a", {
      name: "Público Casa & Cozinha - Ofertas Quentes",
      status: "draft",
    }),
  );
  assert.ok(created.id);
  policyAId = created.id;

  const version = await asTenant("opp_a", "owner", (tx) =>
    createAudiencePolicyVersion(tx, "opp_a", {
      policyId: created.id,
      version: "v1.0.0",
      config: {cooldownHours:24,
        schemaVersion: 1,
        audience: "casa_cozinha",
        mode: "assisted",
        rubricStatus: "homologated",
      },
      approvedBy: "user_opp_a",
    }),
  );
  assert.ok(version.id);
  versionAId = version.id;

  const active = await asTenant("opp_a", "owner", (tx) =>
    getActiveAudiencePolicy(tx, "opp_a", policyAId),
  );
  assert.ok(active);
  assert.equal(active.policy.id, policyAId);
  assert.equal(active.policy.status, "active");
  assert.equal(active.policy.currentVersion, "v1.0.0");
  assert.equal(active.version.version, "v1.0.0");
  assert.equal(active.version.approvedBy, "user_opp_a");
});

await test("multi-tenant isolation prevents tenant B from seeing tenant A policy", async () => {
  const activeB = await asTenant("opp_b", "owner", (tx) =>
    getActiveAudiencePolicy(tx, "opp_b", policyAId),
  );
  assert.equal(activeB, null, "Tenant B should not access Tenant A's policy");
});

// 2. Canonical Opportunity Classification & Domain Event Emission
let opp1Id = "";
await test("classify and create gold opportunity emits domain event", async () => {
  const assessment = mockRubric("strong", "strong", "strong", "strong");
  const evidence = mockPriceEvidence(30, 49900);

  const res = await asTenant("opp_a", "owner", (tx) =>
    createOrUpdateOpportunity(tx, "opp_a", {
      productId: "prod_opp_1",
      policyVersionId: versionAId,
      audienceKey: "casa_cozinha",
      channel: "whatsapp_channel",
      assessment,
      priceEvidence: evidence,
      requestId: "req_create_opp1",
      actorRef: "user_opp_a",
    }),
  );

  assert.ok(res.id);
  assert.equal(res.revision, 1);
  assert.equal(res.opportunityClass, "gold");
  opp1Id = res.id;

  // Verify domain event
  const events = await asTenant("opp_a", "owner", (tx) =>
    tx<{ event_type: string; aggregate_type: string; aggregate_id: string }[]>`
      select event_type, aggregate_type, aggregate_id
      from garimpa.domain_event
      where tenant_id = 'opp_a' and aggregate_id = ${opp1Id}
    `,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].aggregate_type, "opportunity");
  assert.equal(events[0].event_type, "OpportunityPrioritized");
});

// 3. Human Motivated Priority
await test("motivated human priority upgrades state to prioritized and emits OpportunityPrioritized", async () => {
  const assessment = mockRubric("adequate", "adequate", "strong", "adequate");
  const evidence = mockPriceEvidence(15, 29900);

  const res = await asTenant("opp_a", "owner", (tx) =>
    createOrUpdateOpportunity(tx, "opp_a", {
      productId: "prod_opp_2",
      policyVersionId: versionAId,
      audienceKey: "casa_cozinha",
      channel: "whatsapp_channel",
      assessment,
      priceEvidence: evidence,
      humanPriority: {
        state: "prioritized",
        reason: "Destaque editorial do dia - Curadoria Garimpa",
      },
      requestId: "req_human_prio",
      actorRef: "user_opp_a",
    }),
  );

  assert.equal(res.state, "prioritized");

  const opp = await asTenant("opp_a", "owner", (tx) =>
    getOpportunityById(tx, "opp_a", res.id),
  );
  assert.ok(opp);
  assert.ok(opp.reasons.some((r: string) => r.includes("Destaque editorial do dia")));

  const [prioEvent] = await asTenant("opp_a", "owner", (tx) =>
    tx<{ event_type: string }[]>`
      select event_type from garimpa.domain_event
      where tenant_id = 'opp_a' and aggregate_id = ${res.id} and event_type = 'OpportunityPrioritized'
    `,
  );
  assert.ok(prioEvent, "Should emit OpportunityPrioritized domain event");
});

// 4. Channel Cooldown
await test("channel cooldown suppresses prioritized state on same channel but not on different channel", async () => {
  // Check initial cooldown: none
  const initCooldown = await asTenant("opp_a", "owner", (tx) =>
    checkChannelCooldown(tx, "opp_a", "prod_opp_1", "whatsapp_channel",24,"casa_cozinha"),
  );
  assert.equal(initCooldown.onCooldown, false);

  // Simulate confirmed publication for prod_opp_1 on whatsapp_channel within 2h
  await pg.exec(`
    insert into garimpa.campaign(id, tenant_id, name, objective, audience_policy_version_id, status, created_by)
    values ('camp_cd', 'opp_a', 'Camp Cooldown', 'Teste Cooldown', '${versionAId}', 'active', 'user_opp_a')
    on conflict do nothing;

    insert into garimpa.commercial_kit(id, tenant_id, campaign_id, opportunity_id, current_revision, version, status)
    values ('kit_cd_1', 'opp_a', 'camp_cd', '${opp1Id}', 1, 1, 'approved')
    on conflict do nothing;

    insert into garimpa.commercial_kit_revision(id, tenant_id, kit_id, revision, snapshot, claims, materials, template_version, created_by, content_digest)
    values ('rev_cd', 'opp_a', 'kit_cd_1', 1, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '1.0.0', 'user_opp_a', 'dig_cd')
    on conflict do nothing;

    insert into garimpa.destination(id, tenant_id, label, channel, status)
    values ('dest_wa_1', 'opp_a', 'Grupo VIP WhatsApp', 'whatsapp_channel', 'active')
    on conflict do nothing;

    insert into garimpa.campaign_publication(id, tenant_id, campaign_id, kit_id, kit_revision_id, destination_id, channel, status, version, published_at, created_by)
    values ('pub_cd_wa', 'opp_a', 'camp_cd', 'kit_cd_1', 'rev_cd', 'dest_wa_1', 'whatsapp_channel', 'published_confirmed', 1, now() - interval '2 hours', 'user_opp_a')
    on conflict do nothing;
  `);

  // Now whatsapp_channel is on cooldown for prod_opp_1
  const waCooldown = await asTenant("opp_a", "owner", (tx) =>
    checkChannelCooldown(tx, "opp_a", "prod_opp_1", "whatsapp_channel",24,"casa_cozinha"),
  );
  assert.equal(waCooldown.onCooldown, true);
  assert.ok(waCooldown.remainingHours > 20 && waCooldown.remainingHours <= 22);

  // Updating prod_opp_1 on whatsapp_channel with human priority will fall back to monitored
  const waOpp = await asTenant("opp_a", "owner", (tx) =>
    createOrUpdateOpportunity(tx, "opp_a", {
      productId: "prod_opp_1",
      policyVersionId: versionAId,
      audienceKey: "casa_cozinha",
      channel: "whatsapp_channel",
      assessment: mockRubric("strong", "strong", "strong", "strong"),
      priceEvidence: mockPriceEvidence(30, 49900),
      humanPriority: { state: "prioritized", reason: "Forçando reenvio" },
    }),
  );
  assert.equal(waOpp.state, "monitored", "Cooldown must downgrade prioritized to monitored");

  // But telegram_channel is NOT in cooldown for prod_opp_1
  const tgCooldown = await asTenant("opp_a", "owner", (tx) =>
    checkChannelCooldown(tx, "opp_a", "prod_opp_1", "telegram_channel",24,"casa_cozinha"),
  );
  assert.equal(tgCooldown.onCooldown, false);

  const tgOpp = await asTenant("opp_a", "owner", (tx) =>
    createOrUpdateOpportunity(tx, "opp_a", {
      productId: "prod_opp_1",
      policyVersionId: versionAId,
      audienceKey: "casa_cozinha",
      channel: "telegram_channel",
      assessment: mockRubric("strong", "strong", "strong", "strong"),
      priceEvidence: mockPriceEvidence(30, 49900),
      humanPriority: { state: "prioritized", reason: "Canal livre" },
    }),
  );
  assert.equal(tgOpp.state, "prioritized", "Unpublished channel should remain prioritized");
});

// 5. Lifecycle: Unique Constraint, Archive, Reactivation
await test("unique constraint, archive and reactivate lifecycle", async () => {
  // Create prod_opp_3 opportunity
  const opp3 = await asTenant("opp_a", "owner", (tx) =>
    createOrUpdateOpportunity(tx, "opp_a", {
      productId: "prod_opp_3",
      policyVersionId: versionAId,
      audienceKey: "casa_cozinha",
      channel: "telegram_channel",
      assessment: mockRubric("strong", "adequate", "strong", "strong"),
      priceEvidence: mockPriceEvidence(20, 89900),
    }),
  );
  assert.ok(opp3.id);
  assert.equal(opp3.revision, 1);

  // Idempotent re-evaluation increments revision
  const opp3Updated = await asTenant("opp_a", "owner", (tx) =>
    createOrUpdateOpportunity(tx, "opp_a", {
      productId: "prod_opp_3",
      policyVersionId: versionAId,
      audienceKey: "casa_cozinha",
      channel: "telegram_channel",
      assessment: mockRubric("strong", "strong", "strong", "strong"),
      priceEvidence: mockPriceEvidence(25, 89900),
    }),
  );
  assert.equal(opp3Updated.id, opp3.id);
  assert.equal(opp3Updated.revision, 2);

  // Archive opportunity
  const archived = await asTenant("opp_a", "owner", (tx) =>
    archiveOpportunity(tx, "opp_a", opp3.id, {
      reason: "Esgotado no estoque do parceiro",
    }),
  );
  assert.equal(archived.ok, true);

  const opp3AfterArchive = await asTenant("opp_a", "owner", (tx) =>
    getOpportunityById(tx, "opp_a", opp3.id),
  );
  assert.equal(opp3AfterArchive?.state, "archived");

  // Because state is archived, creating a new opportunity for the same scope succeeds
  const opp3New = await asTenant("opp_a", "owner", (tx) =>
    createOrUpdateOpportunity(tx, "opp_a", {
      productId: "prod_opp_3",
      policyVersionId: versionAId,
      audienceKey: "casa_cozinha",
      channel: "telegram_channel",
      assessment: mockRubric("strong", "strong", "strong", "strong"),
      priceEvidence: mockPriceEvidence(25, 89900),
    }),
  );
  assert.notEqual(opp3New.id, opp3.id);
  assert.equal(opp3New.revision, 1);

  // Attempting to reactivate the old archived opportunity now fails because an active one exists
  const reactivateFail = await asTenant("opp_a", "owner", (tx) =>
    reactivateOpportunity(tx, "opp_a", opp3.id),
  );
  assert.equal(reactivateFail.ok, false);
  assert.equal(reactivateFail.error, "active_opportunity_exists");

  // Archive the new one, now reactivation of the old one succeeds
  await asTenant("opp_a", "owner", (tx) =>
    archiveOpportunity(tx, "opp_a", opp3New.id),
  );
  const reactivateOk = await asTenant("opp_a", "owner", (tx) =>
    reactivateOpportunity(tx, "opp_a", opp3.id, {
      reason: "Estoque reposto",
    }),
  );
  assert.equal(reactivateOk.ok, true);

  const opp3Restored = await asTenant("opp_a", "owner", (tx) =>
    getOpportunityById(tx, "opp_a", opp3.id),
  );
  assert.equal(opp3Restored?.state, "candidate");
});

// 6. Radar Query & Canonical Ranking
await test("getRadarOpportunities applies canonical ranking order", async () => {
  const radar = await asTenant("opp_a", "owner", (tx) =>
    getRadarOpportunities(tx, "opp_a"),
  );
  assert.ok(radar.length >= 2);

  // Prioritized opportunities must appear before monitored
  const firstPrioritizedIdx = radar.findIndex((o: any) => o.state === "prioritized");
  const firstMonitoredIdx = radar.findIndex((o: any) => o.state === "monitored");

  if (firstPrioritizedIdx !== -1 && firstMonitoredIdx !== -1) {
    assert.ok(
      firstPrioritizedIdx < firstMonitoredIdx,
      "Prioritized opportunities must precede monitored ones in the radar",
    );
  }
});

// 7. Anti-starvation Queue Allocation
await test("prioritizeMonitoringQueue reserves quota for fresh items without history", async () => {
  const seasoned = Array.from({ length: 20 }, (_, i) => ({
    id: `seasoned_${i}`,
    observationCount: 50 + i,
    historyDays: 30,
  }));
  const fresh = Array.from({ length: 5 }, (_, i) => ({
    id: `fresh_${i}`,
    observationCount: 1,
    historyDays: 1,
  }));

  const pool = [...seasoned, ...fresh];
  const budget = 10;
  const result = prioritizeMonitoringQueue(pool, budget, 0.3); // 30% of 10 = 3 fresh slots

  assert.equal(result.length, budget);
  const freshInResult = result.filter((r) => r.id.startsWith("fresh_"));
  assert.equal(freshInResult.length, 3, "Fresh quota must guarantee 3 slots");
});

// 8. Commercial Workflow Integration (createKitForAccount with opportunityId)
await test("createKitForAccount attaches opportunityId and rejects mismatched products", async () => {
  const contextA = ctx("opp_a");

  const campaign = await createCampaignForAccount(
    contextA,
    {
      name: "Campanha Radar D07",
      objective: "Disparo Assistido",
      audience: "casa_cozinha",
      requestId: "req_camp_radar",
    },
    factory,
  );

  // Create kit referencing opp1Id (prod_opp_1)
  const kit = await createKitForAccount(
    contextA,
    {
      campaignId: campaign.campaignId,
      productId: "prod_opp_1",
      channel: "whatsapp_channel",
      reason: "Curadoria confirmada via Radar",
      opportunityId: opp1Id,
      requestId: "req_kit_radar",
    },
    factory,
  );

  assert.ok(kit.kitId);

  // Verify kit has opportunity_id stored
  const [stored] = await asTenant("opp_a", "owner", (tx) =>
    tx<{ opportunity_id: string }[]>`
      select opportunity_id from garimpa.commercial_kit where id = ${kit.kitId}
    `,
  );
  assert.equal(stored?.opportunity_id, opp1Id);

  // Attempting to attach opp1Id to a different product must fail
  await assert.rejects(
    () =>
      createKitForAccount(
        contextA,
        {
          campaignId: campaign.campaignId,
          productId: "prod_opp_2",
          channel: "whatsapp_channel",
          reason: "Mismatch test",
          opportunityId: opp1Id,
          requestId: "req_kit_mismatch",
        },
        factory,
      ),
    /opportunity_product_mismatch/,
  );

  // Cross-tenant opportunity attachment must fail
  const contextB = ctx("opp_b");
  await assert.rejects(
    () =>
      createKitForAccount(
        contextB,
        {
          campaignId: campaign.campaignId,
          productId: "prod_opp_1",
          channel: "whatsapp_channel",
          reason: "Cross tenant test",
          opportunityId: opp1Id,
          requestId: "req_cross_tenant",
        },
        factory,
      ),
    /campaign_policy_required/,
  );
});

console.log(`\nALL ${passed} D07 INTEGRATION TESTS PASSED!`);
