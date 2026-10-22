import assert from "node:assert/strict";
import test from "node:test";
import { initialMarketingWorkspace } from "../lib/marketing-seed.ts";
import {
  validateWorkspace,
  contentStage,
  saoPauloToday,
  validDay,
} from "../lib/marketing-contract.ts";
import {
  loadMarketing,
  saveMarketing,
  parseSnapshot,
  MarketingConflict,
} from "../lib/marketing-storage-core.ts";

function memoryStorage() {
  const data = new Map();
  const queues = new Map();
  return {
    data,
    async exclusive(owner, task) {
      const pending = queues.get(owner) || Promise.resolve();
      const next = pending.catch(() => {}).then(task);
      queues.set(owner, next);
      return next;
    },
    async read(owner) {
      return structuredClone(data.get(owner) ?? null);
    },
    async write(owner, value) {
      data.set(owner, structuredClone(value));
    },
  };
}
test("marketing: carga nova tem 12 rascunhos e não inventa datas ou vídeos obrigatórios", () => {
  const w = validateWorkspace(initialMarketingWorkspace());
  assert.equal(w.contents.length, 12);
  assert.deepEqual([...new Set(w.contents.map((c) => c.week))], [1, 2, 3, 4]);
  assert.equal(w.contents.filter((c) => c.format === "Carrossel").length, 8);
  assert.equal(w.contents.filter((c) => c.format === "Imagem").length, 4);
  assert.ok(
    w.contents.every(
      (c) => contentStage(c) === "draft" && !c.publications[0].plannedDate,
    ),
  );
});
test("marketing: datas reais e fuso brasileiro", () => {
  assert.equal(validDay("2026-02-30"), false);
  assert.equal(validDay("2028-02-29"), true);
  assert.equal(validDay("09/10/2026"), false);
  assert.equal(saoPauloToday(new Date("2026-10-10T01:00:00Z")), "2026-10-09");
});
test("marketing: publicar um canal não apaga o planejamento do outro", () => {
  const w = initialMarketingWorkspace();
  const c = w.contents[0];
  c.stage = "ready";
  c.publications[0].publishedDate = "2026-10-09";
  c.publications.push({
    id: "other",
    channel: "Facebook",
    plannedDate: "2026-10-15",
    publishedDate: "",
    url: "",
  });
  assert.equal(contentStage(validateWorkspace(w).contents[0]), "published");
  assert.equal(c.publications[1].publishedDate, "");
  c.publications[0].publishedDate = "";
  assert.equal(contentStage(c), "ready");
});
test("marketing: valida títulos, links, limites, ids e referências de conversão", () => {
  const base = initialMarketingWorkspace();
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://user:password@example.com",
  ]) {
    const w = structuredClone(base);
    w.contents[0].publications[0].url = bad;
    assert.throws(() => validateWorkspace(w));
  }
  const good = structuredClone(base);
  good.contents[0].publications[0].url = "https://instagram.com/p/example";
  assert.equal(
    validateWorkspace(good).contents[0].publications[0].url,
    good.contents[0].publications[0].url,
  );
  const blank = structuredClone(base);
  blank.contents[0].title = " ";
  assert.throws(() => validateWorkspace(blank));
  const duplicate = structuredClone(base);
  duplicate.contents[0].publications[0].id = duplicate.contents[0].id;
  assert.throws(() => validateWorkspace(duplicate));
  const badDay = structuredClone(base);
  badDay.contents[0].publications[0].plannedDate = "2026-02-30";
  assert.throws(() => validateWorkspace(badDay));
  const idea = {
    id: "idea",
    title: "Pergunta",
    text: "Texto",
    tags: "",
    color: "mint",
    convertedTo: "plan-1",
    archived: false,
  };
  assert.equal(validateWorkspace({ ...base, ideas: [idea] }).ideas.length, 1);
  assert.throws(() =>
    validateWorkspace({
      ...base,
      ideas: [{ ...idea, convertedTo: "missing" }],
    }),
  );
  const large = structuredClone(base);
  large.contents[0].headline = "a".repeat(501);
  assert.throws(() => validateWorkspace(large));
});
test("marketing: seed é aplicado apenas uma vez e dados são separados por dono", async () => {
  const store = memoryStorage();
  const first = await loadMarketing(store, "owner-a");
  first.workspace.contents[0].title = "Minha edição";
  await saveMarketing(store, "owner-a", first.revision, first.workspace);
  assert.equal(
    (await loadMarketing(store, "owner-a")).workspace.contents[0].title,
    "Minha edição",
  );
  assert.equal(
    (await loadMarketing(store, "owner-b")).workspace.contents[0].title,
    "Conheça o BizuMiner",
  );
});
test("marketing: salvamentos concorrentes não sobrescrevem outra revisão", async () => {
  const store = memoryStorage();
  const first = await loadMarketing(store, "owner");
  const a = structuredClone(first.workspace);
  a.scratchpad = "Primeira aba";
  const b = structuredClone(first.workspace);
  b.scratchpad = "Segunda aba";
  const results = await Promise.allSettled([
    saveMarketing(store, "owner", 1, a),
    saveMarketing(store, "owner", 1, b),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    results.find((r) => r.status === "rejected").reason instanceof
      MarketingConflict,
  );
  assert.equal((await loadMarketing(store, "owner")).revision, 2);
  assert.equal(
    (await loadMarketing(store, "owner")).workspace.scratchpad,
    "Primeira aba",
  );
});
test("marketing: falha de upload não confirma revisão e leitura corrompida não aplica seed", async () => {
  const store = memoryStorage();
  await loadMarketing(store, "owner");
  const failed = {
    ...store,
    write: async () => {
      throw new Error("offline");
    },
  };
  await assert.rejects(
    saveMarketing(failed, "owner", 1, initialMarketingWorkspace()),
    /offline/,
  );
  assert.equal(store.data.get("owner").revision, 1);
  store.data.set("owner", { revision: 8, updatedAt: "invalid", workspace: {} });
  await assert.rejects(loadMarketing(store, "owner"));
  assert.equal(store.data.get("owner").revision, 8);
  assert.throws(() => parseSnapshot({}));
});
