import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);

const {
  resolveVariantEvidence,
  ratingConfidenceScore,
  hasSuperiorityClaim,
  validateComparativeBasis,
  isMateriallyEquivalent,
} = require("../../packages/web/lib/comparison-evidence.ts");

const {
  EDITORIAL_POLICY_VERSION,
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

const { reviewProduct } = require("../../packages/web/lib/curation-db.ts");

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

// ============================================================================
// Fixture Principal com a Migration de Eventos Aplicada
// ============================================================================
const { pg, factory, adminFactory } = await commercialFixture();
const migrationSql = await readFile(
  new URL("../../packages/persistence/supabase/migrations/20261020002440_garimpa_comparative_evidence_event.sql", import.meta.url),
  "utf8"
);
await pg.exec(migrationSql);

// Setup accounts
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
// AC-037.1: RLS, Imutabilidade e Isolamento Multi-Tenant dos Eventos
// ============================================================================
await test("AC-037.1: RLS restringe garimpa_app ao tenant atual; escrita direta pelo app é negada; rollback é atômico", async () => {
  // Criar produtos em Tenant A e Tenant B
  await pg.exec(`
    insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, last_price_cents)
    values ('prod_a_1', 'a', 'mercadolivre', 'ext_a_1', 'Prod A', 'https://example.test/a1', 10000),
           ('prod_b_1', 'b', 'mercadolivre', 'ext_b_1', 'Prod B', 'https://example.test/b1', 20000);

    insert into garimpa.product_curation(tenant_id, product_id, status)
    values ('a', 'prod_a_1', 'approved'),
           ('b', 'prod_b_1', 'approved');

    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_a_1', 'a', 'prod_a_1', 10000, now(), '{"source":{"url":"http://a1","marketplace":"mercadolivre","capturedAt":"2026-10-19T10:00:00Z"}}'::jsonb),
           ('obs_b_1', 'b', 'prod_b_1', 20000, now(), '{"source":{"url":"http://b1","marketplace":"mercadolivre","capturedAt":"2026-10-19T10:00:00Z"}}'::jsonb);
  `);

  // Triggers devem ter inserido eventos
  const allEvents = await adminFactory()`select count(*)::int n from garimpa.comparative_evidence_event`;
  assert.ok(allEvents[0].n >= 2, "Eventos devem ser gerados pelos triggers");

  // Sessão garimpa_app escopada ao Tenant A
  await factory().begin(async (tx: any) => {
    await tx`select set_config('garimpa.tenant_id', 'a', true)`;
    const eventsA = await tx`select id, tenant_id from garimpa.comparative_evidence_event`;
    assert.ok(eventsA.length >= 1, "Tenant A deve conseguir ler seus próprios eventos");
    assert.ok(eventsA.every((e: any) => e.tenant_id === "a"), "Tenant A jamais deve ver eventos de outros tenants");
  });

  // Sessão garimpa_app escopada ao Tenant B
  await factory().begin(async (tx: any) => {
    await tx`select set_config('garimpa.tenant_id', 'b', true)`;
    const eventsB = await tx`select id, tenant_id from garimpa.comparative_evidence_event`;
    assert.ok(eventsB.length >= 1, "Tenant B deve ler seus próprios eventos");
    assert.ok(eventsB.every((e: any) => e.tenant_id === "b"), "Tenant B jamais deve ver eventos de outros tenants");
  });

  // Tentativa de insert direto pelo runtime garimpa_app deve ser negada (tabela imutável para a aplicação / RLS)
  await assert.rejects(
    () => factory().begin(async (tx: any) => {
      await tx`select set_config('garimpa.tenant_id', 'a', true)`;
      await tx`insert into garimpa.comparative_evidence_event(tenant_id, product_id, subject, operation, material_projection)
        values ('a', 'prod_a_1', 'product', 'insert', '{}'::jsonb)`;
    }),
    (err: any) => err.code === "42501" || /violates row-level security policy|permission denied/i.test(err.message)
  );

  // Atomicidade transacional: rollback desfaz observação e evento simultaneamente
  try {
    await adminFactory().begin(async (tx: any) => {
      await tx`insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
        values ('obs_fail', 'a', 'prod_a_1', 99999, now(), '{}'::jsonb)`;
      throw new Error("synthetic_rollback_test");
    });
  } catch (err: any) {
    assert.equal(err.message, "synthetic_rollback_test");
  }

  const checkObs = await adminFactory()`select count(*)::int n from garimpa.price_observation where id = 'obs_fail'`;
  assert.equal(checkObs[0].n, 0, "Observação revertida não deve existir");
  const checkEv = await adminFactory()`select count(*)::int n from garimpa.comparative_evidence_event where observation_id = 'obs_fail'`;
  assert.equal(checkEv[0].n, 0, "Evento correspondente deve ser revertido atomicamente");
});

// ============================================================================
// AC-037.4: Índice e Plano de Acesso
// ============================================================================
await test("AC-037.4: Consulta de eventos em lote utiliza índice de busca (tenant_id, product_id, id)", async () => {
  const planRows = await adminFactory().unsafe(`
    explain select id, material_projection
    from garimpa.comparative_evidence_event
    where tenant_id = 'a' and product_id = any(array['prod_a_1']) and id > 0
  `);
  const planText = planRows.map((r: any) => Object.values(r).join(" ")).join("\n");
  assert.ok(
    planText.includes("Index Scan") || planText.includes("Bitmap Index Scan") || planText.includes("comparative_evidence_event_lookup_idx"),
    `Plano deve utilizar índice: ${planText}`
  );
});

// ============================================================================
// Setup para Testes do Ciclo Editorial (AUDITORIA-OS-036 e DIAGNOSTICO)
// ============================================================================
const evidenceCand = {
  variantKey: "110v",
  variantLabel: "110V Inox",
  source: { marketplace: "mercadolivre", method: "api", url: "http://candidate", capturedAt: new Date().toISOString() },
};
const evidenceAlt = {
  variantKey: "110v",
  variantLabel: "110V Preto",
  source: { marketplace: "mercadolivre", method: "api", url: "http://alternative", capturedAt: new Date().toISOString() },
};

await pg.exec(`
  insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, image_url, last_price_cents)
  values ('cand_aud', 'a', 'mercadolivre', 'c_aud_1', 'Cafeteira Candidata', 'https://example.test/cand', 'https://example.test/cand.jpg', 89900),
         ('alt_aud', 'a', 'mercadolivre', 'a_aud_1', 'Cafeteira Alternativa', 'https://example.test/alt', 'https://example.test/alt.jpg', 49900)
  on conflict do nothing;

  insert into garimpa.product_curation(tenant_id, product_id, status)
  values ('a', 'cand_aud', 'approved'),
         ('a', 'alt_aud', 'approved')
  on conflict do nothing;

  insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
  values ('obs_cand_aud_init', 'a', 'cand_aud', 89900, now(), '${JSON.stringify(evidenceCand)}')
  on conflict do nothing;

  insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
  values ('obs_alt_aud_init', 'a', 'alt_aud', 49900, now(), '${JSON.stringify(evidenceAlt)}')
  on conflict do nothing;
`);

const baseAssessment = {
  productId: "cand_aud",
  evidenceFingerprint: editorialEvidenceFingerprint({
    title: "Cafeteira Candidata",
    productUrl: "https://example.test/cand",
    imageUrl: "https://example.test/cand.jpg",
    category: null,
    offerEvidence: evidenceCand,
  }),
  dimensions: {
    audience: { level: "adequate", reason: "Adequado para uso residencial diário." },
    utility: { level: "adequate", reason: "Prepara café expresso com pressão consistente." },
    value: { level: "adequate", reason: "Excelente construção pelo preço ofertado." },
    confidence: { level: "adequate", reason: "Avaliações consolidadas no marketplace." },
    clarity: { level: "adequate", reason: "Acompanha cachimbo e dosador." },
  },
  audience: "Entusiastas de café expresso residencial.",
  benefit: "Preparo rápido com crema encorpada.",
  purchaseContents: "Cafeteira, porta-filtro, filtros duplo e simples, dosador.",
  publicRationale: "A melhor cafeteira da categoria para uso residencial.",
  criticalDoubts: [],
  maxPriceCents: 95000,
  comparativeBasis: {
    usageScope: "cafeteiras expresso residencial",
    alternativeProductIds: ["alt_aud"],
    criteria: ["pressão de bomba", "construção da caldeira"],
    rationale: "Superior à concorrente direta em estabilidade térmica da caldeira.",
  },
};

let currentSelectionVersion: number | null = null;

// ============================================================================
// AC-037.5 / Contraprova 1: Mudança de Origem (alternative -> different-seller)
// ============================================================================
await test("AC-037.5 / Contraprova 1: Mudança de origem (source.url alterado com preço e variante constantes) suspende a alegação", async () => {
  const saveRes = await saveEditorialAssessment(baseAssessment as any, "user_a", "a", adminFactory);
  assert.equal(saveRes.ok, true, `Falha ao salvar: ${JSON.stringify(saveRes)}`);
  if (!saveRes.ok) throw new Error();

  assert.equal(saveRes.assessment.comparativeBasis?.version, "v3");

  const activateRes = await replaceEditorialSelection({
    expectedVersion: currentSelectionVersion,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "cand_aud", assessmentId: saveRes.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateRes.ok, true);
  currentSelectionVersion = activateRes.selection.version;

  // Leitura pública inicial contém o candidato
  const pubInitial = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubInitial.products.length, 1);
  assert.equal(pubInitial.products[0].id, "cand_aud");

  // Inserir nova observação para alt_aud com MESMO preço e MESMA variante, mas source.url alterado
  const diffSourceEvidence = {
    ...evidenceAlt,
    source: { ...evidenceAlt.source, url: "http://different-seller" },
  };
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_alt_diff_seller', 'a', 'alt_aud', 49900, now() + interval '1 second', $1);
  `, [JSON.stringify(diffSourceEvidence)]);

  // Leitura pública deve OMITIR o candidato
  const pubAfterDiffSeller = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubAfterDiffSeller.products.length, 0, "Candidato deve ser omitido após alteração de origem da alternativa");

  // replaceEditorialSelection com o assessment antigo deve falhar
  const reActivate = await replaceEditorialSelection({
    expectedVersion: currentSelectionVersion,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "cand_aud", assessmentId: saveRes.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(reActivate.ok, false);
  if (!reActivate.ok) assert.equal(reActivate.error, "selection_item_blocked");
});

// ============================================================================
// AC-037.5 / Contraprova 2: Observação Posterior com observed_at Retroativo
// ============================================================================
await test("AC-037.5 / Contraprova 2: Observação inserida após a avaliação com observed_at anterior suspende a alegação", async () => {
  // Nova avaliação humana restabelece o corte
  const saveRes2 = await saveEditorialAssessment(baseAssessment as any, "user_a", "a", adminFactory);
  assert.equal(saveRes2.ok, true);
  if (!saveRes2.ok) throw new Error();

  const activateRes2 = await replaceEditorialSelection({
    expectedVersion: currentSelectionVersion,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "cand_aud", assessmentId: saveRes2.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateRes2.ok, true);
  currentSelectionVersion = activateRes2.selection.version;

  // Inserir observação da alternativa a R$ 900 com observed_at retroativo (uma hora antes)
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_alt_backdated_900', 'a', 'alt_aud', 90000, now() - interval '1 hour', $1);
  `, [JSON.stringify(evidenceAlt)]);

  // Leitura pública deve omitir o candidato mesmo com data anterior, pois o evento foi gravado após o corte
  const pubAfterBackdated = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubAfterBackdated.products.length, 0, "Candidato omitido após observação posterior com data retroativa");
});

// ============================================================================
// AC-037.5 / Contraprova 3: Sobrescrita A -> B -> A da Mesma Linha de Observação
// ============================================================================
await test("AC-037.5 / Contraprova 3: Sobrescrita A->B->A (R$ 499 -> 900 -> 499) mantém a alegação suspensa até nova avaliação", async () => {
  // Nova avaliação humana restabelece corte
  const saveRes3 = await saveEditorialAssessment(baseAssessment as any, "user_a", "a", adminFactory);
  assert.equal(saveRes3.ok, true);
  if (!saveRes3.ok) throw new Error();

  const activateRes3 = await replaceEditorialSelection({
    expectedVersion: currentSelectionVersion,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "cand_aud", assessmentId: saveRes3.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateRes3.ok, true);
  currentSelectionVersion = activateRes3.selection.version;

  // Update in-place da observação mais recente para 90000
  await pg.exec("update garimpa.price_observation set price_cents = 90000 where id = 'obs_alt_diff_seller'");
  const pubB = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubB.products.length, 0, "Omitido no estado B (R$ 900)");

  // Update in-place da mesma observação de volta para 49900 (A->B->A)
  await pg.exec("update garimpa.price_observation set price_cents = 49900 where id = 'obs_alt_diff_seller'");
  const pubA2 = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubA2.products.length, 0, "DEVE CONTINUAR OMITIDO após A->B->A sem nova avaliação humana");

  // Tentativa de reativação deve ser bloqueada
  const reActivate = await replaceEditorialSelection({
    expectedVersion: currentSelectionVersion,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "cand_aud", assessmentId: saveRes3.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(reActivate.ok, false);
});

// ============================================================================
// AC-037.5 / Contraprova 4: Atualização de product_url A -> B -> A sem Nova Observação
// ============================================================================
await test("AC-037.5 / Contraprova 4: Atualização de product_url no produto A->B->A suspende e mantém suspenso", async () => {
  const saveRes4 = await saveEditorialAssessment(baseAssessment as any, "user_a", "a", adminFactory);
  assert.equal(saveRes4.ok, true);
  if (!saveRes4.ok) throw new Error();

  const activateRes4 = await replaceEditorialSelection({
    expectedVersion: currentSelectionVersion,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "cand_aud", assessmentId: saveRes4.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateRes4.ok, true);
  currentSelectionVersion = activateRes4.selection.version;

  // Alterar product_url da alternativa
  await pg.exec("update garimpa.product set product_url = 'https://example.test/alt-diff' where id = 'alt_aud'");
  const pubUrlChanged = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubUrlChanged.products.length, 0, "Omitido após alteração de product_url");

  // Restaurar product_url original (A->B->A)
  await pg.exec("update garimpa.product set product_url = 'https://example.test/alt' where id = 'alt_aud'");
  const pubUrlRestored = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubUrlRestored.products.length, 0, "Continua omitido após A->B->A de product_url");
});

// ============================================================================
// AC-037.5 / Contraprova 5 e 6: Mudança de Variante e Fonte Inválida
// ============================================================================
await test("AC-037.5 / Contraprovas 5 e 6: Variante confirmada alterada e perda de fonte auditável suspendem alegação", async () => {
  // Teste de variante 110v -> 220v
  const saveRes5 = await saveEditorialAssessment(baseAssessment as any, "user_a", "a", adminFactory);
  assert.equal(saveRes5.ok, true);
  if (!saveRes5.ok) throw new Error();

  const activateRes5 = await replaceEditorialSelection({
    expectedVersion: currentSelectionVersion,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "cand_aud", assessmentId: saveRes5.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateRes5.ok, true);
  currentSelectionVersion = activateRes5.selection.version;

  const diffVariantEvidence = {
    ...evidenceAlt,
    variantKey: "220v",
    variantLabel: "220V",
  };
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_alt_variant_220v', 'a', 'alt_aud', 49900, now(), $1);
  `, [JSON.stringify(diffVariantEvidence)]);

  const pubVariantChanged = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubVariantChanged.products.length, 0, "Omitido após mudança de variante");

  // Teste de perda de fonte
  const saveRes6 = await saveEditorialAssessment(baseAssessment as any, "user_a", "a", adminFactory);
  assert.equal(saveRes6.ok, true);
  if (!saveRes6.ok) throw new Error();

  const activateRes6 = await replaceEditorialSelection({
    expectedVersion: currentSelectionVersion,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "cand_aud", assessmentId: saveRes6.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateRes6.ok, true);
  currentSelectionVersion = activateRes6.selection.version;

  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_alt_no_source', 'a', 'alt_aud', 49900, now(), '{"variantKey":"110v"}'::jsonb);
  `);

  const pubNoSource = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubNoSource.products.length, 0, "Omitido após perda de fonte auditável");
});

// ============================================================================
// AC-037.5 / Positivos: Recaptura Equivalente e Restauração por Nova Avaliação Humana
// ============================================================================
await test("AC-037.5 / Positivos: Recaptura equivalente mantém a alegação válida; nova avaliação restaura", async () => {
  // Restaurar oferta da alternativa com fonte válida antes da nova avaliação
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_alt_pos_baseline', 'a', 'alt_aud', 49900, now() + interval '10 seconds', $1);
  `, [JSON.stringify(evidenceAlt)]);

  const saveResPos = await saveEditorialAssessment(baseAssessment as any, "user_a", "a", adminFactory);
  assert.equal(saveResPos.ok, true);
  if (!saveResPos.ok) throw new Error();

  const activateResPos = await replaceEditorialSelection({
    expectedVersion: currentSelectionVersion,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "cand_aud", assessmentId: saveResPos.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_a", "a", adminFactory);
  assert.equal(activateResPos.ok, true);
  currentSelectionVersion = activateResPos.selection.version;

  // Recaptura com MESMO preço, MESMA variante e MESMA origem
  await pg.query(`
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_alt_identical_recapture', 'a', 'alt_aud', 49900, now() + interval '11 seconds', $1);
  `, [JSON.stringify(evidenceAlt)]);

  const pubRecapture = await getPublishedEditorialSelection("home", "a", adminFactory);
  assert.equal(pubRecapture.products.length, 1, "Recaptura equivalente DEVE manter a alegação pública válida");
  assert.equal(pubRecapture.products[0].id, "cand_aud");
});

// ============================================================================
// AC-037.2 & AC-037.5: Comportamento sem a Migration (Fail-closed gracioso)
// ============================================================================
await test("AC-037.2 / AC-037.5: Sem a migration (42P01), produto descritivo funciona e alegação comparativa falha fechado", async () => {
  // Criar fixture isolada SEM aplicar a nova migration
  const fxLegacy = await commercialFixture();

  // Setup account na fixture legada
  await fxLegacy.pg.exec(`
    insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name, status)
    values ('aff_leg', 'leg', 'legacy', 'Legacy', 'active')
    on conflict do nothing;

    insert into garimpa.app_user(id, tenant_id, auth_user_id)
    values ('user_leg', 'leg', 'auth_leg')
    on conflict do nothing;

    insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role)
    values ('aff_leg', 'user_leg', 'owner')
    on conflict do nothing;

    insert into garimpa.app_user_role(app_user_id, role)
    values ('user_leg', 'afiliado')
    on conflict do nothing;

    insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, image_url, last_price_cents)
    values ('prod_desc', 'leg', 'mercadolivre', 'p_desc_1', 'Cafeteira Descritiva', 'https://example.test/desc', 'https://example.test/desc.jpg', 30000),
           ('cand_no_mig', 'leg', 'mercadolivre', 'p_cand_1', 'Cafeteira Candidata', 'https://example.test/cand_no', 'https://example.test/cand_no.jpg', 80000),
           ('alt_no_mig', 'leg', 'mercadolivre', 'p_alt_1', 'Cafeteira Alternativa', 'https://example.test/alt_no', 'https://example.test/alt_no.jpg', 50000);

    insert into garimpa.product_curation(tenant_id, product_id, status)
    values ('leg', 'prod_desc', 'approved'),
           ('leg', 'cand_no_mig', 'approved'),
           ('leg', 'alt_no_mig', 'approved');

    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, observed_at, offer_evidence)
    values ('obs_desc_1', 'leg', 'prod_desc', 30000, now(), '{}'::jsonb),
           ('obs_cand_1', 'leg', 'cand_no_mig', 80000, now(), '{"source":{"url":"http://cand","marketplace":"mercadolivre","capturedAt":"2026-10-19T10:00:00Z"}}'::jsonb),
           ('obs_alt_1', 'leg', 'alt_no_mig', 50000, now(), '{"source":{"url":"http://alt","marketplace":"mercadolivre","capturedAt":"2026-10-19T10:00:00Z"}}'::jsonb);
  `);

  // 1. Produto descritivo (sem alegação de superioridade) salva com sucesso mesmo sem a tabela de eventos
  const descInput = {
    productId: "prod_desc",
    evidenceFingerprint: editorialEvidenceFingerprint({
      title: "Cafeteira Descritiva",
      productUrl: "https://example.test/desc",
      imageUrl: "https://example.test/desc.jpg",
      category: null,
    }),
    dimensions: {
      audience: { level: "adequate", reason: "Adequado para uso residencial." },
      utility: { level: "adequate", reason: "Prepara café simples." },
      value: { level: "adequate", reason: "Preço justo." },
      confidence: { level: "adequate", reason: "Marca conhecida." },
      clarity: { level: "adequate", reason: "Embalagem padrão." },
    },
    audience: "Uso doméstico.",
    benefit: "Café rápido.",
    purchaseContents: "Cafeteira e jarra.",
    publicRationale: "Cafeteira elétrica com filtro permanente e sistema corta-pingos.",
    criticalDoubts: [],
    maxPriceCents: 35000,
  };

  const saveDesc = await saveEditorialAssessment(descInput as any, "user_leg", "leg", fxLegacy.adminFactory);
  assert.equal(saveDesc.ok, true, "Produto descritivo deve salvar normalmente sem a migration");
  if (!saveDesc.ok) throw new Error();

  // Ativar produto descritivo
  const actDesc = await replaceEditorialSelection({
    expectedVersion: null,
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    items: [{ productId: "prod_desc", assessmentId: saveDesc.assessment.id, destinations: ["home", "pauta"], context: "" }],
  }, "user_leg", "leg", fxLegacy.adminFactory);
  assert.equal(actDesc.ok, true, "Produto descritivo deve ativar normalmente sem a migration");

  // Leitura pública exibe o produto descritivo
  const pubDesc = await getPublishedEditorialSelection("home", "leg", fxLegacy.adminFactory);
  assert.equal(pubDesc.products.length, 1);
  assert.equal(pubDesc.products[0].id, "prod_desc", "Produto descritivo permanece visível");

  // 2. Alegação comparativa sem a migration: save falha fechado com comparative_evidence_table_unavailable
  const claimInput = {
    ...descInput,
    productId: "cand_no_mig",
    evidenceFingerprint: editorialEvidenceFingerprint({
      title: "Cafeteira Candidata",
      productUrl: "https://example.test/cand_no",
      imageUrl: "https://example.test/cand_no.jpg",
      category: null,
    }),
    publicRationale: "A melhor cafeteira do mercado nacional.",
    comparativeBasis: {
      usageScope: "cafeteiras",
      alternativeProductIds: ["alt_no_mig"],
      criteria: ["pressão"],
      rationale: "Bomba mais potente.",
    },
  };

  const saveClaim = await saveEditorialAssessment(claimInput as any, "user_leg", "leg", fxLegacy.adminFactory);
  assert.equal(saveClaim.ok, false);
  if (!saveClaim.ok) {
    assert.equal(saveClaim.error, "comparative_evidence_table_unavailable", "Alegação falha fechado quando tabela não existe");
  }
});

console.log(`\nTODAS AS ${passed} SUÍTES DE HISTÓRICO COMPARATIVO PASSARAM COM SUCESSO!`);
process.exit(0);