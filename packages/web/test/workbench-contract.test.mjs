import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_PRIORITY_RANK,
  compareWorkbenchActions,
  encodeWorkbenchCursor,
  decodeWorkbenchCursor,
} from "../lib/workbench-contract.ts";

test("ACTION_PRIORITY_RANK define hierarquia determinística e completa", () => {
  assert.ok(ACTION_PRIORITY_RANK.review_curation < ACTION_PRIORITY_RANK.review_evidence);
  assert.ok(ACTION_PRIORITY_RANK.review_evidence < ACTION_PRIORITY_RANK.approve_kit);
  assert.ok(ACTION_PRIORITY_RANK.approve_kit < ACTION_PRIORITY_RANK.export_kit);
  assert.ok(ACTION_PRIORITY_RANK.export_kit < ACTION_PRIORITY_RANK.confirm_publication);
  assert.ok(ACTION_PRIORITY_RANK.confirm_publication < ACTION_PRIORITY_RANK.create_kit_draft);
  assert.ok(ACTION_PRIORITY_RANK.create_kit_draft < ACTION_PRIORITY_RANK.revise_kit);
  assert.ok(ACTION_PRIORITY_RANK.revise_kit < ACTION_PRIORITY_RANK.monitor_radar);
  assert.ok(ACTION_PRIORITY_RANK.monitor_radar < ACTION_PRIORITY_RANK.none);
});

test("compareWorkbenchActions prioriza por tipo de ação no funil de negócio", () => {
  const curationAct = {
    id: "act-1",
    actionType: "review_curation",
    label: "Triagem",
    href: "/curadoria",
    actionableSince: "2026-10-21T10:00:00.000Z",
  };

  const draftAct = {
    id: "act-2",
    actionType: "create_kit_draft",
    label: "Criar Kit",
    href: "/campanhas",
    actionableSince: "2026-10-20T10:00:00.000Z", // Mais antigo, mas menor prioridade
  };

  assert.ok(compareWorkbenchActions(curationAct, draftAct) < 0, "Curadoria deve preceder rascunho de kit");
  assert.ok(compareWorkbenchActions(draftAct, curationAct) > 0);
});

test("compareWorkbenchActions desempata por actionableSince ASC para ações de mesmo tipo", () => {
  const olderAct = {
    id: "act-old",
    actionType: "create_kit_draft",
    label: "Criar Kit 1",
    href: "/campanhas",
    actionableSince: "2026-10-20T08:00:00.000Z",
  };

  const newerAct = {
    id: "act-new",
    actionType: "create_kit_draft",
    label: "Criar Kit 2",
    href: "/campanhas",
    actionableSince: "2026-10-20T12:00:00.000Z",
  };

  assert.ok(compareWorkbenchActions(olderAct, newerAct) < 0, "Ação mais antiga deve vir primeiro");
  assert.ok(compareWorkbenchActions(newerAct, olderAct) > 0);
});

test("encodeWorkbenchCursor e decodeWorkbenchCursor preservam os dados estáveis", () => {
  const time = "2026-10-21T10:15:30.000Z";
  const productId = "prod-abc-123";

  const cursor = encodeWorkbenchCursor(time, productId);
  assert.equal(typeof cursor, "string");
  assert.ok(cursor.length > 0);

  const decoded = decodeWorkbenchCursor(cursor);
  assert.ok(decoded !== null);
  assert.equal(decoded.actionableSince, time);
  assert.equal(decoded.productId, productId);
});

test("decodeWorkbenchCursor falha fechado com entradas corrompidas ou inválidas", () => {
  assert.equal(decodeWorkbenchCursor(""), null);
  assert.equal(decodeWorkbenchCursor("invalid-base64-content!@#$"), null);
  assert.equal(decodeWorkbenchCursor(Buffer.from("sem-separador").toString("base64url")), null);
  assert.equal(decodeWorkbenchCursor(Buffer.from("||").toString("base64url")), null);
});
