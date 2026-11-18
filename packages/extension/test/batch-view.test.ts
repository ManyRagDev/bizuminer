import assert from "node:assert/strict";
import test from "node:test";
import { formatBatchState } from "../src/popup/batch-view.ts";

test("an existing draft reopens as resume and only an explicitly replaceable unsent draft can refresh", () => {
  assert.equal(formatBatchState({}).prepareLabel, "Ler anúncios desta página");
  const state = { hasBatch: true, canReplace: true, sent: false, queued: false,
    capturedAt: "2026-11-12T17:38:46Z", preparedVersion: "0.3.6" };
  const view = formatBatchState(JSON.parse(JSON.stringify(state)));
  assert.equal(view.prepareLabel, "Retomar leitura");
  assert.equal(view.canReplace, true);
  assert.match(view.guidance, /só substitui.*sucesso/);
  assert.equal(view.metadata[1], "Versão da coleta: 0.3.6");
  for (const blocked of [{ ...state, sent: true }, { ...state, queued: true },
    { ...state, canReplace: false }, { hasBatch: true }, { ...state, hasBatch: false }]) {
    const result = formatBatchState(blocked);
    assert.equal(result.canReplace, false);
    if (blocked.hasBatch) assert.match(result.guidance, /pode já ter sido recebida.*Descartar leitura/);
  }
});
test("legacy drafts never display the current release as their collector version", () => {
  const view = formatBatchState({ hasBatch: true, capturedAt: "2026-11-12T17:38:46Z" });
  assert.match(view.metadata[0]!, /^Coleta:/);
  assert.equal(view.metadata[1], "Versão da coleta: versão não registrada; leitura anterior");
  const unsafe = formatBatchState({ hasBatch: true, capturedAt: '<script>secret</script>', preparedVersion: 'https://secret.test' });
  assert.equal(unsafe.metadata[0], "Coleta: horário não registrado");
  assert.doesNotMatch(JSON.stringify(unsafe), /script|secret/);
});
