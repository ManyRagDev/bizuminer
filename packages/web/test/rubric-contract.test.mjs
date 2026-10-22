import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRubricAssessment,
  compareAssessments,
  isValidRubricLevel,
} from "../lib/rubric-contract.ts";
import { calculateRubricInputDigest } from "../lib/rubric-db.ts";

test("RubricAssessment v2: valida payload completo com Q, V, A, confiança e proveniência", () => {
  const raw = {
    schemaVersion: 2,
    quality: { level: "adequate", reason: "Material resistente e acabamento padrão." },
    value: { level: "strong", reason: "Preço 25% abaixo da média de mixers com mesma potência.", comparableAlternatives: ["Mixer Walita R$ 149"] },
    audience: { level: "adequate", reason: "Adequado para público de utilidades de cozinha prática." },
    evidenceConfidence: { level: "strong", reason: "Várias avaliações reais e especificações completas." },
    factsUsed: ["Potência 200W", "Preço R$ 49,90", "Voltagem 220V"],
    inferences: ["Uso doméstico leve"],
    unknowns: ["Tempo de garantia exato"],
    safetyFlags: [],
    policyVersion: "1.0.0",
    evidenceDigest: "a1b2c3d4e5f6",
    createdAt: "2026-10-14T10:00:00Z",
  };

  const validated = validateRubricAssessment(raw);
  assert.equal(validated.schemaVersion, 2);
  assert.equal(validated.quality.level, "adequate");
  assert.equal(validated.value.level, "strong");
  assert.equal(validated.value.comparableAlternatives?.[0], "Mixer Walita R$ 149");
  assert.equal(validated.audience.level, "adequate");
  assert.equal(validated.evidenceConfidence.level, "strong");
  assert.equal(validated.factsUsed.length, 3);
  assert.equal(validated.inferences.length, 1);
  assert.equal(validated.unknowns.length, 1);
  assert.equal(validated.safetyFlags.length, 0);
});

test("RubricAssessment v2: rejeita nível inválido ou justificativa vazia", () => {
  const invalidLevel = {
    schemaVersion: 2,
    quality: { level: "super_bom", reason: "Incrível" },
    value: { level: "adequate", reason: "Ok" },
    audience: { level: "adequate", reason: "Ok" },
    evidenceConfidence: { level: "adequate", reason: "Ok" },
  };

  assert.throws(() => validateRubricAssessment(invalidLevel), /Nível inválido na dimensão 'quality'/);

  const emptyReason = {
    schemaVersion: 2,
    quality: { level: "adequate", reason: "   " },
    value: { level: "adequate", reason: "Ok" },
    audience: { level: "adequate", reason: "Ok" },
    evidenceConfidence: { level: "adequate", reason: "Ok" },
  };

  assert.throws(() => validateRubricAssessment(emptyReason), /Justificativa obrigatória na dimensão 'quality'/);
});

test("compareAssessments: identifica concordância total quando humano e IA coincidem", () => {
  const human = validateRubricAssessment({
    schemaVersion: 2,
    quality: { level: "adequate", reason: "Boa construção" },
    value: { level: "adequate", reason: "Preço justo" },
    audience: { level: "adequate", reason: "Interesse geral" },
    evidenceConfidence: { level: "strong", reason: "Fatos comprovados" },
    factsUsed: ["Fato 1"],
    inferences: [],
    unknowns: [],
    safetyFlags: [],
    policyVersion: "1.0.0",
    evidenceDigest: "dig-1",
    createdAt: "2026-10-14T10:00:00Z",
  });

  const ai = validateRubricAssessment({
    schemaVersion: 2,
    quality: { level: "adequate", reason: "Acabamento plástico comum" },
    value: { level: "adequate", reason: "Preço alinhado ao mercado" },
    audience: { level: "adequate", reason: "Geral" },
    evidenceConfidence: { level: "strong", reason: "Dados completos" },
    factsUsed: ["Fato 1"],
    inferences: [],
    unknowns: [],
    safetyFlags: [],
    policyVersion: "1.0.0",
    evidenceDigest: "dig-1",
    createdAt: "2026-10-14T10:00:00Z",
  });

  const result = compareAssessments(human, ai);
  assert.equal(result.agreement, true);
  assert.equal(result.disagreements.length, 0);
});

test("compareAssessments: documenta desacordo em valor e sinalizadores de segurança não vistos pela IA", () => {
  const human = validateRubricAssessment({
    schemaVersion: 2,
    quality: { level: "adequate", reason: "Boa construção" },
    value: { level: "weak", reason: "Existe versão original com frete grátis mais barata" },
    audience: { level: "adequate", reason: "Interesse geral" },
    evidenceConfidence: { level: "adequate", reason: "Fatos ok" },
    factsUsed: ["Fato 1"],
    inferences: [],
    unknowns: [],
    safetyFlags: ["alegacao_terapeutica_duvidosa"],
    policyVersion: "1.0.0",
    evidenceDigest: "dig-1",
    createdAt: "2026-10-14T10:00:00Z",
  });

  const ai = validateRubricAssessment({
    schemaVersion: 2,
    quality: { level: "adequate", reason: "Acabamento ok" },
    value: { level: "strong", reason: "Parece barato" },
    audience: { level: "adequate", reason: "Geral" },
    evidenceConfidence: { level: "adequate", reason: "Dados normais" },
    factsUsed: ["Fato 1"],
    inferences: [],
    unknowns: [],
    safetyFlags: [],
    policyVersion: "1.0.0",
    evidenceDigest: "dig-1",
    createdAt: "2026-10-14T10:00:00Z",
  });

  const result = compareAssessments(human, ai);
  assert.equal(result.agreement, false);
  assert.equal(result.disagreements.length, 2);

  const valueDisagreement = result.disagreements.find((d) => d.dimension === "value");
  assert.ok(valueDisagreement);
  assert.equal(valueDisagreement.humanLevel, "weak");
  assert.equal(valueDisagreement.aiLevel, "strong");

  const safetyDisagreement = result.disagreements.find((d) => d.dimension === "safety");
  assert.ok(safetyDisagreement);
});

test("calculateRubricInputDigest: determinístico para mesmos dados factuais", () => {
  const item1 = {
    productId: "prod-1",
    title: "  Fone Bluetooth TWS  ",
    category: "Eletrônicos",
    priceCents: 5990,
    marketplace: "shopee",
  };
  const item2 = {
    productId: "prod-1",
    title: "Fone Bluetooth TWS",
    category: "Eletrônicos",
    priceCents: 5990,
    marketplace: "shopee",
  };

  const digest1 = calculateRubricInputDigest(item1);
  const digest2 = calculateRubricInputDigest(item2);
  assert.equal(digest1, digest2);

  const itemDifferentPrice = { ...item1, priceCents: 4990 };
  assert.notEqual(digest1, calculateRubricInputDigest(itemDifferentPrice));
});
