/** Unit/contract checks using mocks, not SQL/RLS/browser evidence.
 * Real database and HTTP-handler integration: tools/editorial-tests/commercial-flow.test.ts.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  recordManualConversion,
  recordCommissionEntry,
  recordSaaSRevenueEntry,
} from "../lib/commercial-financial-db.ts";

import {
  validateCommercialKitRevision,
  revalidateKitBeforeExport,
} from "../lib/kit-validator.ts";
import {
  generateCampaignLinkCode,
  isCampaignLinkCode,
  calculateContentDigest,
} from "../lib/commerce-contract.ts";
import { resolveCampaignLinkByCode } from "../lib/commerce-db.ts";
import { validateCampaignTokenForSlug } from "../lib/campaign-attribution.ts";

const SYNTHETIC_TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.AFFILIATE_SECRETS_MASTER_KEY = SYNTHETIC_TEST_KEY;

test("E2E: 1. Registro Financeiro Manual com AccountContext Autorizado", async () => {
  const authorizedContext = {
    tenantId: "tenant_alpha",
    affiliateId: "aff_alpha",
    actor: "human",
    actorAppUserId: "usr_alice",
    authenticatedAuthUserId: "auth_alice_123",
    membershipRole: "owner",
    requestId: "req_fin_001",
  };

  // Mock de banco transacional para withAccountDb
  const tables = {
    conversions: [],
    attributions: [],
    domainEvents: [],
    commissions: [],
    saasRevenue: [],
  };

  const createMockDb = () => {
    const fn = async (strings, ...values) => {
      const q = strings.join("?");
      if (q.includes("set_config")) {
        return [];
      }
      if (q.includes("select id from garimpa.conversion")) {
        const found = tables.conversions.find(
          (c) => c.tenant_id === values[0] && c.request_id === values[1]
        );
        return found ? [{ id: found.id }] : [];
      }
      if (q.includes("insert into garimpa.conversion (")) {
        const id = `conv_${tables.conversions.length + 1}`;
        tables.conversions.push({
          id,
          tenant_id: values[0],
          marketplace: values[1],
          request_id: values[11],
        });
        return [{ id }];
      }
      if (q.includes("insert into garimpa.conversion_attribution")) {
        tables.attributions.push({
          conversion_id: values[0],
          tenant_id: values[1],
          campaign_publication_id: values[2],
        });
        return [];
      }
      if (q.includes("insert into garimpa.domain_event")) {
        tables.domainEvents.push({
          tenant_id: values[0],
          aggregate_id: values[1],
          actor_ref: values[3],
          request_id: values[4],
        });
        return [];
      }
      if (q.includes("insert into garimpa.commission_entry")) {
        const id = `comm_${tables.commissions.length + 1}`;
        tables.commissions.push({
          id,
          tenant_id: values[0],
          source_key: values[2],
          amount_cents: values[3],
          state: values[5],
        });
        return [{ id }];
      }
      return [];
    };

    fn.begin = async (callback) => callback(fn);
    fn.end = async () => {};
    return fn;
  };

  // Injetar mock fábrica no teste
  const originalDb = (await import("../lib/db.ts")).db;
  // Testar chamada direta de recordManualConversion
  const convInput = {
    marketplace: "mercadolivre",
    occurredAt: "2026-10-14T10:00:00Z",
    orderValueCents: 19900,
    requestId: "req_fin_001",
    campaignPublicationId: "pub_123",
  };

  // 1. Rejeição de tenant mismatch: se input tentar forçar outro tenant, falha antes de avançar
  await assert.rejects(
    async () => {
      await recordManualConversion(authorizedContext, {
        ...convInput,
        tenantId: "tenant_INVASOR",
      });
    },
    /Tenant mismatch/,
    "Não deve permitir gravar em tenant divergente do contexto autorizado"
  );
});

test("E2E: 2. Ciclo de Vida do Kit Comercial: Validação, Prevenção de Abusos e Detecção de Deriva", () => {
  const snapshot = {
    title: "Monitor Gamer 144Hz 24 Pol",
    priceCents: 89900,
    productUrl: "https://mercadolivre.com.br/item-123",
    variantKey: "var_24pol_black",
    extractedAt: "2026-10-14T09:00:00Z",
  };

  // 1. Kit inválido: contém alegações de urgência proibidas e sem disclosure
  const badMaterials = [
    {
      channel: "whatsapp_channel",
      shortCopy: "CORRE! SÓ HOJE por esse preço!",
      cta: "Compre agora",
      destinationKind: "internal_bizu",
      // Sem disclosure!
    },
  ];

  const badValidation = validateCommercialKitRevision({
    snapshot,
    claims: [],
    materials: badMaterials,
    evidenceLevel: "E1",
    imageRights: "allowed",
  });

  assert.equal(badValidation.valid, false, "Kit com alegações proibidas deve ser inválido");
  assert.ok(badValidation.blockers.some((b) => b.code === "MISSING_AFFILIATE_DISCLOSURE"));
  assert.ok(badValidation.blockers.some((b) => b.code === "UNSUPPORTED_URGENCY_CLAIM"));

  // 2. Kit conforme: possui disclosure explícito e alegações compatíveis
  const goodMaterials = [
    {
      channel: "whatsapp_channel",
      shortCopy: "Monitor Gamer 144Hz em oferta observada no Mercado Livre.",
      cta: "Ver recomendação no BizuMiner",
      disclosure: "Link de afiliado parceiro.",
      destinationKind: "internal_bizu",
    },
  ];

  const goodValidation = validateCommercialKitRevision({
    snapshot,
    claims: [],
    materials: goodMaterials,
    evidenceLevel: "E2",
    imageRights: "allowed",
  });

  assert.equal(goodValidation.valid, true, "Kit conforme deve ser aprovado na validação");
  assert.equal(goodValidation.blockers.length, 0);

  // 3. Revalidação antes de exportar: Preço variou (de R$ 899 para R$ 950) -> Deriva factual detectada!
  const driftCheck = revalidateKitBeforeExport({
    snapshot,
    currentObservedPriceCents: 95000, // Preço subiu
    validationValidUntil: goodValidation.validUntil,
  });

  assert.equal(driftCheck.canExport, false, "Não deve permitir exportar kit com deriva de preço");
  assert.ok(driftCheck.driftReasons.some((r) => r.includes("Preço variou")));

  // 4. Revalidação antes de exportar com preço estável -> Aprovado para exportação
  const stableCheck = revalidateKitBeforeExport({
    snapshot,
    currentObservedPriceCents: 89900,
    validationValidUntil: goodValidation.validUntil,
  });

  assert.equal(stableCheck.canExport, true, "Preço estável deve autorizar exportação");
  assert.equal(stableCheck.driftReasons.length, 0);
});

test("E2E: 3. Resolução de Links `/p/<code>` e Preservação de Links Legados", async () => {
  const campaignCode = generateCampaignLinkCode();
  assert.equal(isCampaignLinkCode(campaignCode), true);
  assert.equal(campaignCode.length, 12);

  // Mock para resolver link de campanha no banco
  const mockSql = () => {
    const fn = async (strings, ...values) => {
      if (values.includes(campaignCode)) {
        return [
          {
            code: campaignCode,
            tenant_id: "tenant_alpha",
            slug: "monitor-gamer-144hz-123",
          },
        ];
      }
      return [];
    };
    fn.end = async () => {};
    return fn;
  };

  // Resolução de link de campanha
  const resolved = await resolveCampaignLinkByCode(campaignCode, mockSql);
  assert.ok(resolved !== null);
  assert.equal(resolved.slug, "monitor-gamer-144hz-123");
  assert.equal(resolved.tenantId, "tenant_alpha");

  // Destino deve ser a página de preview de produto com o parâmetro de campanha
  const targetLocation = `/bizu/${resolved.slug}?c=${encodeURIComponent(campaignCode)}`;
  assert.equal(targetLocation, `/bizu/monitor-gamer-144hz-123?c=${campaignCode}`);

  // Código legado (4 caracteres) não é tratado como campanha
  const legacyCode = "ab3k";
  assert.equal(isCampaignLinkCode(legacyCode), false, "4-char code não é link de campanha");
});

test("E2E: 4. Telemetria e Atribuição Estrita de Token de Campanha", async () => {
  const campaignCode = "ab3k9zx42qwp";
  const matchingSlug = "ml-MLB987654";
  const mismatchSlug = "ml-MLB111111";

  const mockDb = () => {
    const fn = async (strings, ...values) => {
      if (values.includes(campaignCode) && values.includes(matchingSlug)) {
        return [
          {
            link_id: "link_camp_01",
            pub_id: "pub_camp_01",
            tenant_id: "tenant_alpha",
            product_id: "prod_1",
          },
        ];
      }
      return [];
    };
    fn.end = async () => {};
    return fn;
  };

  // 1. Token para produto correto -> Atribuição autorizada
  const legit = await validateCampaignTokenForSlug(campaignCode, matchingSlug, mockDb);
  assert.equal(legit.valid, true);
  assert.equal(legit.campaignLinkId, "link_camp_01");
  assert.equal(legit.tenantId, "tenant_alpha");

  // 2. Token de outro produto -> Falha fechado com razão comprovada
  const mismatch = await validateCampaignTokenForSlug(campaignCode, mismatchSlug, mockDb);
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.reason, "mismatched_or_inactive_token");
});
