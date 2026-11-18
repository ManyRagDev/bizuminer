import assert from "node:assert/strict";
import test from "node:test";
import { automatedTriageFailureMessage } from "../lib/triage-feedback.ts";

test("authentication and exhausted budget explain the intervention needed without suggesting blind retries", () => {
  const auth = automatedTriageFailureMessage("openrouter_authentication_failed");
  assert.match(auth, /credencial.*expirou/);
  assert.match(auth, /Atualize.*antes de tentar novamente/);
  assert.match(auth, /capturas continuam salvas/);
  const quota = automatedTriageFailureMessage("openrouter_budget_exhausted");
  assert.match(quota, /orçamento.*esgotou/);
  assert.match(quota, /limite e o saldo/);
  assert.notEqual(auth, quota);
  assert.match(automatedTriageFailureMessage("ai_curation_call_limit_reached"), /20 chamadas.*atingido/);
  assert.match(automatedTriageFailureMessage("ai_curation_call_budget_unavailable"), /Nenhuma nova requisição.*sem essa proteção/);
});

test("unknown or uncertain failures never expose arbitrary messages or promise that a retry is safe", () => {
  for (const code of ["openrouter_timeout", "openrouter_transport_failed", "openrouter_response_invalid", "triage_incomplete", null, "provider-body synthetic-secret"])
    assert.match(automatedTriageFailureMessage(code), /histórico/);
  const message = automatedTriageFailureMessage("provider-body synthetic-secret");
  assert.ok(!message.includes("synthetic-secret"));
  assert.ok(!message.includes("provider-body"));
  assert.match(automatedTriageFailureMessage("triage_in_progress"), /em andamento/);
});
