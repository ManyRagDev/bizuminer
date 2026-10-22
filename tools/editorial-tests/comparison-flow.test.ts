import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);

// Persistence modules
const { familyInfoForTitle, PRODUCT_FAMILIES } = require("../../packages/persistence/src/product-family.ts");
const { backfillFamilies } = require("../../packages/persistence/src/catalog-maintenance.ts");

// Web modules
const {
  resolveVariantEvidence,
  ratingConfidenceScore,
  compareReviewEvidence,
  explainEvidenceComparison,
  hasSuperiorityClaim,
  validateComparativeBasis,
} = require("../../packages/web/lib/comparison-evidence.ts");
const {
  editorialGroupIdFor,
  matchesEditorialGroup,
  selectRepresentatives,
} = require("../../packages/web/lib/editorial-groups.ts");
const {
  processIngestionPipeline,
} = require("../../packages/web/lib/curation-pipeline.ts");
const {
  validateGroupAction,
} = require("../../packages/web/lib/curation-contract.ts");
const {
  buildSnapshotMetadata,
  CURATION_SNAPSHOT_VERSION,
} = require("../../packages/web/lib/curation-snapshot.ts");
const {
  curationGroupCards,
  groupMembers,
  actOnGroup,
  reviewProduct,
} = require("../../packages/web/lib/curation-db.ts");
const {
  EDITORIAL_DIMENSIONS,
  CATALOG_EVIDENCE_POLICY_VERSION,
  editorialEvidenceFingerprint,
  validateEditorialAssessment,
  editorialSelectionBlockers,
  publishedEditorialStateKey,
} = require("../../packages/web/lib/editorial-selection.ts");
const {
  saveEditorialAssessment,
  replaceEditorialSelection,
  getPublishedEditorialSelection,
} = require("../../packages/web/lib/editorial-selection-db.ts");

const { pg, applied, factory, adminFactory } = await commercialFixture();
const migrationSql = await readFile(new URL("../../packages/persistence/supabase/migrations/20261020002440_garimpa_comparative_evidence_event.sql", import.meta.url), "utf8");
await pg.exec(migrationSql);

let passed = 0;
async function test(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${label}`);
  } catch (err) {
    console.error(`FAIL ${label}`, err);
    throw err;
  }
}

process.env.DATABASE_URL = "postgresql://isolated-fixture-unused";

// Setup accounts: tenant a and tenant b
await pg.exec(`
  insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name, status)
  values ('aff_a', 'a', 'alpha', 'Alpha', 'active'),
         ('aff_b', 'b', 'beta', 'Beta', 'active')
  on conflict do nothing;

  insert into garimpa.app_user(id, tenant_id, auth_user_id)
  values ('user_a', 'a', 'auth_a'),
         ('user_b', 'b', 'auth_b')
  on conflict do nothing;

  insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role)
  values ('aff_a', 'user_a', 'owner'),
         ('aff_b', 'user_b', 'owner')
  on conflict do nothing;

  insert into garimpa.app_user_role(app_user_id, role)
  values ('user_a', 'afiliado'),
         ('user_b', 'afiliado')
  on conflict do nothing;
`);

// ============================================================================
// AC-028.1: Família cafeteiras, identidade de variantes e recaptura de anúncio
// ============================================================================
await test("AC-028.1: cafeteiras agrupam na mesma família mantendo IDs, lojas e configurações separados", async () => {
  const title1 = "Cafeteira Expresso Oster Prima Latte II Vermelha 110V";
  const title2 = "Cafeteira Elétrica Três Corações Lov Preta 220V";

  const fam1 = familyInfoForTitle(title1);
  const fam2 = familyInfoForTitle(title2);

  assert.ok(fam1, "fam1 deve ser classificada");
  assert.ok(fam2, "fam2 deve ser classificada");
  assert.equal(fam1.key, "cafeteiras");
  assert.equal(fam2.key, "cafeteiras");
  assert.equal(fam1.version, "v2", "cafeteiras deve usar regra v2");
  assert.equal(fam2.version, "v2");
  assert.equal(fam1.method, "title-keywords");

  const groupId1 = editorialGroupIdFor("a", fam1.key, fam1.method, fam1.version);
  const groupId2 = editorialGroupIdFor("a", fam2.key, fam2.method, fam2.version);
  assert.equal(groupId1, groupId2, "mesmo grupo editorial");
  assert.ok(matchesEditorialGroup(groupId1, "a", fam1));

  // Variante sem origem/evidência é marcada como não confirmada
  const unconfirmedVariant = resolveVariantEvidence({
    externalId: "MLB-101",
    title: title1,
    offerEvidence: { version: 1, packageQuantity: 1 },
  });
  assert.equal(unconfirmedVariant.confirmed, false);
  assert.equal(unconfirmedVariant.description, "não confirmada");

  // Variante com fonte sustentada
  const confirmedVariant = resolveVariantEvidence({
    externalId: "SHP-202",
    title: title2,
    offerEvidence: {
      version: 2,
      variantKey: "preta-220v",
      variantLabel: "Preta 220V",
      source: {
        marketplace: "shopee",
        method: "api",
        url: "https://shopee.com.br/item-202",
        capturedAt: new Date().toISOString(),
      },
    },
  });
  assert.equal(confirmedVariant.confirmed, true);
  assert.equal(confirmedVariant.variantLabel, "Preta 220V");
  assert.equal(confirmedVariant.variantKey, "preta-220v");

  // Persistência com IDs e lojas separados
  await pg.exec(`
    insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, last_price_cents, family_key, family_label, family_method, family_version)
    values
      ('caf_1', 'a', 'mercadolivre', 'MLB-101', '${title1}', 'https://mercadolivre.com.br/item-101', 89900, 'cafeteiras', 'Cafeteiras', 'title-keywords', 'v2'),
      ('caf_2', 'a', 'shopee', 'SHP-202', '${title2}', 'https://shopee.com.br/item-202', 34900, 'cafeteiras', 'Cafeteiras', 'title-keywords', 'v2')
    on conflict (id) do nothing;

    insert into garimpa.product_curation(tenant_id, product_id, status)
    values
      ('a', 'caf_1', 'pending'),
      ('a', 'caf_2', 'pending')
    on conflict (tenant_id, product_id) do nothing;
  `);

  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values
      ('obs_caf_1_v1', 'a', 'caf_1', 89900, now() - interval '10 hours', $1),
      ('obs_caf_2_v1', 'a', 'caf_2', 34900, now() - interval '5 hours', $2)
    on conflict (id) do nothing;
  `, [
    JSON.stringify({ version: 1, packageQuantity: 1 }),
    JSON.stringify({ version: 2, variantKey: "preta-220v", variantLabel: "Preta 220V", source: { marketplace: "shopee", method: "api", url: "https://shopee.com.br/item-202", capturedAt: new Date().toISOString() } }),
  ]);

  // Recaptura do mesmo anúncio caf_1 atualiza evidência sem criar modelo novo
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values
      ('obs_caf_1_v2', 'a', 'caf_1', 84900, now(), $1);
  `, [
    JSON.stringify({
      version: 2,
      variantKey: "vermelha-110v",
      variantLabel: "Vermelha 110V",
      source: {
        marketplace: "mercadolivre",
        method: "api",
        url: "https://mercadolivre.com.br/item-101",
        capturedAt: new Date().toISOString(),
      },
    }),
  ]);
  await pg.exec("update garimpa.product set last_price_cents = 84900 where id = 'caf_1' and tenant_id = 'a'");

  const pRows = (await pg.query("select id from garimpa.product where tenant_id='a' and id in ('caf_1', 'caf_2')")).rows;
  assert.equal(pRows.length, 2, "recaptura não duplica produto");

  const cards = await curationGroupCards(10, "a", adminFactory);
  const cafCard = cards.find((c: any) => c.familyKey === "cafeteiras");
  assert.ok(cafCard, "card de cafeteiras encontrado");
  assert.equal(cafCard.totalCount, 2);
  assert.equal(cafCard.representatives.length, 2);

  const rep1 = cafCard.representatives.find((r: any) => r.id === "caf_1");
  const rep2 = cafCard.representatives.find((r: any) => r.id === "caf_2");
  assert.equal(rep1.marketplace, "mercadolivre");
  assert.equal(rep2.marketplace, "shopee");
  assert.equal(rep1.priceCents, 84900, "recaptura atualizou preço");
  assert.equal(rep1.variant.confirmed, true, "nova observação confirmou variante");
});

// ============================================================================
// AC-028.2: Robustez da amostra vs popularidade sem alegação de 'melhor'
// ============================================================================
await test("AC-028.2: 4,6★/1500 avaliações priorizado para exame frente a 4,9★/8 avaliações no mesmo marketplace", async () => {
  const nowIso = new Date().toISOString();
  const candSmall = {
    id: "cand_small",
    marketplace: "mercadolivre",
    ratingStar: 4.9,
    reviewCount: 8,
    salesCount: 2,
    evidenceObservedAt: nowIso,
  };

  const candRobust = {
    id: "cand_robust",
    marketplace: "mercadolivre",
    ratingStar: 4.6,
    reviewCount: 1500,
    salesCount: 500,
    evidenceObservedAt: nowIso,
  };

  const scoreSmall = ratingConfidenceScore(4.9, 8);
  const scoreRobust = ratingConfidenceScore(4.6, 1500);
  assert.ok(scoreRobust > scoreSmall, "amostra robusta deve ter maior confiança que amostra minúscula");

  // compareReviewEvidence: positivo significa b precede a
  const diff = compareReviewEvidence(candSmall, candRobust);
  assert.ok(diff > 0, "candRobust deve preceder candSmall para revisão");

  const explanation = explainEvidenceComparison(candSmall, candRobust);
  assert.equal(explanation.prioritizedId, "cand_robust");
  assert.equal(explanation.isClaimOfBest, false, "não é alegação de melhor");
  assert.ok(explanation.reasons.some((r: string) => r.includes("amostra robusta")), "explicação deve citar robustez da amostra");
  assert.equal(hasSuperiorityClaim(explanation.reasons.join(" ")), false, "explicação técnica não pode conter alegação de 'melhor'");

  // Casos conservadores reproduzíveis:
  // 1. Ausência de reviewCount
  const candNoReviews = { ...candSmall, reviewCount: null };
  const expNoReviews = explainEvidenceComparison(candNoReviews, candRobust);
  assert.ok(expNoReviews.reasons.some((r: string) => r.includes("amostra de avaliações desconhecida")), "explicação conservadora para ausência de reviewCount");

  // 2. Lojas distintas (não compara amostra de avaliações entre lojas como precedência de qualidade)
  const candCrossStore = { ...candSmall, id: "item_a", marketplace: "shopee" };
  const candRobustB = { ...candRobust, id: "item_b" };
  const diffCrossStore = compareReviewEvidence(candCrossStore, candRobustB);
  assert.ok(diffCrossStore < 0, "marketplaces distintos não aplicam precedência estatística de notas e caem em desempate neutro de id");
  const expCrossStore = explainEvidenceComparison(candCrossStore, candRobust);
  assert.ok(expCrossStore.reasons.some((r: string) => r.includes("distintos")), "explicação cita lojas distintas");

  // 3. Nota abaixo do piso (ex.: 3.2★)
  const candLowRating = { ...candRobust, ratingStar: 3.2 };
  const scoreLow = ratingConfidenceScore(3.2, 5000);
  assert.ok(scoreLow < scoreSmall, "nota abaixo do piso não supera nota alta mesmo com muitas avaliações");
});

// ============================================================================
// AC-028.3: Saturação de família, limites de cards e ação humana com justificativa
// ============================================================================
await test("AC-028.3: quarta cafeteira permanece pending sem family_saturation por posição; retenção exige justificativa", async () => {
  // 4 cafeteiras no pipeline com maxRepresentatives: 3
  const candidates = [
    { id: "c1", title: "Cafeteira 1", priceCents: 10000, marketplace: "mercadolivre", externalId: "1", productUrl: "http://1", familyKey: "cafeteiras" },
    { id: "c2", title: "Cafeteira 2", priceCents: 12000, marketplace: "mercadolivre", externalId: "2", productUrl: "http://2", familyKey: "cafeteiras" },
    { id: "c3", title: "Cafeteira 3", priceCents: 14000, marketplace: "mercadolivre", externalId: "3", productUrl: "http://3", familyKey: "cafeteiras" },
    { id: "c4", title: "Cafeteira 4", priceCents: 16000, marketplace: "mercadolivre", externalId: "4", productUrl: "http://4", familyKey: "cafeteiras" },
  ];

  const decisions = await processIngestionPipeline(candidates as any, { maxRepresentatives: 3 });
  const c4Decision = decisions.find((d: any) => d.productId === "c4");
  assert.ok(c4Decision, "c4 deve estar na saída como pendente");
  assert.equal(c4Decision.status, "pending", "4ª cafeteira permanece pendente para exame humano");
  assert.equal(c4Decision.reasonCode, null, "sem family_saturation por posição");
  assert.equal(decisions.filter((d: any) => d.reasonCode === "family_saturation").length, 0, "nenhuma decisão automática de family_saturation por posição");

  // Ação humana em grupo: validação de justificativa editorial para saturação
  const canonicalCafGroupId = editorialGroupIdFor("a", "cafeteiras", "title-keywords", "v2");
  const actionWithInvalidJustification = {
    groupId: canonicalCafGroupId,
    action: "approve" as const,
    selectedProductIds: ["caf_1"],
    retainRemainingAsSaturation: true,
    saturationJustification: "x",
  };
  const validationFail = validateGroupAction(actionWithInvalidJustification);
  assert.equal(validationFail.ok, false);
  if (!validationFail.ok) {
    assert.equal(validationFail.error, "saturation_justification_invalid");
  }

  // AC-035.1 / BUG-019: validação estrita de expectedMemberProductIds na chamada direta de validateGroupAction
  // 1. Ausente
  assert.equal(
    validateGroupAction({
      groupId: canonicalCafGroupId,
      action: "approve",
      selectedProductIds: ["caf_1"],
      retainRemainingAsSaturation: true,
      saturationJustification: "Justificativa editorial válida",
    }).error,
    "expected_members_required"
  );
  // 2. Vazio
  assert.equal(
    validateGroupAction({
      groupId: canonicalCafGroupId,
      action: "approve",
      selectedProductIds: ["caf_1"],
      retainRemainingAsSaturation: true,
      saturationJustification: "Justificativa editorial válida",
      expectedMemberProductIds: [],
    }).error,
    "expected_members_required"
  );
  // 3. Com duplicata
  assert.equal(
    validateGroupAction({
      groupId: canonicalCafGroupId,
      action: "approve",
      selectedProductIds: ["caf_1"],
      retainRemainingAsSaturation: true,
      saturationJustification: "Justificativa editorial válida",
      expectedMemberProductIds: ["caf_1", "caf_2", "caf_1"],
    }).error,
    "bulk_duplicate_product"
  );
  // 4. Omitindo produto selecionado
  assert.equal(
    validateGroupAction({
      groupId: canonicalCafGroupId,
      action: "approve",
      selectedProductIds: ["caf_1"],
      retainRemainingAsSaturation: true,
      saturationJustification: "Justificativa editorial válida",
      expectedMemberProductIds: ["caf_2"],
    }).error,
    "expected_members_must_include_selected"
  );

  // Com justificativa editorial válida e lista de membros completa
  const actionWithJustification = {
    groupId: canonicalCafGroupId,
    action: "approve" as const,
    selectedProductIds: ["caf_1"],
    retainRemainingAsSaturation: true,
    saturationJustification: "Excedente de catálogo para o nicho de cafeteiras",
    expectedMemberProductIds: ["caf_1", "caf_2"],
  };
  const validationOk = validateGroupAction(actionWithJustification);
  assert.equal(validationOk.ok, true);
  if (validationOk.ok) {
    assert.equal(validationOk.value.saturationJustification, "Excedente de catálogo para o nicho de cafeteiras");
  }

  // AC-035.3 / BUG-019: actOnGroup com objeto fabricado sem expectedMemberProductIds falha
  const missingMembersDirectAction = {
    ...validationOk.value,
    expectedMemberProductIds: null,
  };
  await assert.rejects(
    async () => actOnGroup(missingMembersDirectAction as any, "user_a", "a", adminFactory),
    (err: any) => err.message === "curation_group_members_changed"
  );

  // AC-035.3 / BUG-019: actOnGroup com membros divergentes/obsoletos entre conferência e confirmação falha
  const staleMembersAction = {
    ...validationOk.value,
    expectedMemberProductIds: ["caf_1"], // caf_2 está faltando
  };
  await assert.rejects(
    async () => actOnGroup(staleMembersAction as any, "user_a", "a", adminFactory),
    (err: any) => err.message === "curation_group_members_changed"
  );

  // Executar actOnGroup no banco e verificar snapshot v2
  const groupActionResult = await actOnGroup(validationOk.value, "user_a", "a", adminFactory);
  assert.ok(groupActionResult.results.length >= 2, "deve decidir selecionado e retidos");

  const heldEvent = (await pg.query(`
    select metadata from garimpa.curation_event
    where tenant_id = 'a' and product_id = 'caf_2'
    order by id desc limit 1
  `)).rows[0];

  assert.ok(heldEvent, "evento de curadoria gravado");
  assert.equal(heldEvent.metadata.snapshot_version, 2, "snapshot deve estar na versão 2");
  assert.ok("reviewCount" in heldEvent.metadata.snapshot, "snapshot v2 deve ter reviewCount");
  assert.ok("variant" in heldEvent.metadata.snapshot, "snapshot v2 deve ter variant");
  assert.ok("offerEvidenceSource" in heldEvent.metadata.snapshot, "snapshot v2 deve ter offerEvidenceSource");
});

// ============================================================================
// AC-028.4: Regra nova de família (v2) e ensaio dry-run de backfill multi-tenant
// ============================================================================
await test("AC-028.4: regra v2 com método explícito e backfillFamilies(apply=false) com applied=0 em duas contas", async () => {
  const cafInfo = familyInfoForTitle("Cafeteira Expresso Philco 20 Bar Inox");
  assert.ok(cafInfo);
  assert.equal(cafInfo.version, "v2");
  assert.equal(cafInfo.method, "title-keywords");

  // Regras legadas preservam v1
  const panelaInfo = familyInfoForTitle("Panela de Pressão Inox 4L");
  assert.ok(panelaInfo);
  assert.equal(panelaInfo.version, "v1");
  assert.equal(panelaInfo.key, "cozinha");

  // Inserir produtos não classificados (family_key null) em tenant a e tenant b
  await pg.exec(`
    insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, last_price_cents, family_key)
    values
      ('backfill_a1', 'a', 'mercadolivre', 'ML-BA1', 'Cafeteira Italiana Moka 6 Xícaras', 'http://a1', 8000, null),
      ('backfill_b1', 'b', 'shopee', 'SHP-BB1', 'Cafeteira Prensa Francesa 600ml', 'http://b1', 6000, null)
    on conflict (id) do nothing;
  `);

  // Ensaio de backfill em tenant a com apply=false
  const previewA = await backfillFamilies(adminFactory(), "a", false);
  assert.equal(previewA.mode, "dry-run");
  assert.equal(previewA.tenantId, "a");
  assert.equal(previewA.applied, 0, "apply=false não aplica nada");
  assert.ok(previewA.wouldClassify >= 1);
  assert.equal(previewA.families["cafeteiras"], 1);

  // Verificar que tenant a continua com family_key nulo no banco
  const pA = (await pg.query("select family_key from garimpa.product where id='backfill_a1'")).rows[0];
  assert.equal(pA.family_key, null, "produto de a não foi modificado");

  // Ensaio de backfill em tenant b com apply=false
  const previewB = await backfillFamilies(adminFactory(), "b", false);
  assert.equal(previewB.mode, "dry-run");
  assert.equal(previewB.tenantId, "b");
  assert.equal(previewB.applied, 0);
  assert.ok(previewB.wouldClassify >= 1);

  // Verificar que tenant b continua com family_key nulo no banco
  const pB = (await pg.query("select family_key from garimpa.product where id='backfill_b1'")).rows[0];
  assert.equal(pB.family_key, null, "produto de b não foi modificado");

  // Sem contaminação cruzada
  const unclassifiedCount = (await pg.query("select count(*)::int as n from garimpa.product where id in ('backfill_a1', 'backfill_b1') and family_key is not null")).rows[0].n;
  assert.equal(unclassifiedCount, 0, "nenhum produto do ensaio foi classificado no banco");
});

// ============================================================================
// AC-028.5: Base comparativa estruturada, isolamento e validação de superioridade
// ============================================================================
await test("AC-028.5: alegação de superioridade sem base falha; base comparativa estruturada passa e valida expiração/conta", async () => {
  // Setup de produtos aprovados em tenant a e tenant b
  await pg.exec(`
    insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, image_url, last_price_cents, category)
    values
      ('best_a', 'a', 'mercadolivre', 'MLA-BEST', 'Cafeteira Expresso Oster Prima Latte', 'http://best-a', 'https://images.test/best-a.jpg', 89900, 'cafeteiras'),
      ('alt_a', 'a', 'mercadolivre', 'MLA-ALT', 'Cafeteira Philco 20 Bar', 'http://alt-a', 'https://images.test/alt-a.jpg', 49900, 'cafeteiras'),
      ('alt_b', 'b', 'shopee', 'SHP-ALTB', 'Cafeteira Britânia 15 Bar', 'http://alt-b', 'https://images.test/alt-b.jpg', 39900, 'cafeteiras')
    on conflict (id) do update set image_url = excluded.image_url;

    insert into garimpa.product_curation(tenant_id, product_id, status)
    values
      ('a', 'best_a', 'approved'),
      ('a', 'alt_a', 'approved'),
      ('b', 'alt_b', 'approved')
    on conflict (tenant_id, product_id) do nothing;
  `);

  const evidenceBest = {
    version: 2,
    variantKey: "110v",
    packageQuantity: 1,
    source: { marketplace: "mercadolivre", method: "api", url: "http://best-a", capturedAt: new Date().toISOString() },
  };

  const evidenceAlt = {
    version: 2,
    variantKey: "110v",
    packageQuantity: 1,
    source: { marketplace: "mercadolivre", method: "api", url: "http://alt-a", capturedAt: new Date().toISOString() },
  };

  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values
      ('obs_best_a', 'a', 'best_a', 89900, now(), $1),
      ('obs_alt_a', 'a', 'alt_a', 49900, now(), $2),
      ('obs_alt_b', 'b', 'alt_b', 39900, now(), $2)
    on conflict (id) do update set observed_at = now(), offer_evidence = excluded.offer_evidence;
  `, [JSON.stringify(evidenceBest), JSON.stringify(evidenceAlt)]);

  const prodBestObj = {
    title: "Cafeteira Expresso Oster Prima Latte",
    productUrl: "http://best-a",
    imageUrl: "https://images.test/best-a.jpg",
    category: "cafeteiras",
    offerEvidence: evidenceBest,
  };

  const baseAssessmentInput = {
    productId: "best_a",
    evidenceFingerprint: editorialEvidenceFingerprint(prodBestObj),
    dimensions: Object.fromEntries(EDITORIAL_DIMENSIONS.map(({ id }: { id: string }) => [id, { level: "adequate", reason: "Conferido pelo editor." }])),
    audience: "Amantes de café expresso",
    benefit: "Prepara café com pó, sachê e cápsula",
    purchaseContents: "Uma cafeteira e acessórios",
    maxPriceCents: 95000,
    criticalDoubts: [],
  };

  // 1. Alegação de superioridade sem comparativeBasis -> falha
  const claimWithoutBasis = {
    ...baseAssessmentInput,
    publicRationale: "A melhor cafeteira expresso do mercado nacional.",
  };
  const res1 = await saveEditorialAssessment(claimWithoutBasis as any, "user_a", "a", adminFactory);
  assert.equal(res1.ok, false);
  if (!res1.ok) assert.equal(res1.error, "superiority_claim_requires_comparative_basis");

  // 2. Alegação com comparativeBasis mas sem alternativas -> falha
  const claimEmptyAlternatives = {
    ...baseAssessmentInput,
    publicRationale: "A melhor cafeteira expresso do mercado nacional.",
    comparativeBasis: {
      candidateProductId: "best_a",
      checkedAt: new Date().toISOString(),
      alternativeProductIds: [],
      usageScope: "cafeteiras de espresso doméstico",
      criteria: ["pressão de bomba"],
      rationale: "Comparativo geral",
    },
  };
  const res2 = await saveEditorialAssessment(claimEmptyAlternatives as any, "user_a", "a", adminFactory);
  assert.equal(res2.ok, false);
  if (!res2.ok) assert.equal(res2.error, "comparative_basis_alternatives_required");

  // 3. Alegação com alternativa pertencente a outra conta (tenant b) -> falha
  const claimCrossTenant = {
    ...baseAssessmentInput,
    publicRationale: "A melhor cafeteira expresso do mercado nacional.",
    comparativeBasis: {
      candidateProductId: "best_a",
      checkedAt: new Date().toISOString(),
      alternativeProductIds: ["alt_b"],
      usageScope: "cafeteiras de espresso doméstico",
      criteria: ["pressão de bomba"],
      rationale: "Comparada com alternativa de outra conta",
    },
  };
  const res3 = await saveEditorialAssessment(claimCrossTenant as any, "user_a", "a", adminFactory);
  assert.equal(res3.ok, false);
  if (!res3.ok) assert.equal(res3.error, "comparative_basis_alternative_not_found");

  // 4. Alegação com alternativa cuja observação está vencida (> 48h) -> falha
  await pg.exec("update garimpa.price_observation set observed_at = now() - interval '50 hours' where id = 'obs_alt_a'");
  const claimStale = {
    ...baseAssessmentInput,
    publicRationale: "A melhor cafeteira expresso do mercado nacional.",
    comparativeBasis: {
      candidateProductId: "best_a",
      checkedAt: new Date().toISOString(),
      alternativeProductIds: ["alt_a"],
      usageScope: "cafeteiras de espresso doméstico",
      criteria: ["pressão de bomba"],
      rationale: "Comparada com Philco 20 Bar",
    },
  };
  const res4 = await saveEditorialAssessment(claimStale as any, "user_a", "a", adminFactory);
  assert.equal(res4.ok, false);
  if (!res4.ok) assert.equal(res4.error, "comparative_basis_alternative_expired");

  // Restaurar observação recente de alt_a
  await pg.exec("update garimpa.price_observation set observed_at = now() where id = 'obs_alt_a'");

  // 5. Comparação estruturada com alternativa válida da mesma conta, observação recente e justificativa -> passa
  const claimValid = {
    ...baseAssessmentInput,
    publicRationale: "A melhor cafeteira expresso custo-benefício na faixa até R$ 900.",
    comparativeBasis: {
      candidateProductId: "best_a",
      checkedAt: new Date().toISOString(),
      alternativeProductIds: ["alt_a"],
      usageScope: "cafeteiras de espresso doméstico",
      priceRange: { minCents: 40000, maxCents: 95000 },
      criteria: ["pressão de bomba 19 bar", "vaporizador de leite"],
      rationale: "Comparada com a Philco 20 Bar na faixa até R$ 900 para café moído e sachê.",
    },
  };
  const res5 = await saveEditorialAssessment(claimValid as any, "user_a", "a", adminFactory);
  assert.equal(res5.ok, true, JSON.stringify(res5));
  if (!res5.ok) throw new Error("esperado sucesso");
  const assessment = res5.assessment;
  assert.ok(assessment.comparativeBasis);
  assert.equal(assessment.comparativeBasis.alternativeProductIds[0], "alt_a");
  assert.ok(assessment.comparativeBasis.evidenceReferences);
  assert.ok(assessment.comparativeBasis.evidenceReferences.best_a);
  assert.ok(assessment.comparativeBasis.evidenceReferences.alt_a);

  // 6. Ativação via replaceEditorialSelection
  // Sucesso com assessment que contém base comparativa
  const activateOk = await replaceEditorialSelection({
    expectedVersion: null,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "best_a", assessmentId: assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateOk.ok, true, JSON.stringify(activateOk));

  // Bloqueio de ativação se contexto editorial introduzir alegação de superioridade sem base
  // Salvar avaliação puramente descritiva para alt_a
  const prodAltObj = {
    title: "Cafeteira Philco 20 Bar",
    productUrl: "http://alt-a",
    imageUrl: "https://images.test/alt-a.jpg",
    category: "cafeteiras",
    offerEvidence: evidenceAlt,
  };
  const descriptiveAssessment = {
    ...baseAssessmentInput,
    productId: "alt_a",
    evidenceFingerprint: editorialEvidenceFingerprint(prodAltObj),
    publicRationale: "Cafeteira com bomba de 19 bar e reservatório para leite.",
  };
  const resDesc = await saveEditorialAssessment(descriptiveAssessment as any, "user_a", "a", adminFactory);
  assert.equal(resDesc.ok, true);
  if (!resDesc.ok) throw new Error("esperado sucesso descritivo");

  const activateWithContextClaimBlocked = await replaceEditorialSelection({
    expectedVersion: activateOk.selection.version,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{
      productId: "alt_a",
      assessmentId: resDesc.assessment.id,
      destinations: ["home"],
      context: "A melhor escolha indiscutível da categoria.", // Alegação no context sem comparativeBasis no assessment
    }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateWithContextClaimBlocked.ok, false);
  if (!activateWithContextClaimBlocked.ok) {
    assert.equal(activateWithContextClaimBlocked.error, "selection_item_blocked");
  }

  // 7. Leitura pública via getPublishedEditorialSelection omite item se a base vencer
  // A seleção ativa atual (activateOk) tem best_a com base comparativa válida
  const pubFresh = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubFresh.products.length, 1);
  assert.equal(pubFresh.products[0].id, "best_a");
  const keyFresh = publishedEditorialStateKey(pubFresh);
  assert.ok(keyFresh.includes(CATALOG_EVIDENCE_POLICY_VERSION), "Chave pública de estado deve incluir versão da política de catálogo");

  // Vencer a observação da alternativa alt_a (> 48h)
  await pg.exec("update garimpa.price_observation set observed_at = now() - interval '50 hours' where id = 'obs_alt_a'");

  // Leitura pública agora deve omitir o item cuja base comparativa venceu
  const pubStale = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubStale.products.length, 0, "item com alegação de superioridade e base vencida não é publicado");
  assert.notEqual(publishedEditorialStateKey(pubStale), keyFresh, "chave pública de estado deve mudar ao omitir o item");

  // Restaurar observação recente sem mudança material
  await pg.exec("update garimpa.price_observation set observed_at = now() where id = 'obs_alt_a'");
  const pubRestored = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubRestored.products.length, 1, "item volta a ser publicado após restauração da observação recente");
  assert.equal(pubRestored.products[0].id, "best_a");

  // Caso positivo: recaptura de rotina sem mudança material (mesmo preço 49900 e mesma configuração) NÃO suspende a alegação
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_alt_a_routine', 'a', 'alt_a', 49900, now(), $1);
  `, [JSON.stringify(evidenceAlt)]);
  const pubRoutine = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubRoutine.products.length, 1, "recaptura sem mudança material não deve suspender a alegação");
  assert.equal(pubRoutine.products[0].id, "best_a");

  // BUG-021: Contraexemplo da auditoria - mudança recente de preço da alternativa (R$ 499 -> R$ 900)
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_alt_a_changed', 'a', 'alt_a', 90000, now(), $1);
  `, [JSON.stringify(evidenceAlt)]);
  await pg.exec("update garimpa.product set last_price_cents = 90000 where id = 'alt_a' and tenant_id = 'a'");

  const pubPriceChanged = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubPriceChanged.products.length, 0, "best_a omitido da leitura pública após mudança de preço da alternativa");

  // Contraexemplo crítico BUG-021: Restaurar preço original da alternativa alt_a (49900)
  // A sequência A -> B -> A deve MANTER o item omitido até nova avaliação humana!
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_alt_a_restored', 'a', 'alt_a', 49900, now(), $1);
  `, [JSON.stringify(evidenceAlt)]);
  await pg.exec("update garimpa.product set last_price_cents = 49900 where id = 'alt_a' and tenant_id = 'a'");

  const pubPriceRestored = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubPriceRestored.products.length, 0, "best_a DEVE CONTINUAR OMITIDO após retorno de preço sem nova avaliação humana (BUG-021)");

  // Tentativa de reativar o assessment antigo em replaceEditorialSelection deve falhar
  const activateOldFails = await replaceEditorialSelection({
    expectedVersion: activateOk.selection.version,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "best_a", assessmentId: assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateOldFails.ok, false);
  if (!activateOldFails.ok) assert.equal(activateOldFails.error, "selection_item_blocked");

  // Nova avaliação humana sobre a evidência atual restabelece a alegação
  const resNewAfterPrice = await saveEditorialAssessment(claimValid as any, "user_a", "a", adminFactory);
  assert.equal(resNewAfterPrice.ok, true, "nova avaliação humana após A->B->A deve ser permitida");
  if (!resNewAfterPrice.ok) throw new Error("falha ao salvar nova avaliação");
  const activateNewAfterPrice = await replaceEditorialSelection({
    expectedVersion: activateOk.selection.version,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "best_a", assessmentId: resNewAfterPrice.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateNewAfterPrice.ok, true);

  const pubAfterNewAssessment = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubAfterNewAssessment.products.length, 1, "best_a volta após nova avaliação humana e ativação");
  assert.equal(pubAfterNewAssessment.products[0].id, "best_a");

  // BUG-021: Rejeição de uma alternativa via reviewProduct (que grava curation_event)
  await reviewProduct({
    productId: "alt_a",
    status: "rejected",
    reasonCode: "weak_offer",
    reasonDetail: "Oferta instável",
  } as any, "user_a", "a", {}, adminFactory);

  const pubAltRejected = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubAltRejected.products.length, 0, "best_a omitido da leitura pública após rejeição da alternativa");

  // Reaprovação da alternativa via reviewProduct (grava curation_event)
  await reviewProduct({
    productId: "alt_a",
    status: "approved",
    reasonCode: null,
    reasonDetail: "Revisão normalizada",
  } as any, "user_a", "a", {}, adminFactory);

  const pubAltReapproved = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubAltReapproved.products.length, 0, "best_a DEVE CONTINUAR OMITIDO após approved->rejected->approved sem nova avaliação humana (BUG-021)");

  // Nova avaliação humana restabelece a alegação após transição de status
  const resNewAfterCuration = await saveEditorialAssessment(claimValid as any, "user_a", "a", adminFactory);
  assert.equal(resNewAfterCuration.ok, true);
  if (!resNewAfterCuration.ok) throw new Error("falha ao salvar avaliação após curaçao");
  const activateAfterCuration = await replaceEditorialSelection({
    expectedVersion: activateNewAfterPrice.selection.version,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "best_a", assessmentId: resNewAfterCuration.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateAfterCuration.ok, true);

  const pubAfterCurationRestored = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubAfterCurationRestored.products.length, 1, "best_a volta após nova avaliação humana subsequente");
  assert.equal(pubAfterCurationRestored.products[0].id, "best_a");

  // AC-036.3: Ramo de catálogo puro (bootstrap) com item portador de alegação
  // Criar tenant 'cat_tenant' sem edições prévias
  await pg.exec(`
    insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name, status)
    values ('aff_cat', 'cat_tenant', 'cat-slug', 'Cat', 'active')
    on conflict do nothing;
    insert into garimpa.app_user(id, tenant_id, auth_user_id)
    values ('user_cat', 'cat_tenant', 'auth_cat')
    on conflict do nothing;
    insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role)
    values ('aff_cat', 'user_cat', 'owner')
    on conflict do nothing;
    insert into garimpa.app_user_role(app_user_id, role)
    values ('user_cat', 'afiliado')
    on conflict do nothing;

    insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, image_url, category, last_price_cents, family_key, family_label, family_method, family_version)
    values
      ('cat_cand', 'cat_tenant', 'mercadolivre', 'CAT-1', 'Cafeteira Cat Cand 110V', 'http://cat-cand', 'https://images.test/cat-cand.jpg', 'cafeteiras', 49900, 'cafeteiras', 'Cafeteiras', 'title-keywords', 'v2'),
      ('cat_alt', 'cat_tenant', 'mercadolivre', 'CAT-2', 'Cafeteira Cat Alt 110V', 'http://cat-alt', 'https://images.test/cat-alt.jpg', 'cafeteiras', 49900, 'cafeteiras', 'Cafeteiras', 'title-keywords', 'v2')
    on conflict (id) do nothing;

    insert into garimpa.product_curation(product_id, tenant_id, status)
    values ('cat_cand', 'cat_tenant', 'approved'),
           ('cat_alt', 'cat_tenant', 'approved')
    on conflict (tenant_id, product_id) do update set status = 'approved';
  `);

  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values
      ('obs_cat_cand_1', 'cat_tenant', 'cat_cand', 49900, now() - interval '5 minutes', $1),
      ('obs_cat_alt_1', 'cat_tenant', 'cat_alt', 49900, now() - interval '5 minutes', $2)
    on conflict (id) do nothing;
  `, [JSON.stringify(evidenceBest), JSON.stringify(evidenceAlt)]);

  const prodCatObj = {
    title: "Cafeteira Cat Cand 110V",
    productUrl: "http://cat-cand",
    imageUrl: "https://images.test/cat-cand.jpg",
    category: "cafeteiras",
    offerEvidence: evidenceBest,
  };
  const catClaimAssessment = {
    ...baseAssessmentInput,
    productId: "cat_cand",
    evidenceFingerprint: editorialEvidenceFingerprint(prodCatObj),
    publicRationale: "A melhor cafeteira no catálogo de abertura.",
    comparativeBasis: {
      candidateProductId: "cat_cand",
      checkedAt: new Date().toISOString(),
      alternativeProductIds: ["cat_alt"],
      usageScope: "cafeteiras expresso",
      criteria: ["pressão 19 bar"],
      rationale: "Desempenho comprovadamente superior frente à alternativa cat_alt.",
    },
  };
  const resCat = await saveEditorialAssessment(catClaimAssessment as any, "user_cat", "cat_tenant", adminFactory);
  assert.equal(resCat.ok, true);

  // Leitura em catálogo: cat_cand está presente com alegação válida
  const pubCatInitial = await getPublishedEditorialSelection("home", "cat_tenant", adminFactory);
  assert.equal(pubCatInitial.mode, "catalog");
  assert.ok(pubCatInitial.products.some((p) => p.id === "cat_cand"), "cat_cand presente no catálogo inicial");

  // Inserir mudança material em cat_alt: 49900 -> 90000 -> 49900
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_cat_alt_chg', 'cat_tenant', 'cat_alt', 90000, now() - interval '2 minutes', $1),
           ('obs_cat_alt_rst', 'cat_tenant', 'cat_alt', 49900, now(), $1);
  `, [JSON.stringify(evidenceAlt)]);

  const pubCatAfterChange = await getPublishedEditorialSelection("home", "cat_tenant", adminFactory);
  assert.equal(pubCatAfterChange.mode, "catalog");
  assert.equal(pubCatAfterChange.products.some((p) => p.id === "cat_cand"), false, "cat_cand OMITIDO no catálogo após mudança material de alternativa");

  // Nova avaliação humana restabelece cat_cand no catálogo
  const resCatRestored = await saveEditorialAssessment(catClaimAssessment as any, "user_cat", "cat_tenant", adminFactory);
  assert.equal(resCatRestored.ok, true);
  const pubCatRestored = await getPublishedEditorialSelection("home", "cat_tenant", adminFactory);
  assert.ok(pubCatRestored.products.some((p) => p.id === "cat_cand"), "cat_cand volta ao catálogo após nova avaliação humana");

  // BUG-021: Ramo de catálogo puro (tenant b) funciona sem contaminação
  const pubCatB = await getPublishedEditorialSelection("home", "b", adminFactory);
  assert.equal(pubCatB.mode, "catalog");
  assert.equal(pubCatB.products.some((p) => p.id === "best_a" || p.id === "cat_cand"), false, "tenant b totalmente isolado");

  // BUG-023: Detector de preço superlativo
  assert.equal(hasSuperiorityClaim("A mais barata entre as cafeteiras"), true);
  assert.equal(hasSuperiorityClaim("A opção mais barata da loja"), true);
  assert.equal(hasSuperiorityClaim("Menor preço garantido"), true);
  assert.equal(hasSuperiorityClaim("A escolha mais em conta"), true);

  const claimPriceSuperlative = {
    ...baseAssessmentInput,
    publicRationale: "A mais barata entre as cafeteiras do catálogo.",
  };
  const resSuperlative = await saveEditorialAssessment(claimPriceSuperlative as any, "user_a", "a", adminFactory);
  assert.equal(resSuperlative.ok, false);
  if (!resSuperlative.ok) assert.equal(resSuperlative.error, "superiority_claim_requires_comparative_basis");

  // BUG-022: ratingConfidenceScore com valores inválidos (null, negativo, fracionário)
  assert.equal(ratingConfidenceScore(4.5, null), null);
  assert.equal(ratingConfidenceScore(4.5, -3), null);
  assert.equal(ratingConfidenceScore(4.5, 2.8), null);
});

console.log(`\nTODOS OS ${passed} TESTES DO FLUXO COMPARATIVO PASSARAM COM SUCESSO!`);
