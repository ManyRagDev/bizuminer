import assert from "node:assert/strict";
import test from "node:test";
import { initialMarketingWorkspace } from "../lib/marketing-seed.ts";
import { validateWorkspace } from "../lib/marketing-contract.ts";
import { offerFromPauta, shareableLink } from "../lib/marketing-pauta.ts";
import {
  offerMessage,
  startRoutineDay,
  finishStep,
} from "../lib/marketing-routine.ts";
import {
  editorialStarterContents,
  withEditorialStarter,
  suggestedRoutineContent,
} from "../lib/marketing-editorial.ts";

const product = (extra = {}) => ({
  id: "selected-product",
  title: "Nome capturado",
  displayTitle: "Luminária para armário",
  priceCents: 8990,
  currency: "BRL",
  priceType: "exact",
  imageUrl: "https://example.com/photo.png",
  shareUrl: "https://www.bizuminer.com.br/p/Ab12",
  benefit: "Ilumina o interior do armário.",
  purchaseContents: "Uma barra de 40 cm",
  caveat: "Fonte não incluída na opção.",
  evidenceObservedAt: "2026-10-28T13:00:00Z",
  ...extra,
});

test("marketing prático: seleção traz os dados reais e preserva exatamente o link da pauta", () => {
  const p = product();
  const offer = offerFromPauta(p);
  assert.equal(offer.name, p.displayTitle);
  assert.equal(offer.variant, p.purchaseContents);
  assert.equal(offer.reason, p.benefit);
  assert.equal(offer.conditions, p.caveat);
  assert.equal(offer.url, p.shareUrl);
  assert.equal(offer.imageUrl, p.imageUrl);
  assert.equal(offer.price, "89,90");
  assert.match(offer.priceLabel, /89,90/);
  assert.equal(offer.verifiedAt, "");
  assert.equal(offer.capturedAt, p.evidenceObservedAt.replace("Z", ".000Z"));
  const message = offerMessage(offer);
  assert.match(message, /capturado em 28\/10\/2026/);
  assert.doesNotMatch(message, /Conferido em/);
  assert.ok(message.includes(p.shareUrl));
  const w = startRoutineDay(
    withEditorialStarter(initialMarketingWorkspace()),
    "2026-10-29",
  );
  w.routine.days[0].offer = offer;
  assert.equal(
    validateWorkspace(w).routine.days[0].offer.priceLabel,
    offer.priceLabel,
  );
});
test("marketing prático: preços a partir de, faixas e moeda não confirmada mantêm o contexto", () => {
  const from = offerFromPauta(
    product({ priceType: "from", priceMinCents: 3990 }),
  );
  assert.match(from.priceLabel, /a partir de/);
  assert.equal(from.price, "");
  const range = offerFromPauta(
    product({ priceType: "range", priceMinCents: 3990, priceMaxCents: 8990 }),
  );
  assert.match(range.priceLabel, /39,90.* a .*89,90/);
  assert.equal(range.price, "");
  for (const currency of [undefined, "unknown"]) {
    const unknown = offerFromPauta(product({ currency }));
    assert.match(unknown.priceLabel, /moeda não confirmada/);
    assert.doesNotMatch(offerMessage(unknown), /R\$/);
  }
  const usd = offerFromPauta(product({ currency: "USD" }));
  assert.doesNotMatch(offerMessage(usd), /R\$/);
});
test("marketing prático: campos ausentes não viram fatos inventados ou links inseguros", () => {
  const offer = offerFromPauta(
    product({
      purchaseContents: undefined,
      benefit: undefined,
      caveat: undefined,
      evidenceObservedAt: null,
      priceCents: 0,
      shareUrl: "javascript:alert(1)",
      imageUrl: "data:text/html,x",
    }),
  );
  assert.equal(offer.variant, "");
  assert.equal(offer.reason, "");
  assert.equal(offer.verifiedAt, "");
  assert.equal(offer.capturedAt, "");
  assert.equal(offer.priceLabel, "");
  assert.equal(offer.url, "");
  assert.equal(offer.imageUrl, "");
  assert.equal(shareableLink("https://user:secret@example.com"), "");
  assert.equal(shareableLink(product().shareUrl), product().shareUrl);
  assert.doesNotMatch(
    offerMessage(offer),
    /Versão:|Conferido em|R\$|Preço: *$/m,
  );
});
test("marketing prático: 12 roteiros preenchidos duram além da oferta sem inventar publicação ou artes", () => {
  const contents = editorialStarterContents();
  assert.equal(contents.length, 12);
  assert.deepEqual([...new Set(contents.map((c) => c.week))], [1, 2, 3, 4]);
  for (const content of contents) {
    assert.equal(content.body.split(/\n\s*\n/).length, 5);
    assert.ok(content.caption.trim());
    assert.ok(content.cta.trim());
    assert.ok(content.notes.includes("Imagem 5"));
    assert.ok(content.references.endsWith(".md"));
    assert.equal(content.stage, "draft");
    assert.deepEqual(content.assets, []);
    assert.ok(
      content.publications.every(
        (p) => !p.publishedDate && !p.url && !p.plannedDate,
      ),
    );
    assert.doesNotMatch(
      content.body + content.caption,
      /R\$|[0-9]+%|\[PRODUTO\]|\[PREÇO/,
    );
  }
});
test("marketing prático: pacote entra uma vez sem substituir edições, arquivos ou registros anteriores", () => {
  const old = initialMarketingWorkspace();
  old.contents[0].caption = "Meu texto preservado";
  old.scratchpad = "Minha nota";
  const prepared = withEditorialStarter(old);
  assert.equal(prepared.contents.length, 24);
  assert.equal(
    prepared.contents.find((c) => c.id === old.contents[0].id).caption,
    "Meu texto preservado",
  );
  assert.equal(prepared.scratchpad, old.scratchpad);
  prepared.contents[0].caption = "Editei um roteiro";
  assert.equal(withEditorialStarter(prepared), prepared);
  assert.equal(
    withEditorialStarter(prepared).contents[0].caption,
    "Editei um roteiro",
  );
  validateWorkspace(prepared);
});
test("marketing prático: dia começa com roteiro e retoma preparo; publicação real libera o seguinte", () => {
  let w = withEditorialStarter(initialMarketingWorkspace());
  const first = suggestedRoutineContent(w).id;
  w = startRoutineDay(w, "2026-10-29");
  assert.equal(w.routine.days[0].contentId, first);
  w = startRoutineDay(w, "2026-10-30");
  assert.equal(w.routine.days[1].contentId, first);
  w.contents.find((c) => c.id === first).publications[0].publishedDate =
    "2026-10-30";
  const second = suggestedRoutineContent(w).id;
  assert.notEqual(second, first);
  w = startRoutineDay(w, "2026-10-31");
  assert.equal(w.routine.days[2].contentId, second);
});
test("marketing prático: concluir publicação sem URL libera o próximo roteiro; preparar mantém o atual", () => {
  let w = startRoutineDay(
    withEditorialStarter(initialMarketingWorkspace()),
    "2026-10-28",
  );
  const first = w.routine.days[0].contentId;
  w = finishStep(w, "2026-10-28", "content");
  w = startRoutineDay(w, "2026-10-29");
  assert.equal(w.routine.days[1].contentId, first);
  w = finishStep(w, "2026-10-29", "content");
  w = startRoutineDay(w, "2026-10-30");
  assert.notEqual(w.routine.days[2].contentId, first);
  assert.ok(
    w.contents.every((c) =>
      c.publications.every((p) => !p.publishedDate && !p.url),
    ),
  );
});
test("marketing prático: concluir sem campos nunca fabrica envio, publicação ou arte", () => {
  let w = startRoutineDay(
    withEditorialStarter(initialMarketingWorkspace()),
    "2026-10-29",
  );
  for (const step of ["offer", "share", "content", "distribute", "close"])
    w = finishStep(w, "2026-10-29", step);
  const day = w.routine.days[0];
  assert.ok(Object.values(day.steps).every((s) => s.status === "done"));
  assert.equal(day.whatsappSent, false);
  assert.equal(day.storyPublished, false);
  assert.equal(day.offer.verifiedAt, "");
  assert.ok(
    w.contents.every(
      (c) =>
        !c.assets?.length &&
        c.publications.every((p) => !p.publishedDate && !p.url),
    ),
  );
  validateWorkspace(w);
});
