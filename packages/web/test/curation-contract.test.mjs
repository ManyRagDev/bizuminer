import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCurationBulk,
  validateCurationDeferral,
  validateCurationDecision,
  validateGroupAction,
} from "../lib/curation-contract.ts";

const productId = "0d539916-c495-41ea-b569-a3b3f714d3e1";

test("aprovação é uma decisão de um clique e limpa motivos enviados por engano", () => {
  const result = validateCurationDecision({
    productId,
    decision: "approve",
    reasonCode: "other",
    reasonDetail: "não deve persistir",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, "approved");
  assert.equal(result.value.reasonCode, null);
  assert.equal(result.value.reasonDetail, null);
});

test("rejeição exige um motivo estruturado", () => {
  assert.deepEqual(
    validateCurationDecision({ productId, decision: "reject" }),
    { ok: false, error: "reason_required" },
  );
});

test("Outro exige texto livre que poderá alimentar padrões futuros", () => {
  assert.deepEqual(
    validateCurationDecision({ productId, decision: "reject", reasonCode: "other", reasonDetail: "  " }),
    { ok: false, error: "other_detail_required" },
  );
  const valid = validateCurationDecision({
    productId,
    decision: "reject",
    reasonCode: "other",
    reasonDetail: "  Parece uma assinatura disfarçada de produto físico.  ",
  });
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  assert.equal(valid.value.reasonDetail, "Parece uma assinatura disfarçada de produto físico.");
});

test("motivos de rejeição e de pausa não se misturam", () => {
  assert.deepEqual(
    validateCurationDecision({ productId, decision: "hold", reasonCode: "adult_sexual" }),
    { ok: false, error: "reason_required" },
  );
  const held = validateCurationDecision({ productId, decision: "hold", reasonCode: "insufficient_evidence" });
  assert.equal(held.ok, true);
  if (held.ok) assert.equal(held.value.status, "held");
});

test("texto livre só é persistido quando o motivo é Outro", () => {
  const parsed = validateCurationDecision({
    productId: "prod_1",
    decision: "reject",
    reasonCode: "duplicate",
    reasonDetail: "texto indevido enviado fora do fluxo de Outro",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.reasonDetail, null);
});

test("payload limita id e detalhe antes de chegar ao banco", () => {
  assert.deepEqual(
    validateCurationDecision({ productId: "../produto", decision: "approve" }),
    { ok: false, error: "invalid_product" },
  );
  assert.deepEqual(
    validateCurationDecision({ productId, decision: "reject", reasonCode: "other", reasonDetail: "x".repeat(1001) }),
    { ok: false, error: "other_detail_required" },
  );
});

test("espera por saturação de família é um motivo válido de hold, não de rejeição", () => {
  const held = validateCurationDecision({ productId, decision: "hold", reasonCode: "family_saturation" });
  assert.equal(held.ok, true);
  if (held.ok) assert.equal(held.value.status, "held");
  const rejected = validateCurationDecision({ productId, decision: "reject", reasonCode: "family_saturation" });
  assert.deepEqual(rejected, { ok: false, error: "reason_required" });
});

test("adiamento rejeita passado, formato inválido e horizonte além do limite", () => {
  const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const ok = validateCurationDeferral({ productId, deferredUntil: future });
  assert.equal(ok.ok, true);

  assert.deepEqual(
    validateCurationDeferral({ productId, deferredUntil: new Date(Date.now() - 1000).toISOString() }),
    { ok: false, error: "deferred_until_in_past" },
  );
  assert.deepEqual(
    validateCurationDeferral({ productId, deferredUntil: "não é data" }),
    { ok: false, error: "invalid_deferred_until" },
  );
  const far = new Date(Date.now() + 366 * 86_400_000).toISOString();
  assert.deepEqual(
    validateCurationDeferral({ productId, deferredUntil: far }),
    { ok: false, error: "deferred_until_too_far" },
  );
});

test("ação em lote valida cada decisão e normaliza contexto", () => {
  const ok = validateCurationBulk({
    decisions: [
      { productId, decision: "approve" },
      { productId: "produto_2", decision: "hold", reasonCode: "family_saturation" },
    ],
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.value.decisions.length, 2);
  assert.equal(ok.value.context.groupId, null);
  assert.ok(ok.value.context.bulkActionId);
  assert.ok(ok.value.context.reviewSessionId);
  assert.notEqual(ok.value.context.bulkActionId, ok.value.context.reviewSessionId);
});

test("ação em lote rejeita o mesmo produto mais de uma vez", () => {
  assert.deepEqual(
    validateCurationBulk({
      decisions: [
        { productId, decision: "approve" },
        { productId, decision: "reject", reasonCode: "duplicate" },
      ],
    }),
    { ok: false, error: "bulk_duplicate_product" },
  );
});

test("ação em lote falha fechado em lote vazio, grande demais ou decisão inválida", () => {
  assert.deepEqual(validateCurationBulk({ decisions: [] }), { ok: false, error: "bulk_empty" });
  const many = Array.from({ length: 201 }, () => ({ productId, decision: "approve" }));
  assert.deepEqual(validateCurationBulk({ decisions: many }), { ok: false, error: "bulk_too_large" });
  assert.deepEqual(
    validateCurationBulk({ decisions: [{ productId, decision: "reject" }] }),
    { ok: false, error: "reason_required" },
  );
  assert.deepEqual(
    validateCurationBulk({
      decisions: [{ productId, decision: "approve" }],
      context: { groupId: "grupo com espaço inválido" },
    }),
    { ok: false, error: "invalid_context_id" },
  );
});

test("AC-035.1: validateGroupAction com retenção exige expectedMemberProductIds completo, válido e não vazio", () => {
  const groupId = "grp_0123456789abcdef";
  const selected = ["prod_1"];

  // 1. Falha: expectedMemberProductIds ausente
  const noExpected = validateGroupAction({
    groupId,
    selectedProductIds: selected,
    action: "approve",
    retainRemainingAsSaturation: true,
    saturationJustification: "Justificativa editorial válida",
  });
  assert.equal(noExpected.ok, false);
  assert.equal(noExpected.error, "expected_members_required");

  // 2. Falha: expectedMemberProductIds nulo
  const nullExpected = validateGroupAction({
    groupId,
    selectedProductIds: selected,
    action: "approve",
    retainRemainingAsSaturation: true,
    saturationJustification: "Justificativa editorial válida",
    expectedMemberProductIds: null,
  });
  assert.equal(nullExpected.ok, false);
  assert.equal(nullExpected.error, "expected_members_required");

  // 3. Falha: expectedMemberProductIds vazio
  const emptyExpected = validateGroupAction({
    groupId,
    selectedProductIds: selected,
    action: "approve",
    retainRemainingAsSaturation: true,
    saturationJustification: "Justificativa editorial válida",
    expectedMemberProductIds: [],
  });
  assert.equal(emptyExpected.ok, false);
  assert.equal(emptyExpected.error, "expected_members_required");

  // 4. Falha: expectedMemberProductIds com duplicatas
  const dupExpected = validateGroupAction({
    groupId,
    selectedProductIds: selected,
    action: "approve",
    retainRemainingAsSaturation: true,
    saturationJustification: "Justificativa editorial válida",
    expectedMemberProductIds: ["prod_1", "prod_2", "prod_1"],
  });
  assert.equal(dupExpected.ok, false);
  assert.equal(dupExpected.error, "bulk_duplicate_product");

  // 5. Falha: expectedMemberProductIds com ID inválido
  const invalidIdExpected = validateGroupAction({
    groupId,
    selectedProductIds: selected,
    action: "approve",
    retainRemainingAsSaturation: true,
    saturationJustification: "Justificativa editorial válida",
    expectedMemberProductIds: ["prod_1", "../invalido"],
  });
  assert.equal(invalidIdExpected.ok, false);
  assert.equal(invalidIdExpected.error, "invalid_product");

  // 6. Falha: expectedMemberProductIds omite produto selecionado
  const omitSelectedExpected = validateGroupAction({
    groupId,
    selectedProductIds: ["prod_1", "prod_2"],
    action: "approve",
    retainRemainingAsSaturation: true,
    saturationJustification: "Justificativa editorial válida",
    expectedMemberProductIds: ["prod_1", "prod_3"],
  });
  assert.equal(omitSelectedExpected.ok, false);
  assert.equal(omitSelectedExpected.error, "expected_members_must_include_selected");

  // 7. Sucesso com retenção: lista completa e justificativa válida
  const validRetention = validateGroupAction({
    groupId,
    selectedProductIds: ["prod_1"],
    action: "approve",
    retainRemainingAsSaturation: true,
    saturationJustification: "Justificativa editorial válida",
    expectedMemberProductIds: ["prod_1", "prod_2", "prod_3"],
  });
  assert.equal(validRetention.ok, true);
  if (validRetention.ok) {
    assert.deepEqual(validRetention.value.expectedMemberProductIds, ["prod_1", "prod_2", "prod_3"]);
    assert.equal(validRetention.value.retainRemainingAsSaturation, true);
  }

  // 8. Sucesso sem retenção: expectedMemberProductIds é opcional
  const validNoRetention = validateGroupAction({
    groupId,
    selectedProductIds: ["prod_1"],
    action: "approve",
    retainRemainingAsSaturation: false,
  });
  assert.equal(validNoRetention.ok, true);
  if (validNoRetention.ok) {
    assert.equal(validNoRetention.value.expectedMemberProductIds, null);
    assert.equal(validNoRetention.value.retainRemainingAsSaturation, false);
  }
});
