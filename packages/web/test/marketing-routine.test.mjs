import assert from "node:assert/strict";
import test from "node:test";
import { initialMarketingWorkspace } from "../lib/marketing-seed.ts";
import { ROUTINE_STEPS, validateWorkspace } from "../lib/marketing-contract.ts";
import {
  changeRoutineOffer,
  contentIssue,
  createRoutineContent,
  finishStep,
  isFeedDay,
  isStoryDay,
  newRoutineDay,
  offerIssue,
  offerMessage,
  plannedSteps,
  startRoutineDay,
  stepIssue,
  stepMinutes,
  updateRoutineDay,
} from "../lib/marketing-routine.ts";
import { loadMarketing, saveMarketing } from "../lib/marketing-storage-core.ts";

const today = "2026-10-29";
const validOffer = () => ({
  name: "Luminária",
  variant: "Modelo 40 cm",
  reason: "Ilumina o interior do armário.",
  price: "89,90",
  conditions: "Pix; frete conforme CEP.",
  url: "https://example.com/afiliado",
  imageUrl: "",
  verifiedAt: "2026-10-29T13:00:00Z",
});
function working() {
  let w = startRoutineDay(initialMarketingWorkspace(), today);
  return updateRoutineDay(w, today, (d) => ({ ...d, offer: validOffer() }));
}
function active(w) {
  return w.routine.days.find((d) => d.date === w.routine.activeDate);
}

test("rotina: dados anteriores ganham rotina vazia sem perder textos, ideias ou publicações", () => {
  const old = initialMarketingWorkspace();
  old.contents[0].caption = "Meu texto";
  old.scratchpad = "Minha anotação";
  const result = validateWorkspace(old);
  assert.deepEqual(result.routine, { activeDate: "", groupUrl: "", days: [] });
  assert.equal(result.contents[0].caption, "Meu texto");
  assert.equal(result.scratchpad, "Minha anotação");
  assert.deepEqual(
    result.contents[0].publications,
    old.contents[0].publications,
  );
});
test("rotina: reabrir o dia não duplica nem apaga progresso e dias novos não herdam conferência", () => {
  let w = finishStep(working(), today, "offer", undefined, today);
  w = startRoutineDay(w, today);
  assert.equal(w.routine.days.length, 1);
  assert.equal(active(w).currentStep, "share");
  assert.equal(active(w).steps.offer.status, "done");
  w = startRoutineDay(w, "2026-10-30");
  assert.equal(w.routine.days.length, 2);
  assert.equal(active(w).offer.verifiedAt, "");
  w = startRoutineDay(w, today);
  assert.equal(active(w).currentStep, "share");
});
test("rotina: lembretes de conferência não impedem concluir com campos opcionais vazios", () => {
  const offer = validOffer();
  assert.equal(offerIssue(offer, today), "");
  for (const change of [
    { url: "javascript:alert(1)" },
    { url: "https://user:password@example.com" },
    { verifiedAt: "2026-10-28T13:00:00Z" },
  ])
    assert.ok(offerIssue({ ...offer, ...change }, today));
  const w = startRoutineDay(initialMarketingWorkspace(), today);
  const completed = finishStep(w, today, "offer", undefined, today);
  assert.equal(active(completed).steps.offer.status, "done");
  assert.equal(active(completed).currentStep, "share");
  assert.equal(active(completed).offer.verifiedAt, "");
  assert.equal(active(completed).whatsappSent, false);
});
test("rotina: adiar aceita motivo opcional, preserva pendência e avança sem concluir", () => {
  assert.equal(
    active(finishStep(working(), today, "offer", " ", today)).steps.offer.note,
    "Retomar esta etapa depois.",
  );
  const w = finishStep(
    working(),
    today,
    "offer",
    "Falta confirmar a versão",
    today,
  );
  assert.equal(active(w).steps.offer.status, "deferred");
  assert.equal(active(w).steps.offer.note, "Falta confirmar a versão");
  assert.equal(active(w).currentStep, "share");
  assert.equal(
    validateWorkspace(w).routine.days[0].steps.offer.status,
    "deferred",
  );
});
test("rotina: gerar mensagem não confirma envio e quinta exige WhatsApp e Story", () => {
  let w = working();
  assert.match(offerMessage(active(w).offer), /R\$ 89,90/);
  assert.match(offerMessage(active(w).offer), /comissão/);
  assert.ok(stepIssue(active(w), w, "share", today));
  w = updateRoutineDay(w, today, (d) => ({ ...d, whatsappSent: true }));
  assert.match(stepIssue(active(w), w, "share", today), /Story/);
  w = updateRoutineDay(w, today, (d) => ({ ...d, storyPublished: true }));
  assert.equal(stepIssue(active(w), w, "share", today), "");
  assert.ok(
    stepIssue(active(w), w, "share", "2026-10-30"),
    "oferta precisa de nova conferência no dia seguinte",
  );
});
test("rotina: alterar a oferta desfaz as confirmações de conferência e divulgação anteriores", () => {
  let w = finishStep(working(), today, "offer", undefined, today);
  w = updateRoutineDay(w, today, (d) => ({
    ...d,
    whatsappSent: true,
    storyPublished: true,
  }));
  w = finishStep(w, today, "share", undefined, today);
  const day = active(w);
  const edited = changeRoutineOffer(day, {
    ...day.offer,
    price: "79,90",
    verifiedAt: "",
  });
  assert.equal(edited.steps.offer.status, "todo");
  assert.equal(edited.steps.share.status, "todo");
  assert.equal(edited.whatsappSent, false);
  assert.equal(edited.storyPublished, false);
  assert.equal(changeRoutineOffer(day, { ...day.offer }), day);
});
test("rotina: prévia de texto não é arte pronta nem publicação no Instagram", () => {
  let w = working();
  let content = createRoutineContent(
    active(w),
    "new-content",
    "new-publication",
  );
  assert.equal(content.publications[0].plannedDate, today);
  assert.match(contentIssue(content, false, today), /4 imagens finais/);
  content.assets = [0, 1, 2, 3].map((i) => ({
    id: "asset-" + i,
    name: "imagem-" + i + ".png",
  }));
  assert.equal(contentIssue(content, false, today), "");
  assert.ok(contentIssue(content, true, today));
  content.publications[0].publishedDate = today;
  content.publications[0].url = "https://example.com/post";
  assert.ok(contentIssue(content, true, today));
  content.publications[0].url = "https://www.instagram.com/p/real-publication/";
  assert.equal(contentIssue(content, true, today), "");
  assert.ok(
    contentIssue(content, true, "2026-10-30"),
    "post antigo não pode concluir a publicação de hoje",
  );
  w = { ...w, contents: [...w.contents, content] };
  w = updateRoutineDay(w, today, (d) => ({ ...d, contentId: content.id }));
  assert.equal(
    finishStep(w, today, "content", undefined, today).routine.days[0].steps
      .content.status,
    "done",
  );
});
test("rotina: dias úteis reservam 60 minutos, fim de semana 20 e domingo só atendimento e fechamento", () => {
  for (const date of [today, "2026-10-30"]) {
    assert.equal(
      plannedSteps(date).reduce((sum, key) => sum + stepMinutes(date, key), 0),
      60,
    );
  }
  for (const date of ["2026-10-31", "2026-11-01"]) {
    assert.equal(
      plannedSteps(date).reduce((sum, key) => sum + stepMinutes(date, key), 0),
      20,
    );
  }
  const sunday = newRoutineDay("2026-11-01");
  assert.equal(sunday.currentStep, "distribute");
  assert.equal(sunday.steps.offer.status, "not_planned");
  assert.equal(isFeedDay("2026-10-31"), true);
  assert.equal(isStoryDay("2026-10-30"), false);
});
test("rotina: valida referências, datas duplicadas, URLs e limites antes de persistir", () => {
  const w = working();
  assert.equal(validateWorkspace(w).routine.activeDate, today);
  for (const change of [
    (routine) => {
      routine.days.push(structuredClone(routine.days[0]));
    },
    (routine) => {
      routine.activeDate = "2026-10-30";
    },
    (routine) => {
      routine.days[0].contentId = "missing";
    },
    (routine) => {
      routine.groupUrl = "javascript:alert(1)";
    },
    (routine) => {
      routine.days[0].offer.imageUrl = "data:text/html,script";
    },
    (routine) => {
      routine.days[0].summary = "a".repeat(4001);
    },
  ]) {
    const bad = structuredClone(w);
    change(bad.routine);
    assert.throws(() => validateWorkspace(bad));
  }
});
test("rotina: salvamento e nova leitura preservam etapa, material e pendência por dono", async () => {
  const rows = new Map();
  const storage = {
    async exclusive(owner, task) {
      return task();
    },
    async read(owner) {
      return structuredClone(rows.get(owner) ?? null);
    },
    async write(owner, value) {
      rows.set(owner, structuredClone(value));
    },
  };
  const first = await loadMarketing(storage, "owner-a");
  let w = startRoutineDay(first.workspace, today);
  w = finishStep(w, today, "content", "Faltam as imagens", today);
  await saveMarketing(storage, "owner-a", first.revision, w);
  const reopened = await loadMarketing(storage, "owner-a");
  assert.equal(reopened.revision, 2);
  assert.equal(
    reopened.workspace.routine.days[0].steps.content.note,
    "Faltam as imagens",
  );
  assert.deepEqual(
    (await loadMarketing(storage, "owner-b")).workspace.routine.days,
    [],
  );
  assert.equal(ROUTINE_STEPS.length, 5);
});
