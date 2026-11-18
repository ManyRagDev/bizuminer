import assert from "node:assert/strict";
import test from "node:test";
import { curationNextStep, selectionWorkflowState } from "../lib/curation-workflow.ts";

test("a próxima ação acompanha a fila real sem confundir ausência de candidatos com análise concluída", () => {
  const empty = { triageEligible: 0, awaiting: 0, held: 0, deferred: 0 };
  assert.equal(curationNextStep({ ...empty, triageEligible: 12, awaiting: 3 }).kind, "triage");
  assert.equal(curationNextStep({ ...empty, awaiting: 3 }).href, "/admin/curadoria?aba=excecoes&sub=singulars");
  assert.equal(curationNextStep({ ...empty, held: 2 }).href, "/admin/curadoria?aba=excecoes&sub=retidos");
  const idle = curationNextStep({ ...empty, pautaCount: 2 });
  assert.equal(idle.href, "/pauta");
  assert.match(idle.description, /Capturas em andamento/);
  assert.doesNotMatch(idle.description, /todas.*analisadas|prontas para/i);
  const deferred = curationNextStep({ ...empty, deferred: 2, pautaCount: 2 });
  assert.equal(deferred.kind, "pauta");
  assert.match(deferred.description, /adiados/);
});

test("filas vazias não anunciam pauta pronta quando capturas ou elegibilidade estão bloqueadas", () => {
  const empty = { triageEligible: 0, awaiting: 0, held: 0, deferred: 0, pautaCount: 0 };
  assert.equal(curationNextStep(empty).kind, "blocked");
  assert.equal(curationNextStep({ ...empty, pautaCount: null }).kind, "unavailable");
  assert.equal(curationNextStep({ ...empty, incompleteCaptures: 1 }).action, "Conferir captura incompleta");
  assert.equal(curationNextStep({ ...empty, runningCaptures: 1 }).action, "Acompanhar capturas");
  assert.equal(curationNextStep({ ...empty, pautaCount: 3, runningCaptures: 1 }).kind, "pauta");
});

test("prontidão da pauta vem da seleção real e não da triagem ou auditoria", () => {
  const now = new Date("2026-10-10T16:00:00Z");
  const catalog = {schemaReady:true,mode:"catalog",count:24,validUntil:null};
  assert.equal(selectionWorkflowState(catalog,now).ready,true);
  assert.equal(selectionWorkflowState({...catalog,count:0},now).ready,false);
  assert.match(selectionWorkflowState({...catalog,count:0},now).label,/destaques ainda não preparados/);
  assert.equal(selectionWorkflowState({...catalog,count:0,homepageReady:true},now).label,"Sem produtos selecionados");
  assert.equal(selectionWorkflowState({...catalog,mode:"unavailable"},now).ready,false);
  assert.equal(selectionWorkflowState({...catalog,schemaReady:false},now).ready,false);
  assert.equal(selectionWorkflowState({...catalog,mode:"editorial",validUntil:"2026-10-10T15:00:00Z"},now).ready,false);
  assert.equal(selectionWorkflowState({...catalog,mode:"editorial",validUntil:"invalid"},now).ready,false);
  assert.equal(selectionWorkflowState({...catalog,mode:"editorial",validUntil:"2026-10-11T15:00:00Z"},now).ready,true);
});
