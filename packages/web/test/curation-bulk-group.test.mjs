import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDecisionLoad,
  validateGroupAction,
} from "../lib/curation-contract.ts";
import {
  editorialGroupIdFor,
  editorialGroupsFor,
  matchesEditorialGroup,
  selectRepresentatives,
} from "../lib/editorial-groups.ts";
import { buildSnapshotMetadata, CURATION_SNAPSHOT_VERSION } from "../lib/curation-snapshot.ts";
import { stateAfterDecision, stateRestoredByUndo } from "../lib/curation-transition.ts";

const family = {
  key: "manopla_esportiva",
  label: "Manopla esportiva para moto",
  method: "title-keywords",
  version: "v1",
};

function makeMembers(count) {
  const marketplaces = ["shopee", "mercadolivre", "aliexpress"];
  return Array.from({ length: count }, (_, i) => ({
    tenantId: "local",
    productId: `prod_${String(i + 1).padStart(3, "0")}`,
    marketplace: marketplaces[i % marketplaces.length],
    family,
    status: "pending",
    observedAt: "2026-09-04T12:00:00.000Z",
    priceCents: 3000 + i * 100,
    ratingStar: 4.0 + (i % 10) * 0.1,
    salesLabel: `${100 + i * 10} vendidos`,
    salesCount: 100 + i * 10,
    observationCount: 3,
    lowestVerified: i === 0,
  }));
}

test("M4-E Contrato: formatDecisionLoad formata textos singulares e plurais corretamente", () => {
  const pluralLoad = {
    openGroupsCount: 2,
    singularsCount: 3,
    totalCapturedAwaiting: 33,
    withoutFamilyCount: 5,
  };
  assert.equal(
    formatDecisionLoad(pluralLoad),
    "2 grupos e 3 produtos singulares aguardam avaliação — 33 produtos capturados"
  );

  const singularLoad = {
    openGroupsCount: 1,
    singularsCount: 1,
    totalCapturedAwaiting: 1,
    withoutFamilyCount: 0,
  };
  assert.equal(
    formatDecisionLoad(singularLoad),
    "1 grupo e 1 produto singular aguardam avaliação — 1 produto capturado"
  );
});

test("M4-E Contrato: validateGroupAction valida payload e impede duplicatas e dados inválidos", () => {
  const canonicalGroupId = editorialGroupIdFor("local", family.key, family.method, family.version);

  // Válido com combo (aprovar selecionados + reter demais)
  const validCombo = validateGroupAction({
    groupId: canonicalGroupId,
    selectedProductIds: ["prod_001", "prod_002"],
    action: "approve",
    retainRemainingAsSaturation: true,
    reviewSessionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  });
  assert.equal(validCombo.ok, true);
  if (validCombo.ok) {
    assert.equal(validCombo.value.groupId, canonicalGroupId);
    assert.deepEqual(validCombo.value.selectedProductIds, ["prod_001", "prod_002"]);
    assert.equal(validCombo.value.retainRemainingAsSaturation, true);
  }

  // Falha: groupId vazio
  const emptyGroup = validateGroupAction({
    groupId: "",
    selectedProductIds: ["prod_001"],
    action: "approve",
  });
  assert.equal(emptyGroup.ok, false);
  assert.equal(emptyGroup.error, "invalid_group_id");

  // Falha: produtos duplicados
  const dupProducts = validateGroupAction({
    groupId: canonicalGroupId,
    selectedProductIds: ["prod_001", "prod_002", "prod_001"],
    action: "approve",
  });
  assert.equal(dupProducts.ok, false);
  assert.equal(dupProducts.error, "bulk_duplicate_product");

  // Falha: rejeição sem motivo
  const rejectNoReason = validateGroupAction({
    groupId: canonicalGroupId,
    selectedProductIds: ["prod_001"],
    action: "reject",
    reasonCode: null,
  });
  assert.equal(rejectNoReason.ok, false);
  assert.equal(rejectNoReason.error, "reason_required");

  // Falha: rejeição com motivo "other" sem detalhe suficiente
  const rejectShortDetail = validateGroupAction({
    groupId: canonicalGroupId,
    selectedProductIds: ["prod_001"],
    action: "reject",
    reasonCode: "other",
    reasonDetail: "ab",
  });
  assert.equal(rejectShortDetail.ok, false);
  assert.equal(rejectShortDetail.error, "other_detail_required");

  // Válido: rejeição com motivo "other" e detalhe suficiente
  const rejectValidDetail = validateGroupAction({
    groupId: canonicalGroupId,
    selectedProductIds: ["prod_001"],
    action: "reject",
    reasonCode: "other",
    reasonDetail: "Anúncio falso de produto réplica",
  });
  assert.equal(rejectValidDetail.ok, true);
});

test("M4-E Cenário Prático: 30 itens na mesma família resolvidos com 1 ação e até 5 representantes", () => {
  const members = makeMembers(30);
  assert.equal(members.length, 30);

  // 1. Agrupamento editorial reconhece os 30 como 1 grupo
  const overview = editorialGroupsFor(members);
  assert.equal(overview.groups.length, 1);
  assert.equal(overview.singularProductIds.length, 0);

  const group = overview.groups[0];
  assert.equal(group.memberCount, 30);

  // 2. A seleção de representantes escolhe no máximo 5 itens
  const reps = selectRepresentatives(members, 5);
  assert.equal(reps.length, 5);

  // 3. O curador escolhe 2 representantes para aprovar e retém os outros 28 por saturação
  const selectedIds = reps.slice(0, 2);
  const unselectedIds = members.map((m) => m.productId).filter((id) => !selectedIds.includes(id));
  assert.equal(selectedIds.length, 2);
  assert.equal(unselectedIds.length, 28);

  const sessionId = "11111111-2222-3333-4444-555555555555";
  const bulkActionId = "bulk_combo_test_1234";

  // Transições dos 2 selecionados -> approved
  const approvedTransitions = selectedIds.map((id) => {
    const mem = members.find((m) => m.productId === id);
    const trans = stateAfterDecision({
      status: "approved",
      reasonCode: null,
      reasonDetail: null,
    });
    return { id, trans };
  });

  // Transições dos 28 restantes -> held/family_saturation (NUNCA rejected/low_utility)
  const heldTransitions = unselectedIds.map((id) => {
    const mem = members.find((m) => m.productId === id);
    const trans = stateAfterDecision({
      status: "held",
      reasonCode: "family_saturation",
      reasonDetail: null,
    });
    return { id, trans };
  });

  assert.equal(approvedTransitions.length, 2);
  assert.equal(heldTransitions.length, 28);

  for (const item of approvedTransitions) {
    assert.equal(item.trans.status, "approved");
    assert.equal(item.trans.reasonCode, null);
  }

  for (const item of heldTransitions) {
    assert.equal(item.trans.status, "held");
    assert.equal(item.trans.reasonCode, "family_saturation");
  }

  // 4. Cada um dos 30 itens recebe snapshot v1 válido com contexto de grupo
  for (const mem of members) {
    const snap = buildSnapshotMetadata(
      {
        productId: mem.productId,
        slug: `slug_${mem.productId}`,
        marketplace: mem.marketplace,
        externalId: `ext_${mem.productId}`,
        title: `Manopla modelo ${mem.productId}`,
        productUrl: `https://${mem.marketplace}.com/item/${mem.productId}`,
        imageUrl: null,
        category: "Acessórios Moto",
        family: mem.family,
        statusBefore: mem.status,
        priceCents: mem.priceCents,
        originalPriceCents: null,
        claimedDiscountRate: null,
        ratingStar: mem.ratingStar,
        salesLabel: mem.salesLabel,
        salesCount: mem.salesCount,
        observedAt: mem.observedAt,
        observationCount: mem.observationCount,
        historyDays: 7,
        previousMinPriceCents: null,
        lowestVerified: mem.lowestVerified,
        signalsShown: [],
        provenance: {
          presentingCaptureRunId: null,
          presentingMarketplace: null,
          planId: null,
          queryId: null,
          mode: null,
          targetCategory: null,
          targetFamily: null,
        },
      },
      {
        via: "bulk",
        groupId: group.groupId,
        reviewSessionId: sessionId,
        bulkActionId,
        policyVersion: "v1",
      },
    );
    assert.equal(snap.snapshot_version, CURATION_SNAPSHOT_VERSION);
    assert.equal(snap.snapshot.family.key, "manopla_esportiva");
    assert.equal(snap.snapshot.action.groupId, group.groupId);
    assert.equal(snap.snapshot.action.bulkActionId, bulkActionId);
  }

  // 5. Bulk Undo restaura perfeitamente os 30 produtos ao estado original
  for (const item of approvedTransitions) {
    const undoRestoration = stateRestoredByUndo({
      fromStatus: "pending",
      fromReasonCode: null,
      fromReasonDetail: null,
      fromDeferredUntil: null,
    });
    assert.equal(undoRestoration.status, "pending");
    assert.equal(undoRestoration.reasonCode, null);
  }

  for (const item of heldTransitions) {
    const undoRestoration = stateRestoredByUndo({
      fromStatus: "pending",
      fromReasonCode: null,
      fromReasonDetail: null,
      fromDeferredUntil: null,
    });
    assert.equal(undoRestoration.status, "pending");
    assert.equal(undoRestoration.reasonCode, null);
  }
});

test("M4-E Segurança: Grupo com hash divergente ou adulterado falha fechado", () => {
  const canonicalId = editorialGroupIdFor("local", family.key, family.method, family.version);
  const tamperedId = "grp_deadbeef12345678";

  assert.equal(matchesEditorialGroup(canonicalId, "local", family), true);
  assert.equal(matchesEditorialGroup(tamperedId, "local", family), false);

  // Mismatch de tenant
  assert.equal(matchesEditorialGroup(canonicalId, "outro_tenant", family), false);

  // Mismatch de família
  const otherFamily = { ...family, key: "outra_familia" };
  assert.equal(matchesEditorialGroup(canonicalId, "local", otherFamily), false);
});
