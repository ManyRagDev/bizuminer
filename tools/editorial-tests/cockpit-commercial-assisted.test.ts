import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const {
  createCampaignForAccount,
  createKitForAccount,
  validateKitForAccount,
  approveKitForAccount,
  preparePublicationExport,
  markPublicationExported,
  confirmPublication,
  reviseKitForAccount,
} = require("../../packages/web/lib/commercial-workflow.ts");

const {
  determineCockpitNextAction,
} = require("../../packages/web/lib/cockpit-view-model.ts");

const {
  validateCommercialKitRevision,
  revalidateKitBeforeExport,
} = require("../../packages/web/lib/kit-validator.ts");

const {
  createOrUpdateOpportunity,
  createAudiencePolicy,
  createAudiencePolicyVersion,
} = require("../../packages/web/lib/opportunity-db.ts");

const { publicCampaignLink } = require("../../packages/web/lib/public-offer-db.ts");
const { publicLinkPage } = require("../../packages/web/lib/public-link-page.ts");
const { publicGo } = require("../../packages/web/lib/public-go.ts");
const { campaignExitPath } = require("../../packages/web/lib/campaign-exit.ts");
const { storyShareUrl, storyCaption, storyLinkLabel } = require("../../packages/web/lib/story-link.ts");

const { pg, factory } = await commercialFixture();

console.log("--- D08 COCKPIT, MATERIAIS, CAMPANHA E DIVULGAÇÃO ASSISTIDA TESTS ---");

const ctx = (t: string, user = `user_${t}`, role = "owner") => ({
  tenantId: t,
  affiliateId: `aff_${t}`,
  actor: "human" as const,
  actorAppUserId: user,
  authenticatedAuthUserId: `auth_${user}`,
  membershipRole: role,
  requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
});

const baseSql = factory();
async function asTenant<T>(tenantId: string, role = "owner", fn: (tx: any) => Promise<T>): Promise<T> {
  return baseSql.begin(async (tx: any) => {
    await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
    await tx`select set_config('garimpa.membership_role', ${role}, true)`;
    return fn(tx);
  });
}

// Seed accounts, users, products, publications and entitlements
await pg.exec(`
  insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name) values
    ('aff_d08_a', 'd08_a', 'alpha-d08', 'Tenant D08 Alpha'),
    ('aff_d08_b', 'd08_b', 'beta-d08', 'Tenant D08 Beta')
  on conflict do nothing;

  insert into garimpa.app_user(id, tenant_id, auth_user_id) values
    ('user_d08_a', 'd08_a', 'auth_user_d08_a'),
    ('user_d08_b', 'd08_b', 'auth_user_d08_b')
  on conflict do nothing;

  insert into garimpa.app_user_role(app_user_id, role) values
    ('user_d08_a', 'afiliado'),
    ('user_d08_b', 'afiliado')
  on conflict do nothing;

  insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values
    ('aff_d08_a', 'user_d08_a', 'owner'),
    ('aff_d08_b', 'user_d08_b', 'owner')
  on conflict do nothing;

  insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, last_price_cents, last_seen_at) values
    ('prod_d08_1', 'd08_a', 'mercadolivre', 'ext_d08_1', 'Panela de Pressão Elétrica Electrolux 6L', 'https://mercadolivre.com.br/item1', 34990, now()),
    ('prod_d08_2', 'd08_a', 'mercadolivre', 'ext_d08_2', 'Aspirador de Pó Vertical Oster 2 em 1', 'https://mercadolivre.com.br/item2', 17990, now()),
    ('prod_d08_b', 'd08_b', 'shopee', 'ext_d08_b', 'Smartwatch Fitness Tracker Pro', 'https://shopee.com.br/itemb', 12900, now())
  on conflict (id) do nothing;

  insert into garimpa.product_curation(product_id, tenant_id, status) values
    ('prod_d08_1', 'd08_a', 'approved'),
    ('prod_d08_2', 'd08_a', 'approved'),
    ('prod_d08_b', 'd08_b', 'approved')
  on conflict do nothing;

  insert into garimpa.publication(id, tenant_id, affiliate_id, product_id, channel, slug, status, affiliate_url) values
    ('pub_d08_1', 'd08_a', 'aff_d08_a', 'prod_d08_1', 'web', 'alpha-d08--ml-ext1', 'active', null),
    ('pub_d08_2', 'd08_a', 'aff_d08_a', 'prod_d08_2', 'web', 'alpha-d08--ml-ext2', 'active', null),
    ('pub_d08_b', 'd08_b', 'aff_d08_b', 'prod_d08_b', 'web', 'beta-d08--shp-extb', 'active', 'https://s.shopee.com.br/fixture-d08-b')
  on conflict do nothing;

  insert into garimpa.affiliate_marketplace_config(affiliate_id, marketplace, tracking_id, tool_id, status) values
    ('aff_d08_a', 'mercadolivre', 'tag_d08_a', 'tool_d08_a', 'active'),
    ('aff_d08_b', 'shopee', 'tag_d08_b', 'tool_d08_b', 'active')
  on conflict do nothing;

  insert into garimpa.account_entitlement(tenant_id, affiliate_id, plan_version, status, starts_at, limits, terms_ref) values
    ('d08_a', 'aff_d08_a', 'pilot-v1', 'active', '2026-01-01T00:00:00Z', '{"maxActiveCampaigns":10,"maxDailyKits":50,"allowedMarketplaces":["mercadolivre"]}'::jsonb, 'terms_pilot_v1'),
    ('d08_b', 'aff_d08_b', 'pilot-v1', 'active', '2026-01-01T00:00:00Z', '{"maxActiveCampaigns":10,"maxDailyKits":50,"allowedMarketplaces":["shopee"]}'::jsonb, 'terms_pilot_v1')
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
    ('obs_d08_1', 'd08_a', 'prod_d08_1', 34990, $1, now() - interval '1 hour'),
    ('obs_d08_2', 'd08_a', 'prod_d08_2', 17990, $1, now() - interval '1 hour'),
    ('obs_d08_b', 'd08_b', 'prod_d08_b', 12900, $1, now() - interval '1 hour')
   on conflict do nothing;`,
  [JSON.stringify(qualifiedEvidence)],
);

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

// 1. End-to-end Cockpit Journey: Oportunidade -> Campanha -> Kit -> Validação -> Aprovação -> Exportação -> Confirmação
let testKitId = "";
let testKitCode = "";
let testPubId = "";
let testCampaignId = "";

await test("end-to-end assisted campaign journey (draft -> validated -> approved -> exported -> confirmed)", async () => {
  const contextA = ctx("d08_a");

  // Step 1: Create active audience policy
  const pol = await asTenant("d08_a", "owner", (tx) =>
    createAudiencePolicy(tx, "d08_a", { name: "Público Casa & Cozinha D08", status: "draft" }),
  );
  const polVer = await asTenant("d08_a", "owner", (tx) =>
    createAudiencePolicyVersion(tx, "d08_a", {
      policyId: pol.id,
      version: "v1.0.0",
      config: { cooldownHours:24,schemaVersion: 1, audience: "casa", mode: "assisted", rubricStatus: "homologated" },
      approvedBy: "user_d08_a",
    }),
  );

  // Step 2: Create opportunity in Radar
  const opp = await asTenant("d08_a", "owner", (tx) =>
    createOrUpdateOpportunity(tx, "d08_a", {
      productId: "prod_d08_1",
      policyVersionId: polVer.id,
      audienceKey: "casa",
      channel: "whatsapp_channel",
      assessment: {
        schemaVersion: 2,
        rubricVersion: "2026-04-canonical",
        evidenceDigest: "dig_d08_opp",
        evaluator: "editorial_human",
        assessedAt: new Date().toISOString(),
        overallRecommendation: "publish",
        quality: { level: "strong", reason: "Excelente acabamento" },
        value: { level: "strong", reason: "Preço competitivo" },
        audience: { level: "strong", reason: "Público doméstico" },
        evidenceConfidence: { level: "strong", reason: "Evidência confirmada" },
        unknowns: [],
        safetyFlags: [],
      },
      priceEvidence: {
        ...qualifiedEvidence,
        currentPriceCents: 34990,
        validUntil: new Date(Date.now() + 24 * 3600000).toISOString(),
        unknowns: [],
      },
      humanPriority: { state: "prioritized", reason: "Seleção editorial" },
    }),
  );

  // Cockpit Action check: Prioritized opportunity with no kit -> create_draft
  const nextAction1 = determineCockpitNextAction({
    opportunityState: opp.state,
    evidenceLevel: "E2",
    hasKitDraft: false,
  });
  assert.equal(nextAction1.action, "create_draft");
  assert.equal(nextAction1.enabled, true);

  // Step 3: Create Campaign
  const campaign = await createCampaignForAccount(
    contextA,
    {
      name: "Campanha D08 Ofertas",
      objective: "Divulgação assistida",
      audience: "casa",
      requestId: "req_camp_d08",
    },
    factory,
  );
  assert.ok(campaign.campaignId);
  testCampaignId = campaign.campaignId;

  // Step 4: Create Kit referencing opportunityId
  const kit = await createKitForAccount(
    contextA,
    {
      campaignId: campaign.campaignId,
      productId: "prod_d08_1",
      channel: "whatsapp_channel",
      reason: "Panela de pressão elétrica em condição especial.",
      opportunityId: opp.id,
      requestId: "req_kit_d08",
    },
    factory,
  );
  assert.ok(kit.kitId);
  assert.ok(kit.code);
  testKitId = kit.kitId;
  testKitCode = kit.code;

  // Verify kit initial state: draft, not approved (no phantom approval)
  const [dbKit] = await asTenant("d08_a", "owner", (tx) =>
    tx<{ status: string; version: number }[]>`select status, version from garimpa.commercial_kit where id = ${kit.kitId}`,
  );
  assert.equal(dbKit.status, "draft");
  assert.equal(dbKit.version, kit.kitVersion);

  // Get publication
  const [dbPub] = await asTenant("d08_a", "owner", (tx) =>
    tx<{ id: string; status: string; version: number }[]>`
      select id, status, version from garimpa.campaign_publication where kit_id = ${kit.kitId}
    `,
  );
  assert.equal(dbPub.status, "planned");
  testPubId = dbPub.id;

  // Step 5: Validate Kit
  const val = await validateKitForAccount(
    contextA,
    { kitId: kit.kitId, expectedVersion: dbKit.version, requestId: "req_val_d08" },
    factory,
  );
  assert.equal(val.valid, true);

  // Verify kit status transitioned to validating
  const [dbKitVal] = await asTenant("d08_a", "owner", (tx) =>
    tx<{ status: string; version: number }[]>`select status, version from garimpa.commercial_kit where id = ${kit.kitId}`,
  );
  assert.equal(dbKitVal.status, "validating");
  assert.equal(dbKitVal.version, val.kitVersion);

  // Cockpit Action check: Validating kit -> approve
  const nextAction2 = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "validating",
  });
  assert.equal(nextAction2.action, "approve");
  assert.equal(nextAction2.enabled, true);

  // Step 6: Approve Kit
  const app = await approveKitForAccount(
    contextA,
    { kitId: kit.kitId, expectedVersion: dbKitVal.version, requestId: "req_app_d08" },
    factory,
  );
  assert.equal(app.kitVersion, dbKitVal.version + 1);

  // Publication must now be 'ready'
  const [dbPubReady] = await asTenant("d08_a", "owner", (tx) =>
    tx<{ status: string; version: number }[]>`select status, version from garimpa.campaign_publication where id = ${testPubId}`,
  );
  assert.equal(dbPubReady.status, "ready");

  // Cockpit Action check: Approved kit with ready publication -> export
  const nextAction3 = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "approved",
    publicationStatus: "ready",
  });
  assert.equal(nextAction3.action, "export");
  assert.equal(nextAction3.enabled, true);

  // Step 7: Prepare Export (revalidates facts & retrieves copy)
  const prepared = await preparePublicationExport(
    contextA,
    { publicationId: testPubId, expectedVersion: dbPubReady.version },
    factory,
  );
  assert.ok(prepared.text.includes(`/p/${testKitCode}`));

  // Step 8: Mark Exported
  const exported = await markPublicationExported(
    contextA,
    { publicationId: testPubId, expectedVersion: dbPubReady.version, requestId: "req_exp_d08" },
    factory,
  );
  assert.equal(exported.exported, true);
  assert.equal(exported.blockers.length, 0);

  // Cockpit Action check: Exported publication -> confirm
  const nextAction4 = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "approved",
    publicationStatus: "exported",
  });
  assert.equal(nextAction4.action, "confirm");
  assert.equal(nextAction4.enabled, true);

  // Step 9: Confirm Publication
  const confirmed = await confirmPublication(
    contextA,
    {
      publicationId: testPubId,
      expectedVersion: exported.publicationVersion,
      requestId: "req_conf_d08",
      publicationUrl: "https://chat.whatsapp.com/test-publication",
    },
    factory,
  );
  assert.equal(confirmed.status, "published_confirmed");

  // Cockpit Action check: Confirmed publication -> none ("Publicado e confirmado")
  const nextAction5 = determineCockpitNextAction({
    opportunityState: "prioritized",
    evidenceLevel: "E2",
    hasKitDraft: true,
    kitStatus: "approved",
    publicationStatus: "published_confirmed",
  });
  assert.equal(nextAction5.action, "none");
  assert.equal(nextAction5.enabled, false);
});

// 2. Concurrency Conflict (Two Tabs Protection)
await test("concurrent modification in two tabs produces conflict without corruption", async () => {
  const contextA = ctx("d08_a");

  // Create kit for prod_d08_2
  const kit2 = await createKitForAccount(
    contextA,
    {
      campaignId: testCampaignId,
      productId: "prod_d08_2",
      channel: "whatsapp_channel",
      reason: "Aspirador vertical versátil.",
      requestId: "req_kit_tab_concurrency",
    },
    factory,
  );

  // Tab 1 edits copy and advances version
  await reviseKitForAccount(
    contextA,
    {
      kitId: kit2.kitId,
      expectedVersion: kit2.kitVersion,
      copy: "Novo texto de revisão da aba 1.\n\nLink de afiliado · BizuMiner",
      requestId: "req_revise_tab1",
    },
    factory,
  );

  // Tab 2 tries to validate or approve using the STALE kitVersion
  await assert.rejects(
    () =>
      validateKitForAccount(
        contextA,
        {
          kitId: kit2.kitId,
          expectedVersion: kit2.kitVersion, // stale version
          requestId: "req_val_tab2_stale",
        },
        factory,
      ),
    /conflict/,
    "Stale expectedVersion from concurrent tab must be rejected with conflict",
  );
});

// 3. Revalidation & Material Price Drift
await test("price change between kit creation and export blocks export and invalidates approval", async () => {
  const snapshot = {
    productId: "prod_d08_1",
    title: "Panela de Pressão",
    priceCents: 34990,
    currency: "BRL",
    observedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 48 * 3600000).toISOString(),
    productUrl: "https://mercadolivre.com.br/item1",
    reasons: ["Preço estável"],
  };

  // Case A: Price unchanged -> canExport = true
  const check1 = revalidateKitBeforeExport({
    snapshot,
    currentObservedPriceCents: 34990,
    validationValidUntil: new Date(Date.now() + 10 * 3600000).toISOString(),
  });
  assert.equal(check1.canExport, true);

  // Case B: Price drifted from 34990 to 39990 -> canExport = false
  const checkDrift = revalidateKitBeforeExport({
    snapshot,
    currentObservedPriceCents: 39990,
    validationValidUntil: new Date(Date.now() + 10 * 3600000).toISOString(),
  });
  assert.equal(checkDrift.canExport, false);
  assert.ok(checkDrift.driftReasons.some((r) => r.includes("Preço variou")));

  // Case C: Validation expired -> canExport = false
  const checkExpired = revalidateKitBeforeExport({
    snapshot,
    currentObservedPriceCents: 34990,
    validationValidUntil: new Date(Date.now() - 3600000).toISOString(), // expired
  });
  assert.equal(checkExpired.canExport, false);
  assert.ok(checkExpired.driftReasons.some((r) => r.includes("expirou")));
});

// 4. Image Rights Guard (G-RIGHTS)
await test("G-RIGHTS blocks visual assets without authorization while allowing pure copy", async () => {
  const snapshot = {
    productId: "prod_1",
    title: "Produto de Teste",
    priceCents: 10000,
    currency: "BRL",
    observedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 48 * 3600000).toISOString(),
    productUrl: "https://loja.com/item",
    reasons: [],
  };

  // Channel with visual asset ref
  const visualMaterial = {
    channel: "instagram_stories",
    shortCopy: "Confira a novidade com entrega rápida.",
    cta: "Veja na loja",
    disclosure: "Link de parceiro BizuMiner",
    assetRefs: ["card_image_01.png"],
  };

  // Visual asset without rights authorization -> blocked
  const resForbidden = validateCommercialKitRevision({
    snapshot,
    claims: [],
    materials: [visualMaterial],
    evidenceLevel: "E1",
    imageRights: "unknown",
  });
  assert.equal(resForbidden.valid, false);
  assert.ok(resForbidden.blockers.some((b) => b.code === "MISSING_RIGHTS_FOR_ASSET"));

  // Visual asset with allowed rights -> approved
  const resAllowed = validateCommercialKitRevision({
    snapshot,
    claims: [],
    materials: [visualMaterial],
    evidenceLevel: "E1",
    imageRights: "allowed",
  });
  assert.equal(resAllowed.valid, true);

  // Pure copy material without visual asset -> approved even if imageRights is unknown
  const textMaterial = {
    channel: "whatsapp_channel",
    shortCopy: "Promoção confirmada no site oficial.",
    cta: "Acessar oferta",
    disclosure: "Link de afiliado",
    assetRefs: [],
  };
  const resText = validateCommercialKitRevision({
    snapshot,
    claims: [],
    materials: [textMaterial],
    evidenceLevel: "E1",
    imageRights: "unknown",
  });
  assert.equal(resText.valid, true, "Text copy without visual asset should be approved");
});

// 5. Forbidden Claims & Urgency Validation
await test("unsupported urgency and fake lowest price claims are blocked", () => {
  const snapshot = {
    productId: "prod_1",
    title: "Produto de Teste",
    priceCents: 10000,
    currency: "BRL",
    observedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 48 * 3600000).toISOString(),
    productUrl: "https://loja.com/item",
    reasons: [],
  };

  // Urgency words ("só hoje", "últimas unidades") -> blocked
  const urgencyMaterial = {
    channel: "whatsapp_channel",
    shortCopy: "Corre que é só hoje! Últimas unidades disponíveis.",
    cta: "Comprar",
    disclosure: "Link de parceiro",
    assetRefs: [],
  };
  const resUrgency = validateCommercialKitRevision({
    snapshot,
    claims: [],
    materials: [urgencyMaterial],
    evidenceLevel: "E1",
  });
  assert.equal(resUrgency.valid, false);
  assert.ok(resUrgency.blockers.some((b) => b.code === "UNSUPPORTED_URGENCY_CLAIM"));

  // Lowest price without E3 -> blocked
  const lowestPriceMaterial = {
    channel: "whatsapp_channel",
    shortCopy: "Menor preço histórico garantido!",
    cta: "Comprar",
    disclosure: "Link de parceiro",
    assetRefs: [],
  };
  const resLowest = validateCommercialKitRevision({
    snapshot,
    claims: [],
    materials: [lowestPriceMaterial],
    evidenceLevel: "E2", // E2 is not E3
  });
  assert.equal(resLowest.valid, false);
  assert.ok(resLowest.blockers.some((b) => b.code === "UNSUPPORTED_PRICE_CLAIM"));
});

// 6. Tracking Parameter 'c' and Attribution Integrity
await test("campaign code parameter 'c' preserves identity and records attributed click", async () => {
  // 1. Exit path keeps 'c'
  const exitPath = campaignExitPath("alpha-d08--ml-ext1", testKitCode);
  assert.equal(exitPath, `/go/alpha-d08--ml-ext1?c=${testKitCode}`);

  // 2. Resolve link code
  const resolved = await publicCampaignLink(testKitCode, "alpha-d08--ml-ext1", factory);
  assert.equal(resolved.slug, "alpha-d08--ml-ext1");

  // 3. Short page /p/<code> 302 redirects to /bizu/<slug>?c=<code>
  const page = await publicLinkPage(testKitCode, factory);
  assert.equal(page.status, 302);
  const locationUrl = new URL(page.headers.get("location"), "https://bizuminer.com.br");
  assert.equal(locationUrl.pathname, "/bizu/alpha-d08--ml-ext1");
  assert.equal(locationUrl.searchParams.get("c"), testKitCode);

  // 4. Human click through /go with 'c' redirects to affiliate URL and records attributed click
  const reqHuman = new Request(`https://bizuminer.com.br/go/alpha-d08--ml-ext1?c=${testKitCode}`, {
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  const clickRes = await publicGo(reqHuman, "alpha-d08--ml-ext1", testKitCode, factory);
  assert.equal(clickRes.status, 302);
  assert.ok(clickRes.headers.get("location").includes("tag_d08_a"));

  // Verify click_event recorded in database with campaign_publication_id
  const clicks = await asTenant("d08_a", "owner", (tx) =>
    tx<{ campaign_publication_id: string; tenant_id: string }[]>`
      select campaign_publication_id, tenant_id
      from garimpa.click_event
      where tenant_id = 'd08_a' and campaign_publication_id = ${testPubId}
    `,
  );
  assert.ok(clicks.length >= 1);
  assert.equal(clicks[0].tenant_id, "d08_a");

  // 5. Bot preview (e.g. WhatsApp/Facebook bot) skips telemetry
  const clickCountBefore = (await asTenant("d08_a", "owner", (tx) =>
    tx<{ count: number }[]>`select count(*)::int as count from garimpa.click_event where tenant_id = 'd08_a'`,
  ))[0].count;

  const reqBot = new Request(`https://bizuminer.com.br/go/alpha-d08--ml-ext1?c=${testKitCode}`, {
    headers: { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
  });
  const botRes = await publicGo(reqBot, "alpha-d08--ml-ext1", testKitCode, factory);
  assert.equal(botRes.status, 302);

  const clickCountAfter = (await asTenant("d08_a", "owner", (tx) =>
    tx<{ count: number }[]>`select count(*)::int as count from garimpa.click_event where tenant_id = 'd08_a'`,
  ))[0].count;
  assert.equal(clickCountAfter, clickCountBefore, "Preview bots must not register click telemetry");

  // 6. Token of product A passed to product B fails closed (404) and never switches owner
  const reqMismatch = new Request(`https://bizuminer.com.br/go/beta-d08--shp-extb?c=${testKitCode}`);
  const mismatchRes = await publicGo(reqMismatch, "beta-d08--shp-extb", testKitCode, factory);
  assert.equal(mismatchRes.status, 404);
});

// 7. S-KIT Story Link and Formats
await test("storyShareUrl, storyCaption and storyLinkLabel format correctly", async () => {
  const shortUrl = await storyShareUrl("alpha-d08--ml-ext1", testKitCode);
  assert.ok(shortUrl.includes(`/p/${testKitCode}`));
  assert.ok(!shortUrl.startsWith("https://"), "Story URL label is naked domain to save characters");

  const caption = await storyCaption("alpha-d08--ml-ext1", testKitCode);
  assert.ok(caption.includes("acabou rápido →"));
  assert.ok(caption.includes(shortUrl));

  const linkLabel = storyLinkLabel();
  assert.ok(linkLabel.length > 0);
  assert.ok(!linkLabel.startsWith("https://"));
});

console.log(`\nALL ${passed} D08 INTEGRATION TESTS PASSED!`);
