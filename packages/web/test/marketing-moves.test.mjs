import assert from "node:assert/strict";
import test from "node:test";
import { initialMarketingWorkspace } from "../lib/marketing-seed.ts";
import { contentStage, validateWorkspace } from "../lib/marketing-contract.ts";
import {
  moveMarketingContent,
  rescheduleMarketingPublication,
} from "../lib/marketing-moves.ts";

test("kanban: muda etapa e ordem sem mutar o espaço original", () => {
  const base = initialMarketingWorkspace();
  const moved = moveMarketingContent(base, "plan-1", "production");
  assert.equal(
    moved.contents.find((c) => c.id === "plan-1").stage,
    "production",
  );
  assert.equal(base.contents[0].stage, "draft");
  const reordered = moveMarketingContent(moved, "plan-3", "draft", "plan-2");
  assert.deepEqual(
    reordered.contents.slice(0, 2).map((c) => c.id),
    ["plan-3", "plan-2"],
  );
  assert.equal(validateWorkspace(reordered).contents.length, 12);
  assert.equal(moveMarketingContent(base, "plan-1", "draft", "plan-1"), base);
  assert.equal(moveMarketingContent(base, "plan-12", "draft"), base);
});
test("kanban: arrastar não cria nem apaga registros de publicação", () => {
  const base = initialMarketingWorkspace();
  assert.throws(
    () => moveMarketingContent(base, "plan-1", "published"),
    /data real/,
  );
  base.contents[0].publications[0].publishedDate = "2026-10-09";
  assert.throws(
    () => moveMarketingContent(base, "plan-1", "draft"),
    /histórico/,
  );
  assert.equal(contentStage(base.contents[0]), "published");
  assert.equal(base.contents[0].publications[0].publishedDate, "2026-10-09");
  base.contents[1].archived = true;
  assert.throws(
    () => moveMarketingContent(base, "plan-2", "ready"),
    /indisponível/,
  );
  assert.throws(() => moveMarketingContent(base, "missing", "ready"));
  assert.throws(
    () => moveMarketingContent(base, "plan-3", "ready", "plan-1"),
    /Destino/,
  );
});
test("calendário: agenda, reagenda e retira data de somente um canal", () => {
  const base = initialMarketingWorkspace();
  base.contents[0].publications.push({
    id: "facebook",
    channel: "Facebook",
    plannedDate: "2026-10-18",
    publishedDate: "",
    url: "https://facebook.com/example",
  });
  const scheduled = rescheduleMarketingPublication(
    base,
    "plan-1",
    "publication-1",
    "2026-10-15",
  );
  const next = rescheduleMarketingPublication(
    scheduled,
    "plan-1",
    "publication-1",
    "2026-11-02",
  );
  assert.equal(next.contents[0].publications[0].plannedDate, "2026-11-02");
  assert.deepEqual(
    next.contents[0].publications[1],
    base.contents[0].publications[1],
  );
  assert.equal(base.contents[0].publications[0].plannedDate, "");
  assert.equal(validateWorkspace(next).contents[0].stage, "draft");
  const unscheduled = rescheduleMarketingPublication(
    next,
    "plan-1",
    "publication-1",
    "",
  );
  assert.equal(unscheduled.contents[0].publications[0].plannedDate, "");
  assert.equal(
    rescheduleMarketingPublication(unscheduled, "plan-1", "publication-1", ""),
    unscheduled,
  );
});
test("calendário: protege histórico e rejeita destino e origem inválidos", () => {
  const base = initialMarketingWorkspace();
  assert.throws(
    () =>
      rescheduleMarketingPublication(
        base,
        "plan-1",
        "publication-1",
        "2026-02-30",
      ),
    /válida/,
  );
  assert.throws(
    () =>
      rescheduleMarketingPublication(base, "plan-1", "missing", "2026-10-10"),
    /indisponível/,
  );
  base.contents[0].publications[0].publishedDate = "2026-10-09";
  assert.throws(
    () =>
      rescheduleMarketingPublication(
        base,
        "plan-1",
        "publication-1",
        "2026-10-10",
      ),
    /já feitas/,
  );
  assert.equal(base.contents[0].publications[0].publishedDate, "2026-10-09");
  base.contents[1].archived = true;
  assert.throws(
    () =>
      rescheduleMarketingPublication(
        base,
        "plan-2",
        "publication-2",
        "2026-10-10",
      ),
    /indisponível/,
  );
});
