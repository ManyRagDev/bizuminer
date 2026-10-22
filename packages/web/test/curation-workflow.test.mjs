import assert from "node:assert/strict";
import test from "node:test";
import { selectionWorkflowState } from "../lib/curation-workflow.ts";

test("prontidão da pauta vem da seleção real e não da triagem ou auditoria", () => {
  const now = new Date("2026-10-10T16:00:00Z");
  const catalog = {schemaReady:true,mode:"catalog",count:24,validUntil:null};
  assert.equal(selectionWorkflowState(catalog,now).ready,true);
  assert.equal(selectionWorkflowState({...catalog,count:0},now).ready,false);
  assert.equal(selectionWorkflowState({...catalog,mode:"unavailable"},now).ready,false);
  assert.equal(selectionWorkflowState({...catalog,schemaReady:false},now).ready,false);
  assert.equal(selectionWorkflowState({...catalog,mode:"editorial",validUntil:"2026-10-10T15:00:00Z"},now).ready,false);
  assert.equal(selectionWorkflowState({...catalog,mode:"editorial",validUntil:"invalid"},now).ready,false);
  assert.equal(selectionWorkflowState({...catalog,mode:"editorial",validUntil:"2026-10-11T15:00:00Z"},now).ready,true);
});
