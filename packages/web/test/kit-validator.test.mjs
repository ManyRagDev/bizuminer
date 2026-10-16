import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCommercialKitRevision,
  revalidateKitBeforeExport,
} from "../lib/kit-validator.ts";

const validSnapshot = {
  productId: "prod-1",
  title: "Fone Bluetooth Cancelamento de Ruído",
  priceCents: 19990,
  originalPriceCents: 29990,
  currency: "BRL",
  observedAt: "2026-10-14T09:00:00Z",
  validUntil: "2026-10-15T09:00:00Z",
  productUrl: "https://www.mercadolivre.com.br/...",
  reasons: ["Preço estável há 14 dias", "Avaliação 4.8"],
};

const validMaterial = {
  channel: "whatsapp_channel",
  shortCopy: "Fone Bluetooth com cancelamento de ruído em valor promocional.",
  cta: "Acesse para conferir",
  disclosure: "Link de afiliado · BizuMiner",
  assetRefs: [],
};

test("validateCommercialKitRevision approves clean factual material", () => {
  const result = validateCommercialKitRevision({
    snapshot: validSnapshot,
    claims: [],
    materials: [validMaterial],
    evidenceLevel: "E1",
  });

  assert.equal(result.valid, true);
  assert.equal(result.result, "valid");
  assert.equal(result.blockers.length, 0);
  assert.ok(result.inputDigest.length > 0);
});

test("validateCommercialKitRevision blocks material missing affiliate disclosure", () => {
  const invalidMaterial = {
    ...validMaterial,
    disclosure: "", // Ausente
  };

  const result = validateCommercialKitRevision({
    snapshot: validSnapshot,
    claims: [],
    materials: [invalidMaterial],
    evidenceLevel: "E1",
  });

  assert.equal(result.valid, false);
  assert.equal(result.blockers.some((b) => b.code === "MISSING_AFFILIATE_DISCLOSURE"), true);
});

test("validateCommercialKitRevision blocks unsupported urgency claims (T11)", () => {
  const urgencyMaterial = {
    ...validMaterial,
    shortCopy: "CORRE que são as últimas unidades só hoje!",
  };

  const result = validateCommercialKitRevision({
    snapshot: validSnapshot,
    claims: [],
    materials: [urgencyMaterial],
    evidenceLevel: "E1",
  });

  assert.equal(result.valid, false);
  const urgencyBlockers = result.blockers.filter((b) => b.code === "UNSUPPORTED_URGENCY_CLAIM");
  assert.ok(urgencyBlockers.length > 0, "deve bloquear 'só hoje' / 'últimas unidades'");
});

test("validateCommercialKitRevision blocks lowest price claim without E3 evidence (T12)", () => {
  const priceClaimMaterial = {
    ...validMaterial,
    shortCopy: "Menor preço histórico registrado!",
  };

  // Com evidência apenas E1: bloqueado
  const resultE1 = validateCommercialKitRevision({
    snapshot: validSnapshot,
    claims: [],
    materials: [priceClaimMaterial],
    evidenceLevel: "E1",
  });
  assert.equal(resultE1.valid, false);
  assert.equal(resultE1.blockers.some((b) => b.code === "UNSUPPORTED_PRICE_CLAIM"), true);

  // E2 não autoriza recorde histórico
  const resultE2 = validateCommercialKitRevision({
    snapshot: validSnapshot,
    claims: [],
    materials: [priceClaimMaterial],
    evidenceLevel: "E2",
  });
  assert.equal(resultE2.valid, false);
  assert.equal(resultE2.blockers.some((b) => b.code === "UNSUPPORTED_PRICE_CLAIM"), true);
});

test("validateCommercialKitRevision blocks visual assets with unknown image rights (G-RIGHTS)", () => {
  const assetMaterial = {
    ...validMaterial,
    channel: "instagram_stories",
    assetRefs: ["asset-uuid-1"],
  };

  // Sem autorização: bloqueado
  const resultUnknown = validateCommercialKitRevision({
    snapshot: validSnapshot,
    claims: [],
    materials: [assetMaterial],
    evidenceLevel: "E2",
    imageRights: "unknown",
  });
  assert.equal(resultUnknown.valid, false);
  assert.equal(resultUnknown.blockers.some((b) => b.code === "MISSING_RIGHTS_FOR_ASSET"), true);

  // Com autorização allowed: permitido
  const resultAllowed = validateCommercialKitRevision({
    snapshot: validSnapshot,
    claims: [],
    materials: [assetMaterial],
    evidenceLevel: "E2",
    imageRights: "allowed",
  });
  assert.equal(resultAllowed.valid, true);
});

test("revalidateKitBeforeExport blocks export when observed price drifts (T10)", () => {
  const revalSamePrice = revalidateKitBeforeExport({
    snapshot: validSnapshot,
    currentObservedPriceCents: 19990,
    validationValidUntil: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.equal(revalSamePrice.canExport, true);

  // Preço mudou
  const revalChangedPrice = revalidateKitBeforeExport({
    snapshot: validSnapshot,
    currentObservedPriceCents: 24990,
    validationValidUntil: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.equal(revalChangedPrice.canExport, false);
  assert.ok(revalChangedPrice.driftReasons[0].includes("Preço variou"));
});

test("E3 alone does not authorize arbitrary record copy and edited price cannot disagree with snapshot",()=>{
 const base={snapshot:validSnapshot,claims:[],materials:[{...validMaterial,shortCopy:'Menor preço histórico!'}],evidenceLevel:'E3'};
 assert.equal(validateCommercialKitRevision(base).valid,false);
 assert.equal(validateCommercialKitRevision({...base,claims:[{type:'historical_observed_minimum',textParameters:{currentPriceCents:validSnapshot.priceCents,priorMinCents:29990}}]}).valid,true);
 assert.equal(validateCommercialKitRevision({...base,materials:[{...validMaterial,shortCopy:'Preço: R$ 0,01'}]}).valid,false);
});
